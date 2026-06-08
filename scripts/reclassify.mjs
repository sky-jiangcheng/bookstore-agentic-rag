/**
 * Standalone reclassification script.
 *
 * Reads all active filter_keywords rules and recomputes books.library_types.
 * Idempotent and batch-processed for large datasets.
 *
 * Usage:
 *   node scripts/reclassify.mjs [--batch-size 500]
 *
 * Environment: POSTGRES_URL or DATABASE_URL must be set.
 */
import { createPool, sql } from '@vercel/postgres';
import { loadEnvFile } from './lib/load-env.mjs';

const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '200', 10);

async function main() {
  loadEnvFile();

  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    throw new Error('Missing POSTGRES_URL or DATABASE_URL');
  }

  const pool = createPool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  });

  // Load active rules
  const rulesResult = await pool.sql`
    SELECT DISTINCT fk.keyword, fk.category
    FROM filter_keywords fk
    INNER JOIN library_categories lc ON lc.code = fk.category
    WHERE fk.is_active = TRUE
    ORDER BY fk.category, fk.keyword
  `;
  const rules = rulesResult.rows;

  if (rules.length === 0) {
    console.log('No active rules found. Skipping.');
    await pool.end();
    return;
  }

  // Group by category
  const rulesByCategory = new Map();
  for (const rule of rules) {
    const list = rulesByCategory.get(rule.category) || [];
    list.push(rule.keyword);
    rulesByCategory.set(rule.category, list);
  }

  console.log(`Loaded ${rules.length} rules across ${rulesByCategory.size} categories`);

  let processed = 0;
  let lastId = '0';
  let hasMore = true;
  const updatedCategories = new Set();

  while (hasMore) {
    const batch = await pool.sql`
      SELECT id::text, title, category, COALESCE(description, '') AS description
      FROM books
      WHERE id > ${lastId}::bigint
      ORDER BY id ASC
      LIMIT ${BATCH_SIZE}
    `;

    if (batch.rows.length === 0) {
      hasMore = false;
      break;
    }

    for (const book of batch.rows) {
      const haystack = `${book.title} ${book.category} ${book.description}`.toLowerCase();
      const matched = [];

      for (const [category, keywords] of rulesByCategory) {
        if (keywords.some(kw => haystack.includes(kw.toLowerCase()))) {
          matched.push(category);
          updatedCategories.add(category);
        }
      }

      // Default to 公共馆
      if (matched.length === 0) {
        matched.push('公共馆');
        updatedCategories.add('公共馆');
      }

      await pool.sql`
        UPDATE books
        SET library_types = ${sql.array(matched)}::text[]
        WHERE id = ${book.id}::bigint
      `;

      processed += 1;
    }

    lastId = batch.rows[batch.rows.length - 1].id;

    if (processed % 1000 === 0 || batch.rows.length < BATCH_SIZE) {
      console.log(`Processed ${processed} books...`);
    }
  }

  // Update reclassified_at
  for (const code of updatedCategories) {
    await pool.sql`
      UPDATE library_categories SET reclassified_at = NOW(), updated_at = NOW() WHERE code = ${code}
    `;
  }

  console.log(`Reclassification complete: ${processed} books processed across ${updatedCategories.size} categories`);
  await pool.end();
}

main().catch(err => {
  console.error('Reclassification failed:', err);
  process.exit(1);
});

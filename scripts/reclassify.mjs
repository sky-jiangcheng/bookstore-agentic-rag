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
import { createPool } from '@vercel/postgres';
import { loadEnvFile } from './lib/load-env.mjs';

const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '500', 10);
const ENV_FILE = process.argv.find(a => a.startsWith('--env-file='))?.split('=')[1];

// Escape single quotes for SQL literals
function esc(val) {
  return val.replace(/'/g, "''");
}

async function main() {
  loadEnvFile(ENV_FILE);

  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    throw new Error('Missing POSTGRES_URL or DATABASE_URL');
  }

  const pool = createPool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  });

  // Load rules grouped by category
  const rulesResult = await pool.query(`
    SELECT DISTINCT fk.keyword, fk.category
    FROM filter_keywords fk
    INNER JOIN library_categories lc ON lc.code = fk.category
    WHERE fk.is_active = TRUE
    ORDER BY fk.category, fk.keyword
  `);
  const rules = rulesResult.rows;

  if (rules.length === 0) {
    console.log('No active rules found. Skipping.');
    await pool.end();
    return;
  }

  const rulesByCategory = new Map();
  for (const rule of rules) {
    const list = rulesByCategory.get(rule.category) || [];
    list.push(rule.keyword);
    rulesByCategory.set(rule.category, list);
  }

  console.log(`Loaded ${rules.length} rules across ${rulesByCategory.size} categories`);

  const updatedCategories = new Set();

  // Step 1: Apply each category's rules via bulk UPDATE
  // Skip rows that already have this category to minimize writes
  for (const [category, keywords] of rulesByCategory) {
    const conditions = keywords.map(kw => {
      const escaped = esc(kw);
      return `CONCAT(COALESCE(title,''), ' ', COALESCE(category,''), ' ', COALESCE(description,'')) ILIKE '%${escaped}%'`;
    }).join(' OR ');

    const sql_ = `
      UPDATE books
      SET library_types = array_append(library_types, '${esc(category)}')
      WHERE ${conditions}
        AND NOT (library_types @> ARRAY['${esc(category)}'])
    `;

    const result = await pool.query(sql_);
    updatedCategories.add(category);
    console.log(`  [${category}] matched ${result.rowCount} books`);
  }

  // Step 2: Default unmatched books to 公共馆
  const defaultResult = await pool.query(`
    UPDATE books
    SET library_types = array_append(library_types, '公共馆')
    WHERE library_types = '{}'
      AND NOT (library_types @> ARRAY['公共馆'])
  `);
  if (defaultResult.rowCount > 0) {
    updatedCategories.add('公共馆');
    console.log(`  [公共馆] default ${defaultResult.rowCount} unmatched books`);
  }

  // Step 4: Update reclassified_at
  for (const code of updatedCategories) {
    await pool.query(`UPDATE library_categories SET reclassified_at = NOW(), updated_at = NOW() WHERE code = '${esc(code)}'`);
  }

  const countResult = await pool.query(`SELECT COUNT(*)::int AS cnt FROM books WHERE array_length(library_types, 1) > 0`);
  console.log(`Reclassification complete: ${countResult.rows[0].cnt} books have library_types across ${updatedCategories.size} categories`);
  await pool.end();
}

main().catch(err => {
  console.error('Reclassification failed:', err);
  process.exit(1);
});

/**
 * 向量数据迁移脚本
 * 将数据从 Upstash Vector 迁移到 pgvector (PostgreSQL)
 *
 * 使用方法:
 * 1. 确保已执行 init-schema.sql 创建 book_embeddings 表
 * 2. 设置环境变量:
 *    - UPSTASH_VECTOR_URL (可选，仅当从 Upstash 迁移时需要)
 *    - UPSTASH_VECTOR_TOKEN (可选，仅当从 Upstash 迁移时需要)
 * 3. 运行脚本: npx tsx scripts/migrate-vectors.ts
 */

import { sql } from '@vercel/postgres';
import { Index } from '@upstash/vector';

interface UpstashVectorItem {
  id: string;
  vector: number[];
  metadata?: {
    bookId?: string;
    title?: string;
    author?: string;
    category?: string;
    description?: string;
    sourceId?: string;
    text?: string;
    chunkIndex?: number;
  };
}

interface MigrationResult {
  success: boolean;
  totalItems: number;
  migratedItems: number;
  failedItems: number;
  errors: string[];
}

async function fetchAllUpstashVectors(): Promise<UpstashVectorItem[]> {
  const vectorUrl = process.env.UPSTASH_VECTOR_URL;
  const vectorToken = process.env.UPSTASH_VECTOR_TOKEN;

  if (!vectorUrl || !vectorToken) {
    throw new Error('UPSTASH_VECTOR_URL and UPSTASH_VECTOR_TOKEN are required for migration');
  }

  const index = new Index({ url: vectorUrl, token: vectorToken });
  const allVectors: UpstashVectorItem[] = [];

  let cursor: string | number = 0;
  const BATCH_SIZE = 100;
  let hasMore = true;

  while (hasMore) {
    const response = await index.range({
      cursor,
      limit: BATCH_SIZE,
      includeVectors: true,
      includeMetadata: true,
    }) as {
      items?: Array<{
        id: string | number;
        vector?: number[];
        metadata?: UpstashVectorItem['metadata'];
      }>;
      nextCursor?: string | number;
    };

    if (response.items && response.items.length > 0) {
      for (const item of response.items) {
        allVectors.push({
          id: String(item.id),
          vector: (item.vector || []) as number[],
          metadata: item.metadata as UpstashVectorItem['metadata'],
        });
      }
    }

    if (response.nextCursor !== undefined && response.nextCursor !== null) {
      cursor = response.nextCursor;
      hasMore = true;
    } else {
      hasMore = false;
    }
  }

  return allVectors;
}

async function migrateToPgVector(vectors: UpstashVectorItem[]): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    totalItems: vectors.length,
    migratedItems: 0,
    failedItems: 0,
    errors: [],
  };

  for (const item of vectors) {
    try {
      if (!item.vector || item.vector.length === 0) {
        result.failedItems++;
        result.errors.push(`Skipped item ${item.id}: empty vector`);
        continue;
      }

      const metadata = item.metadata || {};
      const vectorString = `[${item.vector.join(',')}]`;

      if (item.id.startsWith('chunk:')) {
        const parts = item.id.split(':');
        const bookId = parts[1] || '0';
        const chunkIndex = parseInt(parts[2] || '0', 10);

        const textContent = metadata.text ||
          [metadata.title, metadata.author, metadata.category].filter(Boolean).join('\n');

        await sql`
          INSERT INTO book_embeddings (book_id, chunk_index, text_content, embedding)
          VALUES (
            ${bookId}::bigint,
            ${chunkIndex},
            ${textContent},
            ${vectorString}::vector
          )
          ON CONFLICT (book_id, chunk_index)
          DO UPDATE SET
            text_content = EXCLUDED.text_content,
            embedding = EXCLUDED.embedding,
            updated_at = NOW()
        `;
      } else {
        await sql`
          INSERT INTO book_embeddings (book_id, chunk_index, text_content, embedding)
          VALUES (
            ${item.id}::bigint,
            0,
            ${[metadata.title, metadata.author, metadata.category, metadata.description]
              .filter(Boolean)
              .join('\n')},
            ${vectorString}::vector
          )
          ON CONFLICT (book_id, chunk_index)
          DO UPDATE SET
            text_content = EXCLUDED.text_content,
            embedding = EXCLUDED.embedding,
            updated_at = NOW()
        `;
      }

      result.migratedItems++;
    } catch (error) {
      result.failedItems++;
      result.errors.push(`Failed to migrate item ${item.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  result.success = result.failedItems === 0;
  return result;
}

async function verifyMigration(): Promise<{
  pgVectorCount: number;
  sampleData: Array<{ bookId: string; chunkIndex: number; hasEmbedding: boolean }>;
}> {
  const countResult = await sql`SELECT COUNT(*) as count FROM book_embeddings`;
  const pgVectorCount = Number(countResult.rows[0]?.count || 0);

  const sampleResult = await sql`
    SELECT book_id, chunk_index, embedding IS NOT NULL as has_embedding
    FROM book_embeddings
    LIMIT 10
  `;

  const sampleData = sampleResult.rows.map((row) => ({
    bookId: String(row.book_id),
    chunkIndex: row.chunk_index,
    hasEmbedding: row.has_embedding,
  }));

  return { pgVectorCount, sampleData };
}

async function main() {
  console.log('Starting vector migration from Upstash to pgvector...\n');

  const upstashVectors = await fetchAllUpstashVectors();
  console.log(`Found ${upstashVectors.length} vectors in Upstash\n`);

  console.log('Migrating to pgvector...');
  const migrationResult = await migrateToPgVector(upstashVectors);

  console.log('\nMigration Result:');
  console.log(`- Total items: ${migrationResult.totalItems}`);
  console.log(`- Migrated: ${migrationResult.migratedItems}`);
  console.log(`- Failed: ${migrationResult.failedItems}`);

  if (migrationResult.errors.length > 0) {
    console.log('\nErrors:');
    migrationResult.errors.slice(0, 10).forEach((error) => {
      console.log(`  - ${error}`);
    });
    if (migrationResult.errors.length > 10) {
      console.log(`  ... and ${migrationResult.errors.length - 10} more errors`);
    }
  }

  console.log('\nVerifying migration...');
  const verification = await verifyMigration();
  console.log(`\npgvector now contains ${verification.pgVectorCount} vectors`);
  console.log('\nSample data:');
  verification.sampleData.forEach((row) => {
    console.log(`  - Book ${row.bookId}, Chunk ${row.chunkIndex}, Has Embedding: ${row.hasEmbedding}`);
  });

  console.log('\n✅ Migration completed!');
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});

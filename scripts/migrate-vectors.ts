/**
 * 向量数据迁移脚本 (已完成)
 *
 * 此脚本原用于将数据从 Upstash Vector 迁移到 pgvector (PostgreSQL)。
 *
 * 迁移已完成，Upstash Vector 已废弃。
 * 所有向量数据存储在 PostgreSQL 的 book_embeddings 表中。
 */

console.warn('Deprecated: Upstash Vector has been decommissioned. All vectors are stored in pgvector.');
process.exit(1);

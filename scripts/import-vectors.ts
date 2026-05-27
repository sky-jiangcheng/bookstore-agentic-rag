/**
 * 向量数据导入脚本 (Legacy)
 *
 * 此脚本原用于从 JSON 文件批量导入向量到 Upstash Vector。
 * Upstash Vector 已废弃，所有向量存储在 pgvector (PostgreSQL book_embeddings 表) 中。
 *
 * 如需重新索引书籍，请使用: npm run index:books
 * 该命令将读取 books 表并为每本书生成 embedding，存入 book_embeddings 表。
 */

console.warn('Deprecated: This script imported vectors into Upstash Vector, which is no longer in use.');
console.warn('Use `npm run index:books` to index books into pgvector instead.');
process.exit(1);

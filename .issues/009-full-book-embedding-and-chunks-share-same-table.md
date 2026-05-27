---
title: "全文向量和分块向量共存在 book_embeddings 表，键冲突设计不清晰"
labels: ["design", "medium"]
assignees: []
---

## 描述

`book_embeddings` 表通过 `(book_id, chunk_index)` 复合主键区分：

- **全文向量**：`upsertBookVector` 插入 `(bookId, 0, ...)` — `chunk_index = 0`
- **分块向量**：`upsertChunkVector` 插入 `(bookId, chunkIndex, ...)` — `chunk_index > 0`

这种设计导致：
1. `vectorSearchBooks` 和 `vectorSearchBooksDirect` 无法区分全文与分块，因为没有 `WHERE chunk_index = 0` 条件
2. `vectorSearchChunks` 同样未排除 `chunk_index = 0` 的全文记录
3. 如果某本书同时通过两种方式索引，`(book_id, 0)` 会互相覆盖

## 影响等级

🟡 **P3** — 搜索结果可能混入不匹配类型的向量

## 相关文件

- `lib/postgres-vector.ts:91-104` — upsertBookVector 用 chunk_index=0
- `lib/postgres-vector.ts:152-165` — upsertChunkVector 用 chunk_index>0
- `lib/postgres-vector.ts:115-136` — vectorSearchBooks 无 chunk_index 过滤
- `lib/postgres-vector.ts:180-220` — vectorSearchChunks 无 chunk_index 过滤

## 建议修复

1. 在每个查询中根据用途过滤 `chunk_index`：
   - `vectorSearchBooks` → `WHERE chunk_index = 0`
   - `vectorSearchChunks` → `WHERE chunk_index > 0`
2. 或为全文向量和分块向量使用不同的 `chunk_type` 字段

---
title: "向量维度不匹配：local-vector 生成 1536 维，pgvector 校验 768 维"
labels: ["bug", "critical"]
assignees: []
---

## 描述

`lib/local-vector.ts` 中 `DENSE_DIMENSIONS = 1536`，`buildDenseVector()` 默认输出 **1536 维**向量。

`lib/postgres-vector.ts` 中 `VECTOR_DIMENSION = 768`，`isValidVector()` 校验要求 **768 维**。

所有向量插入和搜索操作都会抛出 `Invalid vector dimension: expected 768, got 1536`，导致整个向量搜索模块**完全不可用**。

## 影响等级

🔴 **P0** — 阻塞 — 所有向量搜索、索引、推荐功能瘫痪

## 相关文件

- `lib/local-vector.ts:1` — `DENSE_DIMENSIONS = 1536`
- `lib/postgres-vector.ts:10` — `VECTOR_DIMENSION = 768`
- `lib/postgres-vector.ts:43-45` — `isValidVector()` 维度校验
- `lib/vector-service.ts:25` — `VECTOR_DIMENSION = 768`（与 pgvector 一致，但与 local-vector 不一致）

## 调用链路（均会失败）

```
generateEmbeddingPair(text)
  → buildDenseVector(text)        # 输出 1536 维
  → vectorSearch(vector, topK)    # 传入 1536 维
    → pgVectorSearchBooks(...)    # isValidVector → throw!

generateEmbedding(query)
  → buildEmbeddingPair(...).vector  # 1536 维
  → vectorSearchDirect(vector, ...) # 传入 1536 维
    → isValidVector → throw!
```

## 建议修复

1. 将 `local-vector.ts` 中 `DENSE_DIMENSIONS` 改为 `768`，保持两端一致
2. 或删除 `local-vector.ts` 的固定常量，改为从 `postgres-vector.ts` 导入 `VECTOR_DIMENSION`
3. 验证 `npm run index:books` 能成功插入向量
4. 验证 `GET /api/rag/search?query=...` 能返回结果

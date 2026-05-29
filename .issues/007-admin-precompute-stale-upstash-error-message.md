---
title: "admin/embeddings/precompute 错误消息仍引用已删除的 Upstash Vector"
labels: ["bug", "low"]
assignees: []
---

## 描述

`app/api/admin/embeddings/precompute/route.ts` 中 `status === 'unchecked'` 分支返回的错误消息为：

```
未配置向量存储 (UPSTASH_VECTOR_REST_URL/TOKEN)
```

但 Upstash Vector 已在代码库中删除，向量存储已统一使用 pgvector（PostgreSQL）。错误消息指向了已不存在的环境变量，对运维排查造成误导。

## 影响等级

🟢 **P4** — 误导性错误消息 — 仅影响管理端故障排查

## 相关文件

- `app/api/admin/embeddings/precompute/route.ts:73`

## 建议修复

将错误消息改为引用正确的环境变量：

```
未配置数据库连接 (POSTGRES_URL/DATABASE_URL)
```

或改为检查 `hasDatabaseConfig()` 而非 `checkVectorStoreStatus() === 'unchecked'`。

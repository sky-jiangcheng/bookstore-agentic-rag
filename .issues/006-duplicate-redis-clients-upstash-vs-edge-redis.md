---
title: "两个独立的 Upstash Redis 客户端造成资源浪费和混淆"
labels: ["refactor", "medium"]
assignees: []
---

## 描述

项目中有两个独立的 Upstash Redis 客户端，读取相同的环境变量，但来自不同的导入路径：

| 文件 | 导入路径 | 使用者 |
|------|----------|--------|
| `lib/upstash.ts` | `@upstash/redis` | `session-store`, `feedback-store`, `conversation-memory` |
| `lib/edge-redis.ts` | `@upstash/redis/cloudflare` | `middleware.ts`（速率限制） |

两者都使用 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`。在 serverless 环境中，这会创建两个独立的 TCP 连接到同一 Redis 实例，浪费连接池资源。

此外，`@upstash/redis/cloudflare` 专为 Cloudflare Workers 优化，在 Vercel Edge Functions 中未必是最佳选择。

## 影响等级

🟡 **P3** — 资源浪费 — 每个冷启动创建两个连接而非一个

## 相关文件

- `lib/upstash.ts` — `@upstash/redis` 客户端
- `lib/edge-redis.ts` — `@upstash/redis/cloudflare` 客户端
- `middleware.ts:39` — 动态 import `@/lib/edge-redis`

## 建议修复

1. 统一使用 `lib/upstash.ts` 作为唯一 Redis 客户端
2. 将 `middleware.ts` 的 `import('@/lib/edge-redis')` 改为 `import('@/lib/upstash')`
3. 删除 `lib/edge-redis.ts`（确认 `@upstash/redis/cloudflare` 导出与 `@upstash/redis` 兼容）

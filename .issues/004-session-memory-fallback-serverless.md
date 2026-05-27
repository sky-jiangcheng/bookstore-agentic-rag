---
title: "Session 存储回退到内存 Map 在 Vercel Serverless 下丢失"
labels: ["bug", "high"]
assignees: []
---

## 描述

`session-store.ts` 的后备链为 `Redis → Postgres → Memory(Map)`。当 Redis 和 Postgres 都不可用时，退回到进程内 `Map`。Vercel Serverless 环境中不同请求可能落在不同实例上，导致 parse 存入 map 后 generate 请求找不到该 session → 返回 400 "未找到请求 ID"。

## 影响等级

🟡 P2 - 间歇性生产故障 - 受限于环境变量配置状态。

## 相关文件

- `lib/book-list/session-store.ts:36,58-63` - memoryFallback

## 复现条件

- `REDIS_URL` 和 `POSTGRES_URL` 均未配置（或不可达）
- 连续调用 `POST /parse` → `POST /generate`（使用 `request_id`）

## 建议修复

1. 确保生产环境 `REDIS_URL` 已配置
2. 或在 Next.js 中使用 `unstable_cache` / 外部存储兜底
3. 在 parse 响应中除 `request_id` 外，同时返回完整 `parsed_requirements` 以便 generate 直接传入

---
title: "书单生成接口超时 — Vercel maxDuration 未覆盖 generate 路由"
labels: ["bug", "high"]
assignees: []
---

## 描述

`POST /api/v1/book-list/generate` 在生产环境 Vercel 上 8 秒后返回 503。代码内超时设为 ~9s，但 Vercel 默认硬限制为 10s（且 `vercel.json` 的 `maxDuration: 10` 可能未正确匹配 App Router 路由）。

此外，`route.ts` 和 `service.ts` 各自实现了互不兼容的超时逻辑（`AbortController` vs `Promise.race`），造成竞争条件。

## 影响等级

🔴 P0 - 生产环境功能异常 - 用户无法生成书单。

## 相关文件

- `vercel.json:9-16` - functions 配置
- `app/api/v1/book-list/generate/route.ts:61-70` - withTimeout 包装
- `lib/book-list/service.ts:199-205` - Promise.race 超时

## 复现步骤

```bash
curl -X POST https://<deployment>.vercel.app/api/v1/book-list/generate \
  -H 'Content-Type: application/json' \
  -d '{"requirements": {...}}'
# → 503 超时
```

## 建议修复

1. `vercel.json` 中添加 `app/api/v1/book-list/generate/**/*.ts` → `maxDuration: 60`
2. 或在 `route.ts` 中添加 `export const maxDuration = 60`
3. 移除 `route.ts` 的 `withTimeout` 包装，只保留 `service.ts` 内的超时

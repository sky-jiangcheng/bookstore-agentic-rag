---
title: "/api/catalog/search 只接受 POST，前端调用 GET 返回 405"
labels: ["bug"]
assignees: []
---

## 描述

`app/api/catalog/search/route.ts` 只导出了 `export async function POST()`，没有 `GET` 处理函数。前端或其他客户端使用 `GET` 请求时返回 405 Method Not Allowed。

## 影响等级

🔴 P1 - 功能缺失 - 前端搜索不可用。

## 相关文件

- `app/api/catalog/search/route.ts`

## 复现步骤

```bash
curl https://<deployment>.vercel.app/api/catalog/search
# → 405 Method Not Allowed
```

## 建议修复

1. 添加 `export async function GET(req: NextRequest)` 处理 GET 请求
2. 将查询参数解析为 `CatalogSearchFilters`

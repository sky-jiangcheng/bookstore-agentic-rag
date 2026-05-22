# Issue: Vercel 生产环境可访问，但存在功能缺陷

## 当前状态（2026-05-16 检测）

**Vercel 已成功部署并可达**，之前的"完全不可访问"问题已解决。但发现以下新问题：

## 测试结果

### 连接性与可用性 ✅

| 测试项 | 结果 | 耗时 |
|--------|------|------|
| DNS 解析 `bookstore-agentic-rag.vercel.app` | ✅ 216.198.79.67 / 64.29.17.67 | — |
| `GET /` | ✅ 200 | 0.48s |
| `GET /api/health` | ✅ 200 | 0.74~1.37s |

### 延迟一致性 ✅

| 轮次 | /api/health | / |
|------|-------------|---|
| 1 | 0.75s | 0.49s |
| 2 | 0.78s | 0.45s |
| 3 | 0.74s | 0.48s |

### 上游服务

| 依赖 | 状态 | 说明 |
|------|------|------|
| Neon Postgres | ✅ database=true | 连接正常 |
| Upstash Vector | ✅ vector=true, has_data | 有数据 |
| Upstash Redis | ✅ redis=true | 连接正常 |
| catalogService | ❌ **false** | 无法连接 Railway 后端 |

### 功能完备性

| 端点 | 结果 | 说明 |
|------|------|------|
| `POST /api/rag/chat` | ✅ 200 (5.59s) | RAG 聊天正常工作 |
| `POST /api/v1/book-list/parse` | ✅ 200 (1.28s) | 需求解析正常 |
| `POST /api/v1/book-list/generate` | ❌ **503** | 传入 requirements 对象时超时 |
| `POST /api/v1/book-list/generate` | ❌ **400** | 传入 parse 返回的 request_id 时报"未找到" |
| `GET /api/catalog/search` | ❌ **405** | Method Not Allowed |

## 发现的问题

### 问题 1: catalogService 依赖不可用

健康检查返回 `catalogService: false`，Vercel 前端无法连接到 Railway 后端的目录服务。

**可能原因**：
- Railway 服务域名未在 Vercel 环境变量中配置
- Railway 服务休眠或不可达
- CORS 配置不允许 Vercel 跨域访问

### 问题 2: 书单生成超时 (503)

`POST /api/v1/book-list/generate` 传入完整的 `requirements` 对象时，8 秒后返回 503 超时。

**可能原因**：
- Vercel Serverless 函数 `maxDuration: 10s` 不够
- 向量检索 + LLM 生成耗时过长
- catalogService 不可用导致生成流程中断

### 问题 3: request_id 在 parse/generate 之间无法传递

`/api/v1/book-list/parse` 返回 `request_id: "7119772a-..."`，但将此 ID 传给 `/api/v1/book-list/generate` 时返回 400 "未找到请求 ID"。

**可能原因**：
- request_id 存储在 Redis/内存中，但 Serverless 函数实例间不共享
- Session 存储的 TTL 过短或 key 格式不匹配
- parse 和 generate 请求命中不同的 Vercel 实例

### 问题 4: /api/catalog/search 返回 405

GET 请求 `/api/catalog/search` 返回 405 Method Not Allowed。

**可能原因**：
- 路由只注册了 POST 方法
- 或路由未正确注册

## 严重程度

- catalogService: **High** — 核心依赖不可用
- 书单生成超时: **High** — 关键功能失败
- request_id 不持久: **Medium** — parse-generate 工作流断裂
- catalog search 405: **Medium** — API 设计可能需要调整

## 标签

`production`, `vercel`, `timeout`, `serverless`, `catalog`

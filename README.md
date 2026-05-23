# BookStore Agentic RAG

面向 **Vercel** 部署的图书智能推荐系统，提供自然语言需求理解、向量检索、推荐生成和书单导出。

## 功能

- 自然语言需求分析（单次/多轮）
- 向量 / 混合检索与候选召回
- 基于候选的推荐生成（简化单趟流水线，适配 Serverless ~10s 预算）
- 流式对话（`/api/rag/chat`）
- 书单生成（`/api/v1/book-list/parse` + `/generate`）
- 书单 Excel 导出（`/api/v1/book-list/export-excel`）

## 技术栈

- Frontend / BFF: Next.js 16
- AI Runtime: Vercel AI SDK
- LLM / Embedding: Google Gemini
- Cache / Memory: Upstash Redis
- Vector Search: Upstash Vector
- Primary Data Store: Neon Postgres
- Excel 导出: exceljs

## 目录说明

- `app/`: Next.js 页面与 API 路由
- `components/`: UI 与 AI 交互组件
- `lib/`: agents、clients、config、types
- `docs/`: 核心设计与实施文档

## 本地启动

```bash
npm install
npm run dev
```

构建校验：

```bash
npm run check
```

## 环境变量

请基于 `.env.local.example` 配置至少以下项目：

- `GOOGLE_API_KEY`
- `DATABASE_URL`
- `UPSTASH_VECTOR_REST_URL`
- `UPSTASH_VECTOR_REST_TOKEN`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

后续会补充：

- `AUTH_SECRET`
- `CRON_SECRET`

## API

| 端点 | 说明 |
|------|------|
| `GET /api/health` | 健康检查 |
| `POST /api/rag/chat` | RAG 对话（JSON 或 SSE） |
| `POST /api/rag/search` | 向量检索 |
| `POST /api/catalog/search` | 目录检索 |
| `POST /api/v1/book-list/parse` | 书单需求解析 |
| `POST /api/v1/book-list/generate` | 书单推荐生成 |
| `POST /api/v1/book-list/export-excel` | 导出书单为 .xlsx |

## 书单 Excel 导出

```bash
curl -X POST http://localhost:3000/api/v1/book-list/export-excel \
  -H 'Content-Type: application/json' \
  -d '{"booklist_name":"测试书单","books":[{"title":"书名","author":"作者","price":29.9}]}' \
  --output 书单.xlsx
```

前端对话界面在推荐结果下方提供"导出 Excel"按钮，一键下载。

## 图书导入

```bash
npm run import:books -- ./data/books.json
```

## 向量索引

```bash
npm run index:books
```

也可索引部分数据：

```bash
npm run index:books -- --book-id 123
npm run index:books -- --limit 100 --offset 0
```

## Vercel 部署

1. 在 Vercel 导入本项目
2. 通过 Vercel Marketplace 连接：Neon Postgres、Upstash Redis、Upstash Vector
3. 配置环境变量
4. 初始化数据库：执行 `scripts/sql/001_init_books.sql`
5. 部署完成后检查：`GET /api/health`、`POST /api/catalog/search`、`POST /api/rag/chat`

## 健康检查

- `GET /api/health`: 返回当前服务是否已配置数据库、向量库、Redis

## 联调与冒烟测试

```bash
npm run smoke:rag
```

可选指定地址：

```bash
RAG_BASE_URL=https://your-deployment.vercel.app npm run smoke:rag
```

# BookStore Agentic RAG

这是面向 Vercel 部署的核心项目。

## 目标

构建一个基于 Next.js + Agentic RAG 的智能图书推荐系统，核心能力包括：

- 自然语言需求理解
- 多路径检索
- 推荐生成与质量反思
- 流式对话交互

## 当前技术方向

- Frontend / BFF: Next.js 16
- AI Runtime: Vercel AI SDK
- LLM / Embedding: Google Gemini
- Cache / Memory: Upstash Redis
- Vector Search: Upstash Vector
- Primary Data Store: Neon Postgres

## 目录说明

- `app/`: Next.js 页面与 API 路由
- `components/`: UI 与 AI 交互组件
- `lib/`: agents、clients、config、types
- `docs/`: 核心设计与实施文档

## 本地启动

```bash
cd /Users/jiangcheng/Workspace/Python/BookStore/bookstore-agentic-rag
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

## 改造原则

- 线上只保留一个 Vercel 主项目
- 核心链路不再依赖 mock 数据
- 检索与推荐能力优先做成可降级服务
- 非核心后台能力从旧项目中按需迁移

## 当前数据访问策略

- 首选 `DATABASE_URL` 直连托管 Postgres
- 迁移期间可选使用 `CATALOG_SERVICE_URL` 作为外部目录服务兜底
- 不再内置 mock 图书数据

## Vercel 部署最小清单

1. 在 Vercel 导入 `bookstore-agentic-rag` 仓库
2. 通过 Vercel Marketplace 连接：
   - Neon Postgres
   - Upstash Redis
   - Upstash Vector
3. 在项目环境变量中配置：
   - `GOOGLE_API_KEY`
   - `DATABASE_URL`
   - `UPSTASH_VECTOR_REST_URL`
   - `UPSTASH_VECTOR_REST_TOKEN`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. 初始化数据库：
   - 执行 `scripts/sql/001_init_books.sql`
5. 部署完成后检查：
   - `GET /api/health`
   - `POST /api/catalog/search`
   - `POST /api/rag/chat`

## 健康检查

- `GET /api/health`: 返回当前服务是否已配置数据库、向量库、Redis 和外部 catalog 兜底

## 图书导入流程

推荐使用“本地导出 -> Vercel 项目导入”的方式：

1. 在本地项目导出图书 JSON
2. 在核心项目执行导入脚本写入 Neon

示例：

```bash
cd /Users/jiangcheng/Workspace/Python/BookStore/bookstore-local-platform
python3 scripts/export_books.py
```

```bash
cd /Users/jiangcheng/Workspace/Python/BookStore/bookstore-agentic-rag
npm run import:books -- ../bookstore-local-platform/scripts/output/books.json
```

## 向量索引流程

在图书导入完成后，执行批量向量索引：

```bash
cd /Users/jiangcheng/Workspace/Python/BookStore/bookstore-agentic-rag
npm run index:books
```

也可以只索引单本或部分数据：

```bash
npm run index:books -- --book-id 123
```

```bash
npm run index:books -- --limit 100 --offset 0
```

## 联调与冒烟测试

执行基础 smoke test：

```bash
cd /Users/jiangcheng/Workspace/Python/BookStore/bookstore-agentic-rag
npm run smoke:rag
```

可选指定地址：

```bash
RAG_BASE_URL=https://your-deployment.vercel.app npm run smoke:rag
```

参考文件：

- `data/huqifeng-test-queries.json`
- `docs/smoke-test-checklist.md`

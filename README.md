# BookStore Agentic RAG

面向 Vercel 部署的图书智能推荐系统。系统使用 Gemini 解析自然语言需求，以 Postgres 关键词召回和本地相关度排序替代向量数据库，并支持多轮对话和 Excel 书单导出。

## 推荐流程

1. Gemini 与本地规则提取分类、关键词、扩展词和约束。
2. Postgres 使用同义词 `OR` 召回候选书。
3. 标题、分类、作者、简介和热度参与本地相关度排序。
4. Gemini 从候选中生成推荐理由；失败时自动使用规则推荐。
5. 最终执行排除词、推荐数量和总预算硬约束。

Redis 仅用于可选的会话记忆、反馈和分布式限流。未配置 Redis 时，首轮推荐仍可无状态运行。

## 技术栈

- Next.js 15
- React 19
- Vercel AI SDK
- Google Gemini
- Neon / Vercel Postgres
- 可选 Upstash Redis
- exceljs

## 本地运行

```bash
npm install
npm run dev
```

验证：

```bash
npm run test:unit
npm run typecheck
npm run build
```

## 环境变量

必需：

```dotenv
GOOGLE_API_KEY=
GOOGLE_MODEL=gemini-2.0-flash
DATABASE_URL=
```

可选：

```dotenv
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
NEXT_PUBLIC_APP_URL=http://localhost:3000
ALLOWED_ORIGINS=
```

## 数据库

初始化：

```bash
node scripts/vercel/init-db.mjs
```

数据库脚本会尝试启用 `pg_trgm` 并创建文本搜索索引。如果当前数据库不允许安装该扩展，普通 `ILIKE` 关键词检索仍可工作，只是大数据量下查询会更慢。

## API

| 端点 | 说明 |
|---|---|
| `GET /api/health` | 数据库、Redis 和搜索模式状态 |
| `POST /api/rag/chat` | 图书推荐对话 |
| `GET/POST /api/catalog/search` | 图书目录搜索 |
| `POST /api/v1/book-list/parse` | 解析书单需求 |
| `POST /api/v1/book-list/generate` | 生成推荐书单 |
| `POST /api/v1/book-list/export-excel` | 导出 Excel |

## 图书导入

```bash
npm run import:books -- ./data/books.json
```

## 冒烟测试

```bash
npm run smoke:rag
```

指定部署地址：

```bash
RAG_BASE_URL=https://your-deployment.vercel.app npm run smoke:rag
```

# Vercel 部署

## 依赖

必需服务：

- Google Gemini
- Neon 或 Vercel Postgres

可选服务：

- Upstash Redis：会话记忆、反馈存储和分布式限流

系统不依赖向量数据库。核心推荐流程为：

```text
需求解析 -> Postgres 关键词召回 -> 本地相关度排序 -> 推荐生成 -> 硬约束过滤
```

## 环境变量

```dotenv
GOOGLE_API_KEY=
DATABASE_URL=
```

可选：

```dotenv
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
ALLOWED_ORIGINS=
NEXT_PUBLIC_APP_URL=
```

## 初始化数据库

```bash
node scripts/vercel/init-db.mjs
```

脚本会尝试安装 `pg_trgm` 并创建 `idx_books_search_trgm`。扩展安装失败不会阻止普通关键词搜索。

## 部署检查

```bash
curl https://your-domain/api/health
RAG_BASE_URL=https://your-domain npm run smoke:rag
```

健康检查中数据库是必需依赖，Redis 是可选依赖。未配置 Redis 时推荐请求以无状态方式运行。

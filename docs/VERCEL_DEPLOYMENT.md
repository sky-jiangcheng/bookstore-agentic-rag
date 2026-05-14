# Vercel 部署指南

## 概述

本项目已针对 Vercel Serverless 进行优化，主要改造包括：

1. **存储层**：主路径使用 **Upstash Vector + Upstash Redis**（与 `lib/config/environment.ts` 一致）；不再以 Vercel KV 为默认方案
2. **执行流程**：默认 **单次简化流水线**（`runVercelRAGPipeline`），无多轮反思迭代
3. **预计算嵌入**：可按脚本预计算向量嵌入
4. **超时意识**：配置默认 **9s** 量级的超时提示（低于常见 10s 函数上限）

## 架构变更

### 原架构（不适配 Vercel）
```
Upstash Vector → 本地 BGE Reranker → 多轮迭代评估
```

### Vercel 优化架构（默认）
```
Upstash Vector / Postgres → 简化检索 (fastRetrieval + 可选 fallback) → 单次推荐生成 LLM
```

书单 BFF：`POST /api/v1/book-list/generate` 在生产（`VERCEL` + `VERCEL_USE_SIMPLIFIED` 默认）走上述简化链路，并在 `parse` 之后 **复用已解析需求**，避免重复需求分析 LLM。

## 部署步骤

### 1. 准备 Vercel 项目

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录 Vercel
vercel login
```

### 2. 配置环境变量

在 Vercel 项目设置中添加以下环境变量：

**必需（与当前代码一致）**：
- `GOOGLE_API_KEY` - Gemini API 密钥
- `POSTGRES_URL` 或 `DATABASE_URL` - Postgres（如 Neon / Vercel Postgres）
- `UPSTASH_VECTOR_REST_URL` / `UPSTASH_VECTOR_REST_TOKEN` - 向量检索
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` - 缓存、会话、书单 parse 会话等

**可选**：
- `RERANKER_ENABLED=false` - 禁用重排序器（节省时间）
- `ENABLE_CONVERSATION_MEMORY=true` - 启用对话记忆
- `VERCEL_USE_SIMPLIFIED=true` - 使用简化流程

### 3. 部署数据库

确保 Vercel Postgres 中有 `books` 表：

```sql
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  author VARCHAR(255),
  publisher VARCHAR(255),
  price DECIMAL(10, 2),
  stock INTEGER DEFAULT 0,
  category VARCHAR(100),
  description TEXT,
  cover_url VARCHAR(512),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4. 预计算嵌入向量

部署后，运行预计算脚本：

```bash
# 本地运行（需要数据库访问）
npx tsx scripts/vercel/precompute-embeddings.ts

# 或通过 Vercel CLI
vercel env pull .env.local
npx tsx scripts/vercel/precompute-embeddings.ts
```

### 5. 部署到 Vercel

```bash
# 首次部署
vercel

# 生产环境
vercel --prod
```

## 使用方式

### API 调用

```typescript
// 标准模式（SSE 流式响应）
const response = await fetch('/api/rag/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '推荐一些科幻小说',
    sessionId: 'session-id-or-undefined',
  }),
});

// 快速模式（简单 JSON 响应，适合边缘函数）
const response = await fetch('/api/rag/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '推荐一些科幻小说',
    fast: true,  // 使用快速模式
  }),
});
```

### Vercel 专用端点

使用优化的 Vercel 端点：

```
/api/rag/chat/vercel
```

## 性能优化

### 执行时间

| 组件 | 原架构 | Vercel 优化 |
|------|--------|------------|
| 需求分析 | ~2s | ~1s |
| 向量检索 | ~3s | ~1s |
| 重排序 | ~2s | 跳过 |
| 生成推荐 | ~3s | ~2s |
| **总计** | **~10s** | **~4s** |

### 成本优化

- **Vercel 免费版限制**：
  - 100GB 带宽/月
  - 1000 次 serverless 函数调用/天
  - 10秒执行时间限制

- **优化建议**：
  - 使用 Vercel KV 缓存减少数据库查询
  - 启用 `fast=true` 模式减少执行时间
  - 预计算嵌入向量

## 监控和调试

### Vercel Dashboard

- 查看函数执行时间
- 监控错误率
- 检查超时问题

### 日志

```bash
# 查看实时日志
vercel logs

# 查看特定部署
vercel logs <deployment-url>
```

## 故障排除

### 问题：超时错误

**解决方案**：
1. 使用 `fast=true` 模式
2. 减少 `topK` 参数
3. 禁用重排序器

### 问题：内存不足

**解决方案**：
1. 减少批处理大小
2. 使用分页检索
3. 增加缓存 TTL

### 问题：KV 连接失败

**解决方案**：
1. 检查 KV URL 和 Token
2. 确保 KV 已创建
3. 查看Vercel Dashboard中的KV状态

## 下一步

1. **设置自定义域名**
2. **配置 CDN 缓存**
3. **启用 Analytics**
4. **设置监控告警**

## 支持

如有问题，请查看：
- [Vercel 文档](https://vercel.com/docs)
- [Vercel Postgres 文档](https://vercel.com/docs/storage/vercel-postgres)
- [Vercel KV 文档](https://vercel.com/docs/storage/vercel-kv)

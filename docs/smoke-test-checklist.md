# 冒烟测试清单

## 环境

- `GOOGLE_API_KEY` 已配置
- `DATABASE_URL` 或 `POSTGRES_URL` 已配置
- `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN` 可选
- `books` 表已有数据

## 检查

1. `GET /api/health` 返回 `healthy: true`。
2. `GET /api/catalog/search?q=人工智能` 返回相关图书。
3. 同义词查询能够召回至少命中其中一个词的图书。
4. 带“排除教材”的请求不返回标题、作者或分类中包含“教材”的图书。
5. 带总预算的请求返回总价不超过预算。
6. 未配置 Redis 时，首轮推荐仍能完成。
7. 推荐结果可以导出为 Excel。

执行：

```bash
npm run test:unit
npm run typecheck
npm run build
npm run smoke:rag
```

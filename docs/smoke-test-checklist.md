# Smoke Test Checklist

这份清单用于 `huqifeng-test-books.json` 导入与索引完成后的首轮联调。

## 前置条件

- `DATABASE_URL` 已配置
- `UPSTASH_VECTOR_REST_URL` / `UPSTASH_VECTOR_REST_TOKEN` 已配置
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 已配置
- `GOOGLE_API_KEY` 已配置
- 已执行：
  - `npm run import:books -- ./data/huqifeng-test-books.json`
  - `npm run index:books`

## 基础检查

### 1. 健康检查

访问：

- `GET /api/health`

预期：

- `status = ok`
- `database = true`
- `vector = true`

### 2. 目录检索

访问：

- `POST /api/catalog/search`

请求体示例：

```json
{
  "query": "围棋 基本功 布局"
}
```

预期：

- 返回至少 1 本围棋相关图书
- 优先命中《围棋基本功》或《围棋现代布局谋略》

## RAG 查询建议

推荐优先验证以下问题：

1. 推荐两本帮助调整心态和提升行动力的心理成长类书籍，内容要通俗一点。
2. 我想找几本了解中国城市文化和旅游的书，最好介绍北京或厦门。
3. 有没有适合普通读者看的历史人物传记，最好是鲁迅相关的。
4. 推荐一些适合家里长辈看的健康养生和免疫力科普书。
5. 我想提升象棋残局和布局能力，有没有偏实战一点的书？
6. 我是围棋初学者，想先练基本功，再学布局，有哪些书合适？
7. 我最近想补一补公共管理和政治学基础，推荐几本入门书。
8. 推荐一本适合快速了解行政法和行政诉讼法核心内容的书。

## 验收标准

- 至少 6/8 个 query 返回与预期类别相符的推荐
- 推荐结果里出现的书名能在 `data/huqifeng-test-books.json` 中找到
- 推荐理由能引用图书主题、简介或目标读者特征
- 没有明显把考研/教材/少儿类噪声召回进来

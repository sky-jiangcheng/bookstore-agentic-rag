---
title: "fetchBooksByIds 中 id::text 转换导致索引失效"
labels: ["performance", "low"]
assignees: []
---

## 描述

`lib/server/catalog-repository.ts:71` 中：

```sql
WHERE id::text = ANY($1::text[])
```

将 `id` 列转换为 `text` 再与参数数组比较，导致数据库无法使用 `id` 上的主键索引，必须做全表扫描后再做类型转换比较。

## 影响等级

🟢 **P4** — 小数据集无影响，大数据集查询变慢

## 相关文件

- `lib/server/catalog-repository.ts:71`

## 建议修复

将参数改为数字数组，避免类型转换：

```typescript
const idsAsNumbers = ids.map(id => Number(id)).filter(n => !isNaN(n));
// 如果 id 是数字类型
WHERE id = ANY($1::bigint[])
```

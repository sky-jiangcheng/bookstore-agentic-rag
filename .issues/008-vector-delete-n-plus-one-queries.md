---
title: "deleteChunkVectorsByBookIds 逐条 DELETE 而非批量操作"
labels: ["performance", "medium"]
assignees: []
---

## 描述

`lib/postgres-vector.ts` 中的 `deleteChunkVectorsByBookIds()` 使用 `for` 循环对每个 `bookId` 执行单独的 `DELETE` 查询：

```typescript
for (const bookId of bookIds) {
  await sql`DELETE FROM book_embeddings WHERE book_id = ${bookId}::bigint`;
}
```

当需要删除大量书籍时（如批量更新索引），会产生 N+1 次数据库往返。应使用 `= ANY($1::bigint[])` 在单条 SQL 中完成批量删除。

## 影响等级

🟡 **P3** — 可能导致批量索引操作超时

## 相关文件

- `lib/postgres-vector.ts:338-344`

## 建议修复

```typescript
export async function deleteChunkVectorsByBookIds(bookIds: string[]): Promise<void> {
  if (bookIds.length === 0) return;
  const ids = bookIds.map(id => Number(id)).filter(n => !isNaN(n));
  await sql`DELETE FROM book_embeddings WHERE book_id = ANY(${ids}::bigint[])`;
}
```

# 馆别字段原地重命名实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不复制图书数据的前提下，将馆别、屏蔽词和中图法分类字段原地改为明确命名，并让重分类遵循“类别映射准入、屏蔽词剔除”规则。

**Architecture:** PostgreSQL 通过一个事务执行五个 `RENAME COLUMN`，同步拆分指定复合屏蔽词。应用代码一次性切换到 `book_category`、`library_codes`、`library_code`，不保留旧字段兼容层；重分类使用 category 映射作为基础馆别，再按馆别屏蔽词做减法。

**Tech Stack:** Next.js 15、TypeScript、PostgreSQL/Neon、`@vercel/postgres`、Node test runner、Vercel。

---

## 文件范围

- Create: `scripts/sql/006_rename_library_fields.sql`，生产数据库原地迁移和指定屏蔽词拆分。
- Create: `scripts/migrate-library-field-names.mjs`，执行迁移并验证新旧字段。
- Create: `lib/server/library-classification.ts`，纯函数实现基础馆别减去屏蔽馆别。
- Modify: `scripts/sql/001_init_books.sql`、`002_init_filter_keywords.sql`、`004_library_categories.sql`、`005_reclassify.sql`，让新环境直接使用新字段。
- Modify: `app/api/admin/**`、`app/api/catalog/categories/route.ts`、`app/api/rag/**`，切换数据库字段和 JSON 契约。
- Modify: `lib/server/catalog-repository.ts`、`lib/server/book-filters.ts`、`lib/agents/**`，切换图书字段并统一有效馆别。
- Modify: `components/admin/CategoryMappingDialog.tsx`、`components/rag-chat.tsx`、图书展示和导出组件，消费新 JSON 字段。
- Modify: `scripts/import-*.mjs`、`scripts/reclassify.mjs`，切换导入和离线重分类。
- Modify/Create tests under `tests/`，覆盖字段契约、拆词和重分类语义。

### Task 1: 锁定新字段契约

**Files:**
- Create: `tests/library-field-contract.test.ts`
- Modify: `tests/current-outages.test.ts`

- [ ] **Step 1: 写字段契约失败测试**

测试读取关键路由和 SQL，断言生产 SQL 使用：

```ts
assert.match(source, /fk\.library_code/);
assert.match(source, /cm\.book_category/);
assert.match(source, /cm\.library_codes/);
assert.match(source, /books\.book_category/);
assert.match(source, /books\.library_codes/);
assert.doesNotMatch(source, /fk\.category/);
```

同时断言 API 类型使用 `book_category`、`library_codes`、`library_code`。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
node --require ./scripts/preload.cjs --import tsx --test tests/library-field-contract.test.ts
```

Expected: FAIL，提示仍存在旧字段名。

- [ ] **Step 3: 提交测试**

```bash
git add tests/library-field-contract.test.ts tests/current-outages.test.ts
git commit -m "test: define explicit library field contracts"
```

### Task 2: 编写并测试数据库迁移

**Files:**
- Create: `scripts/sql/006_rename_library_fields.sql`
- Create: `scripts/migrate-library-field-names.mjs`
- Create: `tests/library-migration.test.ts`
- Modify: `scripts/sql/001_init_books.sql`
- Modify: `scripts/sql/002_init_filter_keywords.sql`
- Modify: `scripts/sql/004_library_categories.sql`

- [ ] **Step 1: 写迁移内容失败测试**

测试要求迁移包含五次原地改名：

```sql
ALTER TABLE filter_keywords RENAME COLUMN category TO library_code;
ALTER TABLE category_library_mapping RENAME COLUMN category TO book_category;
ALTER TABLE category_library_mapping RENAME COLUMN library_types TO library_codes;
ALTER TABLE books RENAME COLUMN category TO book_category;
ALTER TABLE books RENAME COLUMN library_types TO library_codes;
```

并只针对：

```sql
WHERE keyword = '男孩女孩·*-*岁'
```

写入 `男孩`、`女孩`、`岁`。

- [ ] **Step 2: 运行迁移测试确认失败**

```bash
node --require ./scripts/preload.cjs --import tsx --test tests/library-migration.test.ts
```

Expected: FAIL，迁移文件尚不存在。

- [ ] **Step 3: 实现幂等迁移**

迁移使用 `DO $$` 检查 `information_schema.columns`，仅在旧列存在且新列不存在时改名。复合词拆分放在同一事务中：

```sql
WITH source_rows AS (
  DELETE FROM filter_keywords
  WHERE keyword = '男孩女孩·*-*岁'
  RETURNING library_code, is_active
)
INSERT INTO filter_keywords (keyword, library_code, is_active)
SELECT word, source_rows.library_code, source_rows.is_active
FROM source_rows
CROSS JOIN (VALUES ('男孩'), ('女孩'), ('岁')) AS words(word)
ON CONFLICT (keyword, library_code)
DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = NOW();
```

若生产唯一约束仍为单列 `keyword`，先替换为 `(keyword, library_code)` 唯一约束。

- [ ] **Step 4: 更新初始化 SQL**

新建数据库直接创建：

```sql
filter_keywords(keyword, library_code, ...)
books(book_category, library_codes, ...)
category_library_mapping(book_category, library_codes, ...)
```

- [ ] **Step 5: 运行迁移测试**

```bash
node --require ./scripts/preload.cjs --import tsx --test tests/library-migration.test.ts
node --check scripts/migrate-library-field-names.mjs
```

Expected: PASS。

- [ ] **Step 6: 提交迁移**

```bash
git add scripts/sql scripts/migrate-library-field-names.mjs tests/library-migration.test.ts
git commit -m "feat: add in-place library field migration"
```

### Task 3: 切换应用字段与 JSON 契约

**Files:**
- Modify: `app/api/admin/category-mapping/route.ts`
- Modify: `app/api/admin/category-quality/route.ts`
- Modify: `app/api/admin/library-categories/route.ts`
- Modify: `app/api/admin/library-categories/[code]/keywords/route.ts`
- Modify: `app/api/catalog/categories/route.ts`
- Modify: `app/api/rag/exclusions/route.ts`
- Modify: `app/api/rag/parse/route.ts`
- Modify: `lib/server/catalog-repository.ts`
- Modify: `lib/server/book-filters.ts`
- Modify: `lib/types/rag.ts`
- Modify: `components/admin/CategoryMappingDialog.tsx`
- Modify: `components/rag-chat-utils.ts`
- Modify: `components/rag-chat.tsx`

- [ ] **Step 1: 逐表切换 SQL**

统一替换数据库含义：

```text
filter_keywords.library_code
category_library_mapping.book_category
category_library_mapping.library_codes
books.book_category
books.library_codes
```

所有 JOIN 使用：

```sql
books.book_category = cm.book_category
```

- [ ] **Step 2: 切换 API JSON**

类别映射响应改为：

```ts
interface CategoryMapping {
  book_category: string;
  library_codes: string[];
  confidence: number;
}
```

屏蔽词写接口请求改为：

```json
{ "keyword": "教材", "library_code": "公共馆", "action": "add" }
```

- [ ] **Step 3: 切换图书内部类型**

`Book.category` 改为 `Book.book_category`，所有排序、展示、导出和解释代码同步使用新字段。`CatalogSearchFilters.library_category` 改为 `library_code`，避免查询参数继续混淆。

- [ ] **Step 4: 运行字段契约测试**

```bash
node --require ./scripts/preload.cjs --import tsx --test tests/library-field-contract.test.ts tests/current-outages.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交字段切换**

```bash
git add app lib components tests
git commit -m "refactor: clarify library and book category fields"
```

### Task 4: 修正重分类语义

**Files:**
- Create: `lib/server/library-classification.ts`
- Create: `tests/library-classification.test.ts`
- Modify: `app/api/admin/reclassify/route.ts`
- Modify: `scripts/reclassify.mjs`
- Modify: `scripts/sql/005_reclassify.sql`

- [ ] **Step 1: 写纯函数失败测试**

```ts
test('removes a library when its blocked keyword matches', () => {
  assert.deepEqual(
    classifyLibraryCodes(
      ['公共馆', '小学'],
      '儿童编程入门',
      new Map([['公共馆', ['教材']], ['小学', ['儿童']]]),
    ),
    ['公共馆'],
  );
});

test('never adds a library because a blocked keyword matches', () => {
  assert.deepEqual(
    classifyLibraryCodes(
      ['公共馆'],
      '儿童读物',
      new Map([['小学', ['儿童']]]),
    ),
    ['公共馆'],
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
node --require ./scripts/preload.cjs --import tsx --test tests/library-classification.test.ts
```

Expected: FAIL，函数尚不存在。

- [ ] **Step 3: 实现分类函数**

```ts
export function classifyLibraryCodes(
  baseCodes: string[],
  searchableText: string,
  blockedByLibrary: Map<string, string[]>,
): string[] {
  const haystack = searchableText.toLowerCase();
  return baseCodes.filter((code) =>
    !(blockedByLibrary.get(code) ?? []).some((word) =>
      haystack.includes(word.toLowerCase()),
    ),
  );
}
```

- [ ] **Step 4: 改造全量重分类**

每批查询图书及映射：

```sql
SELECT
  b.id,
  b.title,
  b.author,
  b.publisher,
  b.book_category,
  b.description,
  COALESCE(cm.library_codes, ARRAY['公共馆']) AS base_library_codes
FROM books b
LEFT JOIN category_library_mapping cm
  ON cm.book_category = b.book_category
```

计算后覆盖 `books.library_codes`。屏蔽词只做删除。

- [ ] **Step 5: 运行重分类测试**

```bash
node --require ./scripts/preload.cjs --import tsx --test tests/library-classification.test.ts
```

Expected: PASS。

- [ ] **Step 6: 提交语义修正**

```bash
git add lib/server/library-classification.ts app/api/admin/reclassify/route.ts scripts/reclassify.mjs scripts/sql/005_reclassify.sql tests/library-classification.test.ts
git commit -m "fix: classify libraries from mappings and exclusion rules"
```

### Task 5: 完整本地验证

**Files:**
- Modify as required by compilation failures only.

- [ ] **Step 1: 运行完整测试**

```bash
npm test
```

Expected: 所有测试通过。

- [ ] **Step 2: 运行类型检查**

```bash
npm run typecheck
```

Expected: 0 errors。

- [ ] **Step 3: 运行生产构建**

```bash
npm run build
```

Expected: build successful。

- [ ] **Step 4: 检查旧数据库字段引用**

```bash
rg -n "fk\\.category|cm\\.category|cm\\.library_types|books\\.category|books\\.library_types|filter_keywords \\([^)]*category" app lib components scripts tests
```

Expected: 不存在数据库旧字段引用；文档或兼容说明除外。

- [ ] **Step 5: 提交验证修正**

```bash
git add app lib components scripts tests
git commit -m "test: verify renamed library data model"
```

### Task 6: 生产迁移与发布

**Files:**
- Use: `scripts/migrate-library-field-names.mjs`

- [ ] **Step 1: 拉取生产环境变量**

```bash
vercel env pull /tmp/bookstore-production.env --environment=production --yes
```

- [ ] **Step 2: 记录当前生产部署**

```bash
vercel ls --prod
```

保存当前 deployment ID，作为代码回滚目标。

- [ ] **Step 3: 执行数据库原地迁移**

```bash
node scripts/migrate-library-field-names.mjs --env-file /tmp/bookstore-production.env
```

Expected:

```json
{
  "old_columns": 0,
  "new_columns": 5,
  "compound_keyword": 0,
  "split_keywords": 3
}
```

- [ ] **Step 4: 立即发布生产代码**

```bash
vercel --prod --yes
```

Expected: deployment READY，正式域名完成 alias。

- [ ] **Step 5: 接口验收**

```bash
curl -sS -o /tmp/library-categories.json -w '%{http_code}' https://www.jiangcheng.qzz.io/api/admin/library-categories
curl -sS -o /tmp/category-mapping.json -w '%{http_code}' 'https://www.jiangcheng.qzz.io/api/admin/category-mapping?limit=3'
curl -sS -o /tmp/category-quality.json -w '%{http_code}' https://www.jiangcheng.qzz.io/api/admin/category-quality
curl -sS -o /tmp/health.json -w '%{http_code}' https://www.jiangcheng.qzz.io/api/health
```

Expected: 全部 200，JSON 使用新字段。

- [ ] **Step 6: 浏览器验收**

在正式域名执行：

```text
选择馆别 → 解析需求 → 确认调整 → 查询
```

Expected: 展示书单，不停留在加载状态；网络请求无 500。

- [ ] **Step 7: 执行全量重分类**

使用修正后的离线脚本：

```bash
node scripts/reclassify.mjs --env-file=/tmp/bookstore-production.env --batch-size=1000
```

Expected: 所有图书 `library_codes` 由类别映射和屏蔽词重新生成。

- [ ] **Step 8: 重分类后复验**

确认：

```sql
SELECT cardinality(library_codes), COUNT(*)
FROM books
GROUP BY cardinality(library_codes)
ORDER BY 1;
```

并再次生成馆别书单，确保结果非空且屏蔽词不出现在结果元数据中。

- [ ] **Step 9: 清理临时环境文件**

```bash
rm -f /tmp/bookstore-production.env
```

### Task 7: 回滚演练说明

**Files:**
- Modify: `docs/superpowers/specs/2026-06-09-library-field-rename-design.md`

- [ ] **Step 1: 写明数据库回滚 SQL**

记录五个反向 `RENAME COLUMN`，删除三个拆分词并恢复 `男孩女孩·*-*岁` 的 SQL。

- [ ] **Step 2: 写明应用回滚命令**

```bash
vercel rollback <previous-production-deployment>
```

- [ ] **Step 3: 最终工作区检查**

```bash
git diff --check
git status --short
```

Expected: 无格式错误；不修改用户已有 `.claude/settings.local.json`、`temp_venv/` 和 `scripts/__pycache__/`。

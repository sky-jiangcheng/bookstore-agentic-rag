# 馆别字段原地重命名设计

## 目标

消除 `category` 和 `library_types` 在不同表中的语义混淆，并纠正屏蔽词被用于正向馆别归类的问题。生产数据库使用 PostgreSQL 原地列重命名，不新增或复制 57 万条图书数据。

## 字段命名

| 表 | 原字段 | 新字段 | 语义 |
|---|---|---|---|
| `filter_keywords` | `category` | `library_code` | 该屏蔽词所属馆别 |
| `category_library_mapping` | `category` | `book_category` | `books` 中的中图法分类 |
| `category_library_mapping` | `library_types` | `library_codes` | 该中图法分类适用的馆别 |
| `books` | `category` | `book_category` | 图书的中图法分类 |
| `books` | `library_types` | `library_codes` | 图书最终适用的馆别 |

`confidence`、`auto_assigned` 和 `library_categories.code` 保持不变。

## 屏蔽词数据修正

只处理完全匹配 `男孩女孩·*-*岁` 的记录：

1. 保留原记录的 `library_code` 和启用状态。
2. 删除该复合记录。
3. 写入 `男孩`、`女孩`、`岁` 三条独立记录。
4. 使用唯一约束避免重复数据。

不自动拆分其他屏蔽词。

## 业务语义

### 馆别基础准入

`category_library_mapping` 是中图法分类到馆别的基础映射：

```text
books.book_category
  -> category_library_mapping.book_category
  -> category_library_mapping.library_codes
```

### 馆别屏蔽

`filter_keywords` 永远只代表排除规则：

```text
某图书命中馆别的屏蔽词
  -> 从该图书的 library_codes 中移除该馆别
```

屏蔽词不得再用于把图书加入馆别。

### 图书馆别

`books.library_codes` 是用于线上检索的物化结果：

```text
基础映射馆别 - 命中的馆别屏蔽规则 = 最终 library_codes
```

未找到 category 映射时暂时使用 `公共馆` 作为基础馆别，再应用公共馆屏蔽词。该默认行为保持当前产品可用性，并在质量检查中继续标记未映射分类。

## 重分类

重分类以 `category_library_mapping.library_codes` 为基础，不再从旧的 `books.library_codes` 分布反向推导，也不使用屏蔽词正向添加馆别。

每本书的匹配文本使用标题、作者、出版社、中图法分类和简介。命中某馆别的任一屏蔽词时，从基础馆别集合中移除该馆别。

管理端修改类别映射或屏蔽词后，将对应馆别标记为待重分类。全量重分类接口可重新生成全部图书的 `library_codes`。

## API 与代码

服务端、前端管理组件、导入脚本、SQL、类型和测试统一使用新名称。对外 JSON 字段也同步改为：

- `book_category`
- `library_codes`
- `library_code`

这是一次协调发布，不保留旧 JSON 字段别名，以免继续传播歧义。

用户推荐请求中的 `libraryCategory` 属于前端状态/API 参数，不是数据库字段，可在本次保留；数据库查询必须落到 `library_codes`。

## 发布顺序

1. 完成代码和迁移脚本并通过本地测试、类型检查和构建。
2. 在生产数据库事务中原地重命名五个字段。
3. 调整相关唯一约束和索引名称（索引数据不重建，必要时只改对象名）。
4. 拆分指定复合屏蔽词。
5. 立即发布匹配新字段名的应用。
6. 验证馆别、屏蔽词、类别映射、质量检查和书单生成接口。
7. 执行修正后的全量重分类并再次验证馆别分布。

迁移与发布之间旧版本接口会短暂不可用，因此在低流量时连续执行，不设置双字段过渡。

## 验证标准

- 数据库不存在五个旧字段，五个新字段均存在。
- `男孩女孩·*-*岁` 为 0 条，`男孩`、`女孩`、`岁` 在原馆别下各有启用记录。
- 馆别、屏蔽词、类别映射和质量检查接口返回 200。
- 管理端能读取和保存 `book_category` / `library_codes`。
- 书单按选择馆别过滤，并使用该馆别屏蔽词排除。
- 重分类代码不存在“屏蔽词命中后加入馆别”的路径。
- 完整测试、类型检查、生产构建和浏览器书单流程通过。

## 回滚

若代码发布失败，在数据库事务中将五个字段重命名回旧名称并回滚到上一生产部署。拆分后的三个屏蔽词可删除并恢复原复合记录。

# 分类映射管理功能 - 快速上手指南

## ✅ 已完成的功能

### 1. 数据库表

**表名**: `category_library_mapping`

| 字段 | 类型 | 说明 |
|------|------|------|
| category | TEXT | 学科分类（主键） |
| library_types | TEXT[] | 适用馆别数组 |
| confidence | REAL | 置信度 (0-1) |
| auto_assigned | BOOLEAN | 是否自动分配 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

**数据量**: 31,811 条记录

---

### 2. API 端点

#### `/api/admin/category-mapping`

**功能**: 映射数据 CRUD 操作

**请求示例**:
```bash
# 获取映射列表（支持筛选）
GET /api/admin/category-mapping?min_book_count=1000&max_confidence=0.3&limit=50

# 更新映射
PATCH /api/admin/category-mapping
{
  "category": "长篇小说",
  "library_types": ["公共馆", "成人目录"]
}

# 删除映射（恢复自动分配）
PATCH /api/admin/category-mapping
{
  "category": "长篇小说",
  "action": "delete"
}

# 重新计算映射
POST /api/admin/category-mapping
{
  "action": "recalculate",
  "category": "长篇小说"
}
```

#### `/api/admin/category-quality`

**功能**: 数据质量监控

**响应示例**:
```json
{
  "total_mappings": 31811,
  "total_books": 574783,
  "issues": {
    "low_confidence": 41,
    "unmapped_category": 0,
    "mismatched_library": 15,
    "orphan_mapping": 0,
    "total": 56
  }
}
```

---

### 3. 前端组件

#### `CategoryMappingDialog` 组件

**位置**: `/workspace/components/admin/CategoryMappingDialog.tsx`

**功能**:
- 📊 映射列表展示（支持搜索、筛选、分页）
- ✏️ 在线编辑（馆别多选、保存、取消）
- 🔄 重新计算（基于最新数据）
- 🔍 质量监控（问题统计、快捷导航）

**依赖的 UI 组件**:
- Dialog, Table, Button, Input, Badge
- Switch, Select, Tabs, Progress, ScrollArea
- Alert, Spinner (均已实现)

---

### 4. 管理后台页面

**路由**: `/admin`

**文件**: `/workspace/app/admin/page.tsx`

**访问方式**:
```bash
# 启动开发服务器
npm run dev

# 浏览器访问
http://localhost:3000/admin
```

---

## 🎯 使用场景

### 场景 1: 人工审核低置信度分类

1. 访问 `/admin` 页面
2. 点击 **[分类映射管理]** 按钮
3. 在对话框中打开 **[仅显示低置信度]** 开关
4. 浏览筛选出的分类列表
5. 对需要调整的分类点击 **[编辑]**
6. 勾选/取消勾选馆别按钮
7. 点击 **[保存修改]**

---

### 场景 2: 查看数据质量问题

1. 访问 `/admin` 页面
2. 点击 **[分类映射管理]** 按钮
3. 切换到 **[质量监控]** Tab
4. 查看各项问题统计
5. 点击 **[查看低置信度分类]** 快捷跳转到映射管理

---

### 场景 3: 批量审核已完成的修改

今天已经通过 SQL 手动调整了 13 个分类：

| 分类 | 修改内容 |
|------|----------|
| 长篇小说 | 去掉初高中 |
| 中国文学 | 加公共馆，去掉初高中 |
| 汽车 | 去掉初高中，加公共馆 |
| 成功心理 | 去掉小学 |
| 人生哲学 | 去掉小学 |
| 阅读课 | 去掉成人目录 |
| 法律 | 去掉初高中、小学，加公共馆 |
| 中华文化 | 加小学、公共馆 |
| 古典小说 | 加公共馆 |
| 日语 | 去掉初高中 |
| 文化史 | 加公共馆 |
| 建筑设计 | 去掉初高中，加公共馆 |
| 会计学 | 去掉初高中 |

这些修改已经直接写入数据库，状态为"人工审核"。  
在管理界面中，这些分类会显示 **[人工]** 标签，并带有 **[重置]** 按钮（可恢复为自动分配）。

---

## 📋 剩余待审核分类（低置信度 TOP 10）

| # | 分类 | 书籍数 | 馆别 | 置信度 | 建议操作 |
|---|------|--------|------|--------|----------|
| 1 | 英语 | 11,355 | {成人目录，初高中} | 0.264 | 审核是否合理 |
| 2 | 散文集 | 8,611 | {初高中，小学，公共馆} | 0.203 | 可能需要精简 |
| 3 | 童话 | 5,116 | {小学，公共馆} | 0.256 | ✅ 合理 |
| 4 | 汉语 | 3,073 | {初高中，成人目录，小学} | 0.237 | 可能需要精简 |
| 5 | 中国历史 | 2,903 | {小学，公共馆，初高中} | 0.211 | 审核是否合理 |
| 6 | 短篇小说 | 2,815 | {公共馆，小学，初高中} | 0.203 | 可能需要精简 |
| 7 | 中篇小说 | 2,638 | {公共馆，成人目录} | 0.204 | ✅ 合理 |
| 8 | 诗集 | 2,604 | {四馆都有} | 0.202 | 可能需要精简 |
| 9 | 随笔 | 2,334 | {公共馆，初高中，成人目录} | 0.202 | 审核是否合理 |
| 10 | 人生哲学 | 2,238 | {公共馆} | 0.206 | ✅ 已审核 |

---

## 🔧 技术细节

### 筛选条件逻辑

```typescript
// min_book_count: 最少书籍数
WHERE COUNT(*) >= ${min_book_count}

// max_confidence: 最高置信度
WHERE cm.confidence <= ${max_confidence}

// library_type: 馆别筛选
WHERE cm.library_types @> {${library_type}}

// auto_only: 仅自动分配
WHERE cm.auto_assigned = TRUE
```

### 置信度计算

```sql
SELECT 
  category,
  lt AS library_type,
  COUNT(*) * 1.0 / SUM(COUNT(*)) OVER (PARTITION BY category) AS confidence
FROM books, UNNEST(library_types) AS lt
WHERE category = ${category}
GROUP BY category, lt
```

---

## 📁 文件清单

```
/workspace
├── app/
│   ├── admin/
│   │   └── page.tsx                    # 管理后台页面
│   └── api/
│       └── admin/
│           ├── category-mapping/
│           │   └── route.ts            # 映射管理 API
│           └── category-quality/
│               └── route.ts            # 质量监控 API
├── components/
│   ├── admin/
│   │   └── CategoryMappingDialog.tsx   # 管理对话框组件
│   └── ui/
│       ├── table.tsx                   # Table 组件
│       ├── dialog.tsx                  # Dialog 组件
│       ├── button.tsx                  # Button 组件
│       └── ...                         # 其他 UI 组件
└── docs/
    ├── category-library-implementation.md  # 实施文档
    └── category-mapping-admin.md           # 管理界面文档
```

---

## 🚀 下一步行动

### 立即可做

1. **测试管理界面**
   ```bash
   npm run dev
   # 访问 http://localhost:3000/admin
   ```

2. **继续审核剩余分类**
   - 使用管理界面审核剩余 28 个低置信度分类
   - 优先级：书籍数 > 5000 的分类

3. **集成到前端导航**
   - 在主页或其他入口添加 [分类映射管理] 按钮
   - 方便快速访问

### 后续优化

1. **权限控制**
   - 为 admin 路由添加身份验证
   - 防止未授权访问

2. **批量操作**
   - 支持批量保存多个分类的修改
   - 支持导出/导入映射配置

3. **历史记录**
   - 记录每次修改的审计日志
   - 支持回滚到之前的版本

4. **自动同步**
   - 修改映射后自动同步到 books 表
   - 或提供一键同步按钮

---

## ❓ 常见问题

### Q: 修改映射后为什么书籍列表没变？

A: 当前设计只更新 `category_library_mapping` 表，不自动同步到 `books` 表。如需同步，执行：

```sql
UPDATE books b
SET library_types = cm.library_types
FROM category_library_mapping cm
WHERE b.category = cm.category
  AND cm.auto_assigned = FALSE;
```

### Q: 置信度低一定是问题吗？

A: 不一定。有些分类天然适合多个馆别（如"长篇小说"），均匀分布是正常的。置信度低只是提示需要人工审核，不代表数据错误。

### Q: 如何撤销人工审核？

A: 在管理界面点击该分类的 **[重置]** 按钮，会删除人工映射并恢复为自动分配状态。

### Q: 可以批量重算所有映射吗？

A: 可以。在 API 中不传 `category` 参数即可：

```bash
POST /api/admin/category-mapping
{
  "action": "recalculate"
}
```

### Q: 修改筛选条件后为什么列表没变？

A: 筛选条件修改后需要手动点击 **[刷新]** 按钮才会应用。这是为了避免频繁请求导致性能问题。

### Q: 为什么保存时提示"请至少选择一个馆别"？

A: 系统要求每个分类必须至少属于一个馆别。如果取消所有馆别选择，保存时会提示错误。

---

## 更新日志

### v1.1 - 2026-06-08

**修复**:
- ✅ 修复自动刷新导致的无限循环问题
- ✅ 添加馆别选择验证（至少选择一个馆别）
- ✅ 添加筛选条件重置按钮
- ✅ 改进确认对话框提示文本
- ✅ 添加操作成功提示
- ✅ 添加保存中的 Loading 状态

**优化**:
- ✅ 筛选条件修改后需手动刷新（避免频繁请求）
- ✅ 编辑面板显示"保存中..."状态
- ✅ 重置/重算操作增加详细说明

---

**文档版本**: v1.1  
**最后更新**: 2026-06-08  
**联系人**: 开发团队

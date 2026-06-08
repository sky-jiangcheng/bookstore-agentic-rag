# Category 二级分类利用 - P1 实施文档

## 实施概述

**实施日期**: 2026-06-08  
**状态**: ✅ 完成  
**数据库大小**: 268 MB / 512 MB (52.3%)  
**剩余空间**: 244 MB

---

## 创建的对象

### 1. 数据库表

#### `category_library_mapping` 映射表

```sql
CREATE TABLE category_library_mapping (
  category TEXT PRIMARY KEY,           -- 学科分类（如"长篇小说"、"童话"）
  library_types TEXT[] NOT NULL,       -- 适用馆别数组
  confidence REAL DEFAULT 1.0,         -- 置信度 (0-1)
  auto_assigned BOOLEAN DEFAULT TRUE,  -- 是否自动分配
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**数据量**: 31,811 条记录

---

### 2. API 端点

#### `/api/catalog/categories` - 分类导航 API

**用途**: 前端实现分类导航和筛选功能

**请求示例**:
```bash
# 获取全局分类排名
GET /api/catalog/categories

# 按馆别筛选分类
GET /api/catalog/categories?library_type=小学

# 搜索分类
GET /api/catalog/categories?search=小说

# 限制结果数
GET /api/catalog/categories?library_type=大学&limit=50
```

**响应示例**:
```json
{
  "library_type": "小学",
  "categories": [
    {
      "category": "童话",
      "book_count": 5116,
      "library_types": ["小学", "公共馆"],
      "confidence": 0.9234,
      "percentage": 12.45
    },
    {
      "category": "儿童故事",
      "book_count": 5665,
      "library_types": ["小学", "公共馆"],
      "confidence": 0.8756,
      "percentage": 10.23
    }
  ],
  "total_categories": 100,
  "total_books": 45678
}
```

---

#### `/api/admin/category-mapping` - 映射管理 API

**用途**: 管理员维护和审核 category 映射关系

**权限**: 需要认证（待实现）

**请求示例**:
```bash
# 获取映射列表
GET /api/admin/category-mapping?min_book_count=1000&max_confidence=0.3&limit=50

# 按馆别筛选
GET /api/admin/category-mapping?library_type=小学

# 更新映射
PATCH /api/admin/category-mapping
{
  "category": "企业管理",
  "library_types": ["公共馆", "成人目录", "大学"]
}

# 删除映射（恢复自动分配）
PATCH /api/admin/category-mapping
{
  "category": "企业管理",
  "action": "delete"
}

# 重新计算映射
POST /api/admin/category-mapping
{
  "action": "recalculate",
  "category": "企业管理"
}
```

---

#### `/api/admin/category-quality` - 质量监控 API

**用途**: 检测数据质量问题

**请求示例**:
```bash
# 获取质量汇总
GET /api/admin/category-quality

# 低置信度问题
GET /api/admin/category-quality?type=low_confidence

# 未映射分类
GET /api/admin/category-quality?type=unmapped

# 馆别不匹配
GET /api/admin/category-quality?type=mismatch

# 孤立映射
GET /api/admin/category-quality?type=orphan
```

**响应示例**:
```json
{
  "total_mappings": 31811,
  "total_books": 574783,
  "issues": {
    "low_confidence": 28,
    "unmapped_category": 0,
    "mismatched_library": 15,
    "orphan_mapping": 0,
    "total": 43
  }
}
```

---

## 使用场景

### 场景 1：前端分类导航

```typescript
// 用户选择"小学馆"后，展示可选的分类
const response = await fetch('/api/catalog/categories?library_type=小学');
const { categories } = await response.json();

// 渲染分类选择器
categories.forEach(cat => {
  console.log(`${cat.category}: ${cat.book_count} 本 (${cat.percentage}%)`);
});
```

### 场景 2：数据质量监控

```typescript
// 定期检查数据质量（每日 cron job）
const quality = await fetch('/api/admin/category-quality');
const { issues } = await quality.json();

if (issues.total > 0) {
  // 发送告警通知
  notifyAdmin(`${issues.total} 个分类数据质量问题待处理`);
}
```

### 场景 3：人工审核映射

```typescript
// 管理员查看低置信度映射
const issues = await fetch('/api/admin/category-quality?type=low_confidence');
const { issues: list } = await issues.json();

// 人工审核后更新
await fetch('/api/admin/category-mapping', {
  method: 'PATCH',
  body: JSON.stringify({
    category: '长篇小说',
    library_types: ['公共馆', '成人目录'], // 移除"初高中"
  }),
});
```

---

## 数据质量现状

### 低置信度分类（TOP 10）

| Category | Book Count | Library Types | Confidence |
|----------|-----------|---------------|------------|
| 长篇小说 | 18,157 | {公共馆，成人目录，初高中} | 0.204 |
| 英语 | 11,355 | {成人目录，初高中} | 0.264 |
| 散文集 | 8,611 | {初高中，小学，公共馆} | 0.203 |
| 童话 | 5,116 | {小学，公共馆} | 0.256 |
| 中国文学 | 3,548 | {初高中，成人目录} | 0.219 |

**说明**: 置信度低表示该分类在多个馆别中均匀分布，需要人工审核是否合理。

---

## 性能指标

### 查询性能

| 查询类型 | P50 | P95 | P99 |
|---------|-----|-----|-----|
| 分类导航 | ~50ms | ~150ms | ~300ms |
| 质量监控 | ~100ms | ~300ms | ~500ms |
| 映射更新 | ~20ms | ~50ms | ~100ms |

### 存储使用

| 对象 | 大小 |
|------|------|
| category_library_mapping 表 | ~9 MB |
| idx_category_mapping_library | ~3.3 MB |
| **总计** | **~12.3 MB** |

---

## 管理界面

### 分类映射管理对话框

**位置**: `/admin` 页面

**组件**: `CategoryMappingDialog`

**功能**:
- 📊 **映射列表** - 查看所有 category 映射关系，支持筛选和搜索
- ✏️ **在线编辑** - 直接修改适用馆别，标记为人工审核
- 🔄 **重新计算** - 基于最新数据重新计算映射关系
- 🔍 **质量监控** - 查看低置信度、未映射、不匹配等问题统计

**访问方式**:
```
https://your-domain.com/admin
```

---

## 下一步建议

### P1 - 尽快实施（可选）

1. **高置信度映射提取**
   - 筛选 `confidence >= 0.8` 的映射（221 条）
   - 用于自动化分类规则

2. **人工审核流程**
   - 对低置信度（< 0.3）且书籍多（> 1000）的 category 进行人工审核
   - 使用管理界面进行批量审核
   - 已完成 13 个分类的审核调整

### P2 - 按需实施

1. **分类推荐算法优化**
   - 结合 category + library_types 双重过滤
   - 提升搜索结果相关性

2. **自动化数据清洗**
   - 定期检测并修复 mismatched_library 问题
   - 自动清理 orphan_mapping

---

## 管理界面

### 分类映射管理对话框

**位置**: `/admin` 页面

**组件**: `CategoryMappingDialog`

**功能**:
- 📊 **映射列表** - 查看所有 category 映射关系，支持筛选和搜索
- ✏️ **在线编辑** - 直接修改适用馆别，标记为人工审核
- 🔄 **重新计算** - 基于最新数据重新计算映射关系
- 🔍 **质量监控** - 查看低置信度、未映射、不匹配等问题统计

**访问方式**:
```
https://your-domain.com/admin
```

---

## 附录：SQL 查询示例

### 查看某馆别的分类分布
```sql
SELECT 
  cm.category,
  COUNT(*) AS book_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM category_library_mapping cm
JOIN books ON books.category = cm.category
WHERE cm.library_types @> '{小学}'
GROUP BY cm.category
ORDER BY book_count DESC
LIMIT 20;
```

### 查找需要人工审核的分类
```sql
SELECT 
  cm.category,
  COUNT(*) AS book_count,
  cm.library_types,
  ROUND(cm.confidence::numeric, 3) AS confidence
FROM category_library_mapping cm
JOIN books ON books.category = cm.category
WHERE cm.confidence < 0.3
GROUP BY cm.category, cm.library_types, cm.confidence
HAVING COUNT(*) > 1000
ORDER BY book_count DESC;
```

### 查看学科分类与馆别不匹配
```sql
SELECT 
  category,
  library_types,
  COUNT(*) AS book_count
FROM books
WHERE category IN ('企业管理', '高等学校', '大学生')
  AND library_types @> ARRAY['小学']
GROUP BY category, library_types;
```

---

**文档版本**: v1.0  
**最后更新**: 2026-06-08

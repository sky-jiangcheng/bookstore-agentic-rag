'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { InputGroup } from '@/components/ui/input-group';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Settings, Search, Filter, RefreshCw, AlertCircle, X } from 'lucide-react';

interface CategoryMapping {
  category: string;
  library_types: string[];
  confidence: number;
  book_count: number;
  auto_assigned: boolean;
  created_at: string;
  updated_at: string;
}

interface QualityIssues {
  low_confidence: number;
  unmapped_category: number;
  mismatched_library: number;
  orphan_mapping: number;
  total: number;
}

interface CategoryQualityResponse {
  total_mappings: number;
  total_books: number;
  issues: QualityIssues;
}

const LIBRARY_TYPES = ['公共馆', '成人目录', '初高中', '小学', '大学'];

export function CategoryMappingDialog() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('manage');
  const [mappings, setMappings] = useState<CategoryMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qualityData, setQualityData] = useState<CategoryQualityResponse | null>(null);
  
  // 筛选条件
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLibraryType, setFilterLibraryType] = useState<string>('all');
  const [minBookCount, setMinBookCount] = useState(1000);
  const [maxConfidence, setMaxConfidence] = useState(0.3);
  const [showLowConfidenceOnly, setShowLowConfidenceOnly] = useState(false);

  // 编辑状态
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingLibraryTypes, setEditingLibraryTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // 加载映射数据
  const loadMappings = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        min_book_count: minBookCount.toString(),
        max_confidence: maxConfidence.toString(),
        limit: '100',
      });
      if (filterLibraryType !== 'all') {
        params.append('library_type', filterLibraryType);
      }

      const response = await fetch(`/api/admin/category-mapping?${params}`);
      if (!response.ok) throw new Error('加载失败');
      const data = await response.json();
      setMappings(data.mappings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  // 加载质量数据
  const loadQualityData = async () => {
    try {
      const response = await fetch('/api/admin/category-quality');
      if (!response.ok) throw new Error('加载失败');
      const data = await response.json();
      setQualityData(data);
    } catch (err) {
      console.error('加载质量数据失败:', err);
    }
  };

  useEffect(() => {
    if (open) {
      loadMappings();
      loadQualityData();
    }
  }, [open]);

  // 重置编辑状态当筛选条件变化时
  useEffect(() => {
    if (!editingCategory) return;
    
    // 检查当前编辑的分类是否还在筛选结果中
    const editingMapping = mappings.find(m => m.category === editingCategory);
    if (!editingMapping) {
      cancelEditing();
      return;
    }
    
    // 检查是否被筛选条件过滤掉
    let isInFiltered = true;
    if (searchTerm && !editingMapping.category.includes(searchTerm)) isInFiltered = false;
    if (showLowConfidenceOnly && editingMapping.confidence >= 0.3) isInFiltered = false;
    if (filterLibraryType !== 'all' && !editingMapping.library_types.includes(filterLibraryType)) isInFiltered = false;
    
    if (!isInFiltered) {
      cancelEditing();
    }
  }, [searchTerm, showLowConfidenceOnly, filterLibraryType, mappings]);

  // 筛选映射
  const filteredMappings = mappings.filter((mapping) => {
    if (searchTerm && !mapping.category.includes(searchTerm)) return false;
    if (showLowConfidenceOnly && mapping.confidence >= 0.3) return false;
    return true;
  });

  // 切换馆别选择
  const toggleLibraryType = (libType: string) => {
    setEditingLibraryTypes((prev) =>
      prev.includes(libType)
        ? prev.filter((t) => t !== libType)
        : [...prev, libType]
    );
  };

  // 保存编辑
  const saveMapping = async () => {
    if (!editingCategory) return;
    if (editingLibraryTypes.length === 0) {
      alert('请至少选择一个馆别');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/admin/category-mapping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: editingCategory,
          library_types: editingLibraryTypes,
        }),
      });
      if (!response.ok) throw new Error('保存失败');
      setEditingCategory(null);
      loadMappings();
      loadQualityData();
      alert('保存成功！映射已更新为人工审核状态。');
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 重新计算映射
  const recalculateMapping = async (category: string) => {
    if (!confirm(`确定要重新计算 "${category}" 的映射关系吗？\n\n系统会基于当前书籍的实际分布重新计算馆别映射和置信度。`)) return;
    try {
      const response = await fetch('/api/admin/category-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recalculate',
          category,
        }),
      });
      if (!response.ok) throw new Error('重新计算失败');
      loadMappings();
      loadQualityData();
      alert('重新计算成功！映射已更新为自动分配状态。');
    } catch (err) {
      alert(err instanceof Error ? err.message : '重新计算失败');
    }
  };

  // 重置为自动分配
  const resetToAuto = async (category: string) => {
    if (!confirm(`确定要将 "${category}" 恢复为自动分配吗？\n\n这将删除人工映射，系统会基于最新数据重新自动分配馆别。`)) return;
    try {
      const response = await fetch('/api/admin/category-mapping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          action: 'delete',
        }),
      });
      if (!response.ok) throw new Error('重置失败');
      loadMappings();
      loadQualityData();
      alert('已重置为自动分配状态。');
    } catch (err) {
      alert(err instanceof Error ? err.message : '重置失败');
    }
  };

  const startEditing = (mapping: CategoryMapping) => {
    setEditingCategory(mapping.category);
    setEditingLibraryTypes(mapping.library_types);
  };

  const cancelEditing = () => {
    setEditingCategory(null);
    setEditingLibraryTypes([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="w-4 h-4 mr-2" />
          分类映射管理
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>分类映射管理</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList>
            <TabsTrigger value="manage">映射管理</TabsTrigger>
            <TabsTrigger value="quality">
              质量监控
              {qualityData?.issues.total ? (
                <Badge variant="destructive" className="ml-2 h-5">
                  {qualityData.issues.total}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manage" className="mt-4">
            {/* 筛选工具栏 */}
            <div className="flex gap-4 mb-4 flex-wrap items-center">
              <InputGroup className="flex-1 min-w-[200px]">
                <Search className="w-4 h-4" />
                <Input
                  placeholder="搜索分类..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  disabled={!!editingCategory}
                />
              </InputGroup>
              
              <Select value={filterLibraryType} onValueChange={setFilterLibraryType} disabled={!!editingCategory}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="馆别筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部馆别</SelectItem>
                  {LIBRARY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Switch
                  checked={showLowConfidenceOnly}
                  onCheckedChange={setShowLowConfidenceOnly}
                  id="low-confidence-filter"
                  disabled={!!editingCategory}
                />
                <label htmlFor="low-confidence-filter" className="text-sm">
                  仅显示低置信度
                </label>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={loadMappings}
                disabled={loading || !!editingCategory}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            </div>

            {editingCategory && (
              <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-3 mb-4 text-sm">
                <span className="text-blue-600 font-medium">正在编辑：</span>
                <span className="text-blue-800">{editingCategory}</span>
                <span className="text-blue-600 ml-2">完成编辑或取消后才能使用筛选功能</span>
              </div>
            )}

            {/* 筛选条件说明 */}
            <div className="bg-muted/50 rounded-lg p-3 mb-4 text-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  <span className="font-medium">当前筛选条件:</span>
                </div>
                {(filterLibraryType !== 'all' || minBookCount !== 1000 || maxConfidence !== 0.3) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                      setFilterLibraryType('all');
                      setMinBookCount(1000);
                      setMaxConfidence(0.3);
                    }}
                  >
                    重置筛选
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-muted-foreground">最少书籍数:</span>{' '}
                  <span className="font-mono">{minBookCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">最高置信度:</span>{' '}
                  <span className="font-mono">{maxConfidence}</span>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                提示：修改筛选条件后请点击右上角 [刷新] 按钮
              </div>
            </div>

            {/* 数据表格 */}
            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : loading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>分类</TableHead>
                      <TableHead>书籍数</TableHead>
                      <TableHead>适用馆别</TableHead>
                      <TableHead>置信度</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMappings.map((mapping) => (
                      <TableRow key={mapping.category}>
                        <TableCell className="font-medium">
                          {mapping.category}
                        </TableCell>
                        <TableCell>{mapping.book_count.toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {mapping.library_types.map((type) => (
                              <Badge key={type} variant="secondary">
                                {type}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={mapping.confidence * 100}
                              className={`w-16 h-2 ${
                                mapping.confidence < 0.3 ? 'bg-yellow-500/20' : 'bg-green-500/20'
                              }`}
                            />
                            <span
                              className={`text-xs ${
                                mapping.confidence < 0.3 ? 'text-yellow-600' : 'text-green-600'
                              }`}
                            >
                              {(mapping.confidence * 100).toFixed(1)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {mapping.auto_assigned ? (
                            <Badge variant="outline">自动</Badge>
                          ) : (
                            <Badge variant="default">人工</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editingCategory === mapping.category ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={saveMapping}
                                disabled={saving}
                              >
                                保存
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelEditing}
                                disabled={saving}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEditing(mapping)}
                                disabled={!!editingCategory}
                              >
                                编辑
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => recalculateMapping(mapping.category)}
                                disabled={!!editingCategory}
                              >
                                重算
                              </Button>
                              {!mapping.auto_assigned && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => resetToAuto(mapping.category)}
                                  disabled={!!editingCategory}
                                >
                                  重置
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}

            {/* 编辑面板 */}
            {editingCategory && (
              <div className="mt-4 border rounded-lg p-4 bg-muted/30">
                <h4 className="font-medium mb-3">
                  编辑：{editingCategory}
                </h4>
                <div className="mb-4">
                  <label className="text-sm text-muted-foreground mb-2 block">
                    适用馆别
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {LIBRARY_TYPES.map((type) => (
                      <Button
                        key={type}
                        variant={
                          editingLibraryTypes.includes(type)
                            ? 'default'
                            : 'outline'
                        }
                        size="sm"
                        onClick={() => toggleLibraryType(type)}
                        disabled={saving}
                      >
                        {type}
                      </Button>
                    ))}
                  </div>
                  {saving && (
                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                      <Spinner className="w-3 h-3" />
                      正在保存...
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button onClick={saveMapping} disabled={saving}>
                    {saving ? '保存中...' : '保存修改'}
                  </Button>
                  <Button variant="outline" onClick={cancelEditing} disabled={saving}>
                    取消
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="quality" className="mt-4">
            {qualityData ? (
              <div className="space-y-6">
                {/* 汇总统计 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border rounded-lg p-4">
                    <div className="text-2xl font-bold">{qualityData.total_mappings.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">总映射数</div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="text-2xl font-bold">{qualityData.total_books.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">覆盖书籍</div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-600">{qualityData.issues.low_confidence}</div>
                    <div className="text-sm text-muted-foreground">低置信度</div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="text-2xl font-bold text-red-600">{qualityData.issues.total}</div>
                    <div className="text-sm text-muted-foreground">总问题数</div>
                  </div>
                </div>

                {/* 问题详情 */}
                <div className="border rounded-lg">
                  <div className="p-4 border-b">
                    <h3 className="font-medium">问题分类</h3>
                  </div>
                  <div className="divide-y">
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-yellow-500" />
                        <div>
                          <div className="font-medium">低置信度映射</div>
                          <div className="text-sm text-muted-foreground">
                            置信度 &lt; 0.3，书籍数 &gt; 1000
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary">{qualityData.issues.low_confidence}</Badge>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-orange-500" />
                        <div>
                          <div className="font-medium">未映射分类</div>
                          <div className="text-sm text-muted-foreground">
                            存在于 books 表但不在映射表中
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary">{qualityData.issues.unmapped_category}</Badge>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-red-500" />
                        <div>
                          <div className="font-medium">馆别不匹配</div>
                          <div className="text-sm text-muted-foreground">
                            书籍的 library_types 与映射关系不一致
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary">{qualityData.issues.mismatched_library}</Badge>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-500" />
                        <div>
                          <div className="font-medium">孤立映射</div>
                          <div className="text-sm text-muted-foreground">
                            映射存在但数据库中无对应书籍
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary">{qualityData.issues.orphan_mapping}</Badge>
                    </div>
                  </div>
                </div>

                {/* 快捷操作 */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium mb-3">快捷操作</h3>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowLowConfidenceOnly(true);
                        setActiveTab('manage');
                      }}
                    >
                      查看低置信度分类
                    </Button>
                    <Button
                      variant="outline"
                      onClick={loadQualityData}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      刷新数据
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

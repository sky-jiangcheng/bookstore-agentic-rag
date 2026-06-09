import { CategoryMappingDialog } from '@/components/admin/CategoryMappingDialog';

export default function AdminPage() {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">管理后台</h1>
        
        <div className="grid gap-6">
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">分类映射管理</h2>
            <p className="text-muted-foreground mb-4">
              管理和审核 book_category 与 library_codes 的映射关系，支持人工调整、批量操作和质量监控。
            </p>
            <CategoryMappingDialog />
          </div>
        </div>
      </div>
    </div>
  );
}

import { ArrowRight, Search } from 'lucide-react';

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  isLoading: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <form onSubmit={onSubmit} className="query-composer mx-auto flex w-full max-w-4xl items-center gap-2">
        <Search className="ml-2 h-4 w-4 shrink-0 text-slate-500" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="描述主题、读者、预算或不想出现的内容"
          disabled={isLoading}
          className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
        />
        <button
          type="submit"
          disabled={!value.trim() || isLoading}
          className="primary-action mr-1 inline-flex items-center gap-1.5"
        >
          <span>{isLoading ? '处理中…' : '解析需求'}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

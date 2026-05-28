import { Input, Button } from 'tdesign-react';
import { SearchIcon } from 'tdesign-icons-react';

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent pt-10 pb-6 px-6">
      <div className="max-w-[1280px] mx-auto">
        <div className="cnbc-input-container p-2">
          <form onSubmit={onSubmit} className="flex gap-3">
            <Input
              value={value}
              onChange={(val) => onChange(String(val))}
              placeholder="输入你的选书要求..."
              size="large"
              className="flex-1"
              disabled={isLoading}
              style={{ border: 'none', boxShadow: 'none' }}
            />
            <Button
              type="submit"
              theme="primary"
              size="large"
              loading={isLoading}
              disabled={!value.trim() || isLoading}
              icon={<SearchIcon />}
            >
              搜索推荐
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

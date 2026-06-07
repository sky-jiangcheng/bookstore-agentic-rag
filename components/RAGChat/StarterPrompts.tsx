const STARTER_PROMPTS = [
  '推荐人工智能入门书籍',
  '给高中生推荐历史阅读书籍',
  '预算 200 元，推荐适合运营学习的书籍',
  '推荐适合书店陈列的畅销科普书籍',
];

export function StarterPrompts({
  isLoading,
  onSelect,
}: {
  isLoading: boolean;
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {STARTER_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          disabled={isLoading}
          onClick={() => onSelect(prompt)}
          className="min-h-14 rounded-md border border-[#2d3037] bg-[#14161a] px-3 py-2.5 text-left text-xs leading-5 text-slate-400 hover:border-[#555b66] hover:text-slate-200 disabled:opacity-50"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

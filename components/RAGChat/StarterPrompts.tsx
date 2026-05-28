import { Button, Loading } from 'tdesign-react';

const STARTER_PROMPTS = [
  '推荐人工智能入门书籍',
  '给高中生推荐历史阅读书籍',
  '预算200元，推荐适合运营学习的书籍',
  '推荐适合书店陈列的畅销科普书籍',
];

export function StarterPrompts({
  isLoading,
  currentPhase,
  onSelect,
}: {
  isLoading: boolean;
  currentPhase: string | null;
  onSelect: (prompt: string) => void;
}) {
  const phaseMap: Record<string, string> = {
    requirement_analysis: '正在分析你的需求',
    retrieval: '正在从书库里筛选候选书',
    generation: '正在生成推荐单和推荐理由',
    evaluation: '正在复核推荐质量',
  };

  return (
    <div className="cnbc-card p-6 mb-8">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">热门推荐词</h2>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {isLoading ? (
            <>
              <Loading size="small" />
              <span>{currentPhase ? phaseMap[currentPhase] || '处理中' : '处理中'}</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>系统就绪</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {STARTER_PROMPTS.map((prompt) => (
          <Button
            key={prompt}
            variant="outline"
            theme="default"
            size="large"
            onClick={() => onSelect(prompt)}
            className="cnbc-starter-btn"
          >
            {prompt}
          </Button>
        ))}
      </div>
    </div>
  );
}

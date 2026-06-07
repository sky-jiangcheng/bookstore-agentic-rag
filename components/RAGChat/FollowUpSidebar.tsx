import { useMemo } from 'react';
import { Compass, ChevronRight, HelpCircle, PiggyBank, BarChart2 } from 'lucide-react';
import { buildFollowUpPrompts } from '@/components/rag-chat-utils';
import type { MessageType } from '@/components/rag-chat-utils';

export function FollowUpSidebar({
  lastUserQuery,
  lastAssistantMessage,
  onSubmit,
}: {
  lastUserQuery: string;
  lastAssistantMessage?: MessageType;
  onSubmit: (query: string) => void;
}) {
  const followUpPrompts = useMemo(
    () => buildFollowUpPrompts(lastUserQuery, lastAssistantMessage),
    [lastAssistantMessage, lastUserQuery]
  );

  const budget = lastAssistantMessage?.requirement?.constraints?.budget;
  const totalPrice = lastAssistantMessage?.totalPrice ?? 0;

  const budgetPercent = useMemo(() => {
    if (!budget || budget <= 0) return 0;
    return Math.min(100, Math.round((totalPrice / budget) * 100));
  }, [budget, totalPrice]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    lastAssistantMessage?.recommendations?.forEach((book) => {
      if (book.category) {
        counts[book.category] = (counts[book.category] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [lastAssistantMessage]);

  const hasRecommendations = lastAssistantMessage?.recommendations && lastAssistantMessage.recommendations.length > 0;

  return (
    <div className="space-y-6">
      {/* 1. Live Stats Widgets (Only shown when there are recommendations) */}
      {hasRecommendations && (
        <div className="glass-panel rounded-2xl p-5 border border-white/5 shadow-sm animate-fade-in-up">
          <div className="flex items-center gap-2 mb-4 pb-2.5 border-b border-slate-850 border-slate-800/60">
            <BarChart2 className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">本轮推荐画像</h3>
          </div>

          <div className="space-y-4">
            {/* Budget Gauge */}
            <div>
              <div className="flex justify-between items-center text-xs font-semibold text-slate-400 mb-1.5">
                <span className="flex items-center gap-1">
                  <PiggyBank className="w-3.5 h-3.5 text-slate-500" />
                  <span>预算支出进度</span>
                </span>
                <span>
                  {budget ? `¥${totalPrice.toFixed(0)} / ¥${budget}` : `总额 ¥${totalPrice.toFixed(0)}`}
                </span>
              </div>

              {budget ? (
                <div className="w-full bg-slate-950/60 border border-white/5 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      budgetPercent > 100 ? 'bg-rose-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${budgetPercent}%` }}
                  />
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 italic">未设置预算硬约束</div>
              )}
            </div>

            {/* Category breakdown tags */}
            {categoryCounts.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2">热门分类占比</div>
                <div className="flex flex-wrap gap-1.5">
                  {categoryCounts.map(([cat, count]) => (
                    <span
                      key={cat}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    >
                      {cat} ({count}本)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Follow-Up Questions Panel */}
      <div className="glass-panel rounded-2xl p-5 border border-white/5 shadow-sm animate-fade-in-up">
        <div className="flex items-center gap-2 mb-4 pb-2.5 border-b border-slate-800/60">
          <Compass className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">快捷追问探索</h3>
        </div>

        {followUpPrompts.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {followUpPrompts.map((prompt, index) => (
              <button
                key={index}
                onClick={() => onSubmit(prompt)}
                className="group w-full flex items-center justify-between text-left p-3 rounded-xl bg-slate-950/30 border border-slate-850 border-slate-800/80 text-xs md:text-sm font-medium text-slate-300 hover:bg-blue-500/5 hover:border-blue-500/30 hover:text-blue-400 transition-all duration-300"
              >
                <span className="line-clamp-2 pr-2 leading-relaxed">{prompt}</span>
                <ChevronRight className="w-4 h-4 text-slate-550 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center text-slate-500">
            <HelpCircle className="w-8 h-8 text-slate-600 mb-2.5 stroke-1" />
            <p className="text-xs leading-relaxed max-w-[180px]">
              输入您的第一个图书需求后，我将在此为您实时汇编推荐追问。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Filter, Plus, Sliders, Trash2 } from 'lucide-react';

interface TuningPanelProps {
  targetCount: number;
  onChangeTargetCount: (val: number) => void;
  categoryWeight: number;
  onChangeCategoryWeight: (val: number) => void;
  keywordWeight: number;
  onChangeKeywordWeight: (val: number) => void;
  dbExclusions: string[];
  selectedExclusions: string[];
  onChangeExclusions: (exclusions: string[]) => void;
  suggestedKeywords?: string[];
  selectedKeywords?: string[];
  onChangeKeywords?: (keywords: string[]) => void;
  lastSql?: string;
  onClearSession: () => void;
  suggestionCount?: number;
}

export function TuningPanel({
  targetCount,
  onChangeTargetCount,
  categoryWeight,
  onChangeCategoryWeight,
  keywordWeight,
  onChangeKeywordWeight,
  dbExclusions,
  selectedExclusions,
  onChangeExclusions,
  suggestedKeywords,
  selectedKeywords = [],
  onChangeKeywords,
  onClearSession,
  suggestionCount = 0,
}: TuningPanelProps) {
  const [customExclusion, setCustomExclusion] = useState('');
  const [customKeyword, setCustomKeyword] = useState('');

  const toggleExclusion = (keyword: string) => {
    onChangeExclusions(
      selectedExclusions.includes(keyword)
        ? selectedExclusions.filter((item) => item !== keyword)
        : [...selectedExclusions, keyword],
    );
  };

  const addCustomExclusion = () => {
    const keyword = customExclusion.trim();
    if (!keyword || selectedExclusions.includes(keyword)) return;
    onChangeExclusions([...selectedExclusions, keyword]);
    setCustomExclusion('');
  };

  const toggleKeyword = (keyword: string) => {
    if (!onChangeKeywords) return;
    onChangeKeywords(
      selectedKeywords.includes(keyword)
        ? selectedKeywords.filter((item) => item !== keyword)
        : [...selectedKeywords, keyword],
    );
  };

  const addCustomKeyword = () => {
    if (!onChangeKeywords) return;
    const keyword = customKeyword.trim();
    if (!keyword || selectedKeywords.includes(keyword)) return;
    onChangeKeywords([...selectedKeywords, keyword]);
    setCustomKeyword('');
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="workspace-panel p-4">
        <div className="mb-4 flex items-center gap-2 border-b border-white/5 pb-3">
          <Sliders className="h-4 w-4 text-amber-300" />
          <h3 className="text-sm font-semibold text-slate-200">查询参数草稿</h3>
        </div>
        <div className="space-y-5">
          <RangeField label="推荐数量" value={`${targetCount} 本`}>
            <input type="range" min="5" max="30" value={targetCount} onChange={(event) => onChangeTargetCount(Number(event.target.value))} />
          </RangeField>
          <RangeField label="分类匹配权重" value={categoryWeight.toFixed(1)}>
            <input type="range" min="0" max="3" step="0.1" value={categoryWeight} onChange={(event) => onChangeCategoryWeight(Number(event.target.value))} />
          </RangeField>
          <RangeField label="关键词匹配权重" value={keywordWeight.toFixed(1)}>
            <input type="range" min="0" max="3" step="0.1" value={keywordWeight} onChange={(event) => onChangeKeywordWeight(Number(event.target.value))} />
          </RangeField>
        </div>
      </section>

      {onChangeKeywords && (
        <section className="workspace-panel p-4">
          <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-amber-300" />
              <h3 className="text-sm font-semibold text-slate-200">ILIKE 搜索关键词</h3>
            </div>
            <span className="text-[10px] text-amber-200">{suggestedKeywords?.length ?? 0} 项</span>
          </div>

          {suggestedKeywords && suggestedKeywords.length > 0 ? (
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {suggestedKeywords.map((word) => {
                const selected = selectedKeywords.includes(word);
                return (
                  <button
                    key={word}
                    type="button"
                    onClick={() => toggleKeyword(word)}
                    className={selected ? 'filter-chip filter-chip-active' : 'filter-chip'}
                  >
                    {word}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-700 px-3 py-4 text-xs leading-5 text-slate-500">
              输入需求后，将在这里建议搜索关键词。
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <input
              value={customKeyword}
              onChange={(event) => setCustomKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addCustomKeyword();
                }
              }}
              placeholder="添加搜索关键词"
              className="min-w-0 flex-1 rounded-md border border-slate-700 bg-[#101216] px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-amber-500/60"
            />
            <button type="button" onClick={addCustomKeyword} className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-2.5 text-xs text-amber-200 hover:bg-amber-500/10">
              <Plus className="h-3.5 w-3.5" />
              添加搜索关键词
            </button>
          </div>

          <div className="mt-4 border-t border-white/5 pt-3">
            <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>生效搜索关键词</span>
              <span>{selectedKeywords.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedKeywords.map((word) => (
                <span key={word} className="filter-chip filter-chip-active group">
                  <button type="button" onClick={() => { setCustomKeyword(word); toggleKeyword(word); }} className="hover:text-amber-200">
                    {word}
                  </button>
                  <button type="button" onClick={() => toggleKeyword(word)} className="ml-1 text-slate-500 hover:text-rose-400">
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="workspace-panel p-4">
        <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-amber-300" />
            <h3 className="text-sm font-semibold text-slate-200">碰撞建议与排除词</h3>
          </div>
          <span className="text-[10px] text-amber-200">{suggestionCount} 项建议</span>
        </div>

        {dbExclusions.length > 0 ? (
          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
            {dbExclusions.map((word) => {
              const selected = selectedExclusions.includes(word);
              return (
                <button
                  key={word}
                  type="button"
                  onClick={() => toggleExclusion(word)}
                  className={selected ? 'filter-chip filter-chip-active' : 'filter-chip'}
                >
                  {word}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-700 px-3 py-4 text-xs leading-5 text-slate-500">
            输入需求后，将在这里建议可能需要排除的关键词。
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <input
            value={customExclusion}
            onChange={(event) => setCustomExclusion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addCustomExclusion();
              }
            }}
            placeholder="人工输入排除词"
            className="min-w-0 flex-1 rounded-md border border-slate-700 bg-[#101216] px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-amber-500/60"
          />
          <button type="button" onClick={addCustomExclusion} className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-2.5 text-xs text-amber-200 hover:bg-amber-500/10">
            <Plus className="h-3.5 w-3.5" />
            添加排除词
          </button>
        </div>

        <div className="mt-4 border-t border-white/5 pt-3">
          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>确认后生效排除词</span>
            <span>{selectedExclusions.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedExclusions.map((word) => (
              <span key={word} className="filter-chip filter-chip-active group">
                <button type="button" onClick={() => { setCustomExclusion(word); toggleExclusion(word); }} className="hover:text-amber-200">
                  {word}
                </button>
                <button type="button" onClick={() => toggleExclusion(word)} className="ml-1 text-slate-500 hover:text-rose-400">
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      </section>

      <button type="button" onClick={onClearSession} className="inline-flex items-center justify-center gap-2 rounded-md border border-rose-500/30 px-3 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10">
        <Trash2 className="h-4 w-4" />
        重置推荐会话
      </button>
    </div>
  );
}

function RangeField({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-amber-200">{value}</span>
      </span>
      <span className="range-control block">{children}</span>
    </label>
  );
}

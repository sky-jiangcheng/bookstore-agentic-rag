import { Sparkles, Bookmark, Building, Tag } from 'lucide-react';
import type { BookRecommendation } from '@/components/rag-chat-utils';

const getCoverGradient = (category: string | null, title: string) => {
  const gradients = [
    'from-indigo-600 to-blue-700',
    'from-emerald-600 to-teal-700',
    'from-purple-600 to-pink-700',
    'from-amber-500 to-orange-700',
    'from-rose-500 to-red-700',
    'from-sky-500 to-indigo-700',
  ];
  let hash = 0;
  const key = category || title || 'Book';
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
};

export function BookCard({ book }: { book: BookRecommendation }) {
  const coverGradient = getCoverGradient(book.category || null, book.title);
  const matchPct = book.match_score ? Math.round(book.match_score * 100) : 90;

  return (
    <div className="glass-panel glass-panel-interactive rounded-2xl overflow-hidden border border-slate-800/50 p-4 flex flex-col sm:flex-row gap-4 animate-fade-in-up">
      {/* 3D simulated book cover on the left */}
      <div className="shrink-0 flex justify-center sm:block">
        <div className={`book-spine-effect w-[90px] h-[125px] rounded-lg bg-gradient-to-br ${coverGradient} shadow-lg shadow-black/40 flex flex-col justify-between p-2.5 text-white relative overflow-hidden shrink-0 transform hover:rotate-1 transition-transform duration-300`}>
          {/* Subtle patterns on book cover */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_30%_20%,#fff_0%,transparent_60%)]" />

          <div className="flex items-center justify-between">
            <Bookmark className="w-3.5 h-3.5 opacity-80" />
            <span className="text-[9px] font-mono opacity-70 tracking-widest">RAG SELECT</span>
          </div>

          <div className="my-auto">
            <h4 className="text-[10px] font-bold tracking-tight line-clamp-3 leading-tight font-sans text-center px-1">
              {book.title}
            </h4>
          </div>

          <div className="border-t border-white/20 pt-1.5 flex justify-between items-center">
            <span className="text-[8px] opacity-75 truncate max-w-[50px]">{book.author}</span>
            <span className="text-[8px] font-bold bg-white/20 px-1 rounded">¥{Math.round(book.price)}</span>
          </div>
        </div>
      </div>

      {/* Book description & metadata on the right */}
      <div className="flex-1 flex flex-col justify-between min-w-0">
        <div>
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <h3 className="text-base font-bold text-slate-100 line-clamp-1 leading-snug group-hover:text-blue-400 transition-colors" title={book.title}>
              {book.title}
            </h3>
            <div className="shrink-0 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                ¥{Number(book.price).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2.5">
            <span className="text-xs text-slate-400 font-medium">作者：{book.author}</span>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span className="inline-flex items-center gap-0.5 text-xs text-blue-400 font-bold">
              <Sparkles className="w-3 h-3 animate-pulse" />
              <span>{matchPct}% 匹配度</span>
            </span>
          </div>

          <p className="text-xs md:text-sm text-slate-300 leading-relaxed line-clamp-3 mb-3" title={book.explanation}>
            {book.explanation}
          </p>
        </div>

        {/* Card Footer tags */}
        {(book.publisher || book.category) && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-450 text-slate-400">
            {book.publisher && (
              <span className="inline-flex items-center gap-1">
                <Building className="w-3 h-3 text-slate-500" />
                <span>{book.publisher}</span>
              </span>
            )}
            {book.publisher && book.category && <span className="text-slate-800">|</span>}
            {book.category && (
              <span className="inline-flex items-center gap-1">
                <Tag className="w-3 h-3 text-slate-500" />
                <span className="font-semibold text-slate-350">{book.category}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

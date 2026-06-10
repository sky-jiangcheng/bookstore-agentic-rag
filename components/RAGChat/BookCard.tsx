import { Sparkles, Bookmark, Building, Calendar, Tag, Package } from 'lucide-react';
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
  const matchPct = book.match_score != null ? Math.round(book.match_score * 100) : null;

  return (
    <article className="glass-panel glass-panel-interactive grid grid-cols-[42px_minmax(0,1fr)] gap-3 rounded-xl border border-slate-800/50 p-3 animate-fade-in-up sm:grid-cols-[48px_minmax(0,1fr)_auto]">
      <div className={`book-spine-effect relative flex h-16 w-[42px] shrink-0 flex-col justify-between overflow-hidden rounded-md bg-gradient-to-br ${coverGradient} p-1.5 text-white shadow-md shadow-black/30 sm:h-[70px] sm:w-12`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#fff_0%,transparent_60%)] opacity-10" />
        <Bookmark className="relative h-2.5 w-2.5 opacity-80" />
        <h4 className="relative line-clamp-3 text-center font-sans text-[7px] font-bold leading-tight">
          {book.title}
        </h4>
        <span className="relative text-center font-mono text-[6px] tracking-wider opacity-65">RAG</span>
      </div>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-bold leading-5 text-slate-100" title={book.title}>
            {book.title}
          </h3>
          <div className="flex shrink-0 items-center gap-1 sm:hidden">
            <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
              ¥{Number(book.price).toFixed(2)}
            </span>
            {matchPct !== null && (
              <span className="rounded-md border border-blue-500/25 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-400">
                {matchPct}%
              </span>
            )}
          </div>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500">
          <span className="font-medium text-slate-400">{book.author}</span>
          {book.publisher && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Building className="h-2.5 w-2.5 shrink-0" />
              <span className="max-w-48 truncate">{book.publisher}</span>
            </span>
          )}
          {book.publication_year && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              {book.publication_year} 年
            </span>
          )}
          {book.category && (
            <span className="inline-flex items-center gap-1">
              <Tag className="h-2.5 w-2.5" />
              {book.category}
            </span>
          )}
          {book.stock != null && (
            <span className="inline-flex items-center gap-1">
              <Package className="h-2.5 w-2.5" />
              库存 {book.stock}
            </span>
          )}
          {book.book_id && <span className="font-mono text-slate-600">ID {book.book_id}</span>}
        </div>

        {book.explanation && (
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-[1.45] text-slate-300" title={book.explanation}>
            {book.explanation}
          </p>
        )}
      </div>

      <div className="hidden min-w-[76px] flex-col items-end justify-between border-l border-slate-800/60 pl-3 sm:flex">
        <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-400">
          ¥{Number(book.price).toFixed(2)}
        </span>
        {matchPct !== null ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-400">
            <Sparkles className="h-3 w-3" />
            {matchPct}% 匹配
          </span>
        ) : (
          <span className="text-[10px] text-slate-600">已匹配</span>
        )}
      </div>
    </article>
  );
}

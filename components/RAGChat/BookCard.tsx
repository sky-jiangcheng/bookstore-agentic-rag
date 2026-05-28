import { Tag, Card } from 'tdesign-react';
import type { BookRecommendation } from '@/components/rag-chat-utils';

export function BookCard({ book }: { book: BookRecommendation }) {
  return (
    <Card className="cnbc-book-card">
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-slate-900 line-clamp-2 leading-snug">{book.title}</h3>
            <p className="text-sm text-slate-500 mt-1.5">{book.author}</p>
          </div>
          <Tag theme="success" variant="light">
            ¥{Number(book.price).toFixed(2)}
          </Tag>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">{book.explanation}</p>
        {book.publisher && (
          <div className="flex items-center gap-2 text-xs text-slate-400 pt-2 border-t border-slate-100">
            <span>出版社：{book.publisher}</span>
            {book.category && <span> | 分类：{book.category}</span>}
          </div>
        )}
      </div>
    </Card>
  );
}

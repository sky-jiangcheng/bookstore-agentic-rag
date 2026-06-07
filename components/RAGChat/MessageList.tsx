import { useEffect, useRef } from 'react';
import { Tag, Loading, Button } from 'tdesign-react';
import { DownloadIcon } from 'tdesign-icons-react';
import type { MessageType } from '@/components/rag-chat-utils';
import { BookCard } from '@/components/RAGChat/BookCard';

function getAggregatedStats(messages: MessageType[]) {
  const seenBookIds = new Set<string>();
  let totalBooks = 0;
  let totalPrice = 0;

  messages.forEach(msg => {
    if (msg.role === 'assistant' && msg.recommendations) {
      msg.recommendations.forEach(book => {
        const bookId = String(book.book_id);
        if (bookId && !seenBookIds.has(bookId)) {
          seenBookIds.add(bookId);
          totalBooks++;
          if (book.price) {
            totalPrice += Number(book.price);
          }
        }
      });
    }
  });

  return { totalBooks, totalPrice };
}

export function MessageList({
  messages,
  exporting,
  onExport,
}: {
  messages: MessageType[];
  exporting: boolean;
  onExport: (message: MessageType) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div ref={scrollRef} className="overflow-y-auto px-4 py-6" style={{ maxHeight: '68vh' }} role="region" aria-live="polite">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-24 h-24 rounded-full bg-sky-50 flex items-center justify-center mb-6 text-5xl">📚</div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-4">把需求说具体一点，结果会更好</h2>
          <p className="text-slate-600 max-w-xl leading-relaxed">
            例如告诉我目标读者、主题方向、预算、希望推荐几本，或者直接说"排除教材""适合陈列销售"等要求。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="overflow-y-auto px-4 py-6" style={{ maxHeight: '68vh' }} role="region" aria-live="polite">
      <div className="space-y-10">
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            messages={messages}
            exporting={exporting}
            onExport={onExport}
          />
        ))}
      </div>
    </div>
  );
}

function MessageItem({
  message,
  messages,
  exporting,
  onExport,
}: {
  message: MessageType;
  messages: MessageType[];
  exporting: boolean;
  onExport: (message: MessageType) => void;
}) {
  const stats = getAggregatedStats(messages);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${message.role === 'assistant' ? 'bg-sky-600' : 'bg-amber-500'}`} />
          <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            {message.role === 'assistant' ? '系统推荐' : '您的需求'}
          </span>
        </div>
        {message.status === 'streaming' && (
          <Tag variant="outline" theme="primary" size="small">
            <Loading size="small" /> 处理中
          </Tag>
        )}
        {message.status === 'error' && (
          <Tag theme="danger" size="small">需要重试</Tag>
        )}
      </div>

      <div className="whitespace-pre-wrap text-base text-slate-800 leading-relaxed">
        {message.content}
      </div>

      {message.recommendations && message.recommendations.length > 0 && (
        <div className="space-y-5 mt-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="text-sm text-slate-600 font-medium">
              本轮推荐 <span className="text-sky-700 font-semibold">{message.recommendations.length}</span> 本书
              {message.totalPrice && (
                <span className="ml-3"> | 本轮总价：<span className="font-semibold text-emerald-700">¥{message.totalPrice.toFixed(2)}</span></span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-500">
                （导出含 <span className="text-sky-700 font-semibold">{stats.totalBooks}</span> 本，总计 <span className="text-emerald-700 font-semibold">¥{stats.totalPrice.toFixed(2)}</span>）
              </div>
              <Button
                theme="primary"
                variant="outline"
                icon={<DownloadIcon />}
                onClick={() => onExport(message)}
                size="medium"
                loading={exporting}
                disabled={exporting}
              >
                导出书单
              </Button>
            </div>
          </div>
          <div className="cnbc-book-grid">
            {message.recommendations.map((book) => (
              <BookCard key={book.book_id} book={book} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

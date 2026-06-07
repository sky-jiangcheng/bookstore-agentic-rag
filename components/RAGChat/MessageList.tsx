import { useEffect, useRef } from 'react';
import { Download, Sparkles, User, Loader2, AlertCircle } from 'lucide-react';
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-8 min-h-0" role="region" aria-live="polite">
        <div className="flex flex-col items-center justify-center py-16 text-center max-w-lg mx-auto animate-fade-in-up">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center mb-6 text-white shadow-xl shadow-blue-500/15 border border-white/10">
            <Sparkles className="w-10 h-10 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-slate-200 mb-3 tracking-tight">智能书库顾问已就绪</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            你可以指定您感兴趣的主题、预算、特定需求等，我将为您调取多路 RAG 向量通道，秒级汇编出专业书单。
          </p>
          <div className="w-full text-left bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-400 space-y-2">
            <div className="font-semibold text-slate-300 mb-1">💡 试着这样追问：</div>
            <div>• “帮我推荐 3 本适合程序员学习的理财书籍”</div>
            <div>• “预算 100 元，推荐关于时间管理的高评分畅销书”</div>
            <div>• “推荐适合 10 岁孩子阅读的科普绘本，排除教材”</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 md:px-4 py-6 space-y-8 min-h-0 pb-44" role="region" aria-live="polite">
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
  const isUser = message.role === 'user';
  const hasRecommendations = !isUser && Boolean(message.recommendations?.length);
  const showContentBubble =
    isUser ||
    !hasRecommendations ||
    message.status === 'streaming' ||
    message.status === 'error';

  return (
    <div className={`flex items-start gap-3 w-full ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
      {/* Assistant Avatar */}
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-650 flex items-center justify-center text-white shadow-md shadow-blue-500/10 border border-white/10">
          <Sparkles className="w-4 h-4" />
        </div>
      )}

      {/* Message Box */}
      <div className={`flex flex-col gap-2.5 max-w-[88%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Role & Status Indicators */}
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span>{isUser ? '您的选书需求' : '系统智能推荐'}</span>
          {!isUser && message.status === 'streaming' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/25">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>智能汇编中</span>
            </span>
          )}
          {!isUser && message.status === 'error' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/25">
              <AlertCircle className="w-3 h-3" />
              <span>发生异常</span>
            </span>
          )}
        </div>

        {/* Content Bubble */}
        {showContentBubble && (
        <div className={`p-4 rounded-2xl text-sm md:text-base leading-relaxed border ${
          isUser
            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 border-blue-500/20 text-white rounded-tr-none shadow-lg shadow-blue-950/20'
            : 'bg-slate-900/35 border-slate-800/80 rounded-tl-none text-slate-100 shadow-lg'
        }`}>
          <div className="whitespace-pre-wrap font-sans">{message.content}</div>
        </div>
        )}

        {/* Recommendations list */}
        {!isUser && message.recommendations && message.recommendations.length > 0 && (
          <div className="w-full mt-1 space-y-3">
            {/* Stats Overview Panel */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 bg-slate-950/45 border border-slate-800/70 rounded-xl">
              <div className="text-xs text-slate-400 font-medium">
                本轮汇编推荐 <span className="text-blue-400 font-bold">{message.recommendations.length}</span> 本
                {message.totalPrice ? (
                  <span> | 本轮总额：<span className="font-bold text-emerald-400">¥{message.totalPrice.toFixed(2)}</span></span>
                ) : null}
              </div>

              <div className="flex items-center gap-2 justify-between md:justify-end">
                <div className="text-[11px] text-slate-500">
                  (累计: <span className="font-semibold text-slate-300">{stats.totalBooks}本</span>, ¥{stats.totalPrice.toFixed(2)})
                </div>
                <button
                  onClick={() => onExport(message)}
                  disabled={exporting}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 hover:text-blue-400 hover:border-blue-500 hover:bg-blue-500/10 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all shadow-md shadow-black/20"
                >
                  {exporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>导出书单</span>
                </button>
              </div>
            </div>

            {/* Book Cards Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {message.recommendations.map((book) => (
                <BookCard key={book.book_id} book={book} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 shadow-md border border-slate-700">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}

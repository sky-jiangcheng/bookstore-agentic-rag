'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Card,
  Button,
  Input,
  Loading,
  Tag,
  Space,
  Row,
  Col,
} from 'tdesign-react';
import {
  BookOpenIcon,
  DownloadIcon,
  SearchIcon,
  ChatIcon,
} from 'tdesign-icons-react';
import { buildFollowUpPrompts, type BookRecommendation, type RequirementSnapshot } from '@/components/rag-chat-utils';

import 'tdesign-react/es/style/index.css';

interface MessageType {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  recommendations?: BookRecommendation[];
  requirement?: RequirementSnapshot;
  totalPrice?: number;
  sessionId?: string;
  status?: 'streaming' | 'done' | 'error';
}

const STARTER_PROMPTS = [
  '推荐人工智能入门书籍',
  '给高中生推荐历史阅读书籍',
  '预算200元，推荐适合运营学习的书籍',
  '推荐适合书店陈列的畅销科普书籍',
];

function generateBooklistName(userInput: string, requirement?: RequirementSnapshot): string {
  const cleanInput = userInput.trim().replace(/[^\w\u4e00-\u9fa5\s]/g, '').replace(/_+/g, '').replace(/\s+/g, '_').slice(0, 20);
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  if (!requirement || !requirement.categories || requirement.categories.length === 0) {
    return cleanInput ? `${cleanInput}_${timestamp}` : `书单_${timestamp}`;
  }

  const primaryCategory = requirement.categories[0].replace(/_+/g, '');
  const targetCount = requirement.constraints?.target_count;

  let name: string;
  if (targetCount) {
    name = `${primaryCategory}_${targetCount}本`;
  } else {
    name = primaryCategory || cleanInput || '书单';
  }

  return `${name}_${timestamp}`;
}

function getPhaseText(phase: string) {
  const phaseMap: Record<string, string> = {
    requirement_analysis: '正在分析你的需求',
    retrieval: '正在从书库里筛选候选书',
    generation: '正在生成推荐单和推荐理由',
    evaluation: '正在复核推荐质量',
  };
  return phaseMap[phase] || '正在处理中';
}

function BookCard({ book }: { book: BookRecommendation }) {
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

export function RAGChat() {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastUserQuery, setLastUserQuery] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const getAggregatedStats = useCallback(() => {
    const seenBookIds = new Set<number | string>();
    let totalBooks = 0;
    let totalPrice = 0;

    messages.forEach(msg => {
      if (msg.role === 'assistant' && msg.recommendations) {
        msg.recommendations.forEach(book => {
          if (book.book_id && !seenBookIds.has(book.book_id)) {
            seenBookIds.add(book.book_id);
            totalBooks++;
            if (book.price) {
              totalPrice += Number(book.price);
            }
          }
        });
      }
    });

    return { totalBooks, totalPrice };
  }, [messages]);

  useEffect(() => {
    const storedSessionId = localStorage.getItem('rag-session-id');
    if (storedSessionId) {
      setSessionId(storedSessionId);
    }
  }, []);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, currentPhase, isLoading]);

  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant'),
    [messages]
  );

  const followUpPrompts = useMemo(
    () => buildFollowUpPrompts(lastUserQuery, lastAssistantMessage),
    [lastAssistantMessage, lastUserQuery]
  );

  const upsertAssistantMessage = (
    assistantMessageId: string,
    updater: (current?: MessageType) => MessageType
  ) => {
    setMessages((prev) => {
      const existingIndex = prev.findIndex((message) => message.id === assistantMessageId);
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = updater(existingIndex !== -1 ? updated[existingIndex] : undefined);
        return updated;
      }
      return [...prev, updater(undefined)];
    });
  };

  const handleExportExcel = useCallback(async (currentMessage: MessageType) => {
    const seenBookIds = new Set<number | string>();
    const allBooks: Array<{
      book_id?: number;
      title: string;
      author?: string | null;
      publisher?: string | null;
      category?: string | null;
      price?: number | null;
      stock?: number | null;
      score?: number | null;
      source?: string;
      remark?: string | null;
    }> = [];

    messages.forEach(msg => {
      if (msg.role === 'assistant' && msg.recommendations && msg.recommendations.length > 0) {
        msg.recommendations.forEach(book => {
          const bookId = book.book_id;
          if (bookId && !seenBookIds.has(bookId)) {
            seenBookIds.add(bookId);
            allBooks.push({
              book_id: typeof bookId === 'number' ? bookId : undefined,
              title: book.title,
              author: book.author || null,
              publisher: book.publisher || null,
              category: book.category || null,
              price: book.price || null,
              stock: book.stock || null,
              score: book.match_score !== undefined ? Math.round(book.match_score * 100) : null,
              source: book.source || '智能推荐',
              remark: book.explanation || book.remark || null,
            });
          }
        });
      }
    });

    if (allBooks.length === 0) return;

    const totalPrice = allBooks.reduce((sum, b) => sum + (b.price || 0), 0);
    const booklistName = generateBooklistName(currentMessage.content, currentMessage.requirement);
    const body = {
      booklist_name: booklistName,
      books: allBooks,
      budget: currentMessage.requirement?.constraints.budget ?? null,
      total_price: totalPrice,
    };

    try {
      const res = await fetch('/api/v1/book-list/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename\*=UTF-8''(.+)/);
      const filename = match ? decodeURIComponent(match[1]) : '书单.xlsx';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, []);

  const submitQuery = async (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const userMessage: MessageType = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      status: 'done',
    };

    const assistantMessageId = crypto.randomUUID();

    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '我先帮你梳理需求，然后开始检索书库。',
        status: 'streaming',
      },
    ]);
    setLastUserQuery(trimmed);
    setInput('');
    setIsLoading(true);
    setCurrentPhase('requirement_analysis');

    try {
      const response = await fetch('/api/rag/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: trimmed,
          sessionId: sessionId || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        const recommendations = data.recommendation?.books?.map((book: BookRecommendation) => ({
          title: book.title,
          author: book.author,
          price: Number(book.price),
          explanation: book.explanation,
          book_id: book.book_id,
          publisher: book.publisher,
          category: book.category,
          stock: book.stock,
          match_score: book.match_score,
          source: book.source,
        })) ?? [];

        if (data.sessionId && data.sessionId !== sessionId) {
          setSessionId(data.sessionId);
          localStorage.setItem('rag-session-id', data.sessionId);
        }

        upsertAssistantMessage(assistantMessageId, () => ({
          id: assistantMessageId,
          role: 'assistant',
          content: data.summary || (recommendations.length > 0 ? '推荐已生成。' : '这次没找到合适的推荐结果。'),
          recommendations,
          requirement: data.requirement
            ? {
                categories: Array.isArray(data.requirement.categories) ? data.requirement.categories : [],
                keywords: Array.isArray(data.requirement.keywords) ? data.requirement.keywords : [],
                constraints: {
                  budget: typeof data.requirement.constraints?.budget === 'number'
                    ? data.requirement.constraints.budget
                    : undefined,
                  target_count: typeof data.requirement.constraints?.target_count === 'number'
                    ? data.requirement.constraints.target_count
                    : undefined,
                  exclude_keywords: Array.isArray(data.requirement.constraints?.exclude_keywords)
                    ? data.requirement.constraints.exclude_keywords
                    : undefined,
                },
              }
            : undefined,
          totalPrice: typeof data.recommendation?.total_price === 'number'
            ? data.recommendation.total_price
            : undefined,
          sessionId: data.sessionId || sessionId || undefined,
          status: data.success ? 'done' : 'error',
        }));

        setIsLoading(false);
        setCurrentPhase(null);
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'message';
      let sawTerminalEvent = false;

      if (!reader) {
        throw new Error('无法读取服务响应');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
            continue;
          }

          if (!line.startsWith('data:')) {
            continue;
          }

          const dataStr = line.slice(5).trim();
          if (!dataStr || dataStr === '[DONE]') {
            continue;
          }

          try {
            const data = JSON.parse(dataStr);

            if (currentEvent === 'progress') {
              if (data.phase) {
                setCurrentPhase(data.phase);
              }

              upsertAssistantMessage(assistantMessageId, (current) => ({
                id: assistantMessageId,
                role: 'assistant',
                content: data.content || current?.content || '正在处理你的请求...',
                recommendations: current?.recommendations,
                requirement: current?.requirement,
                totalPrice: current?.totalPrice,
                sessionId: current?.sessionId,
                status: 'streaming',
              }));
            }

            if (currentEvent === 'complete') {
              sawTerminalEvent = true;
              const recommendations = data.recommendation?.books?.map((book: BookRecommendation) => ({
                title: book.title,
                author: book.author,
                price: Number(book.price),
                explanation: book.explanation,
                book_id: book.book_id,
              })) ?? [];

              if (data.sessionId && data.sessionId !== sessionId) {
                setSessionId(data.sessionId);
                localStorage.setItem('rag-session-id', data.sessionId);
              }

              upsertAssistantMessage(assistantMessageId, () => ({
                id: assistantMessageId,
                role: 'assistant',
                content: data.summary || (recommendations.length > 0 ? '推荐已生成。' : '这次没找到合适的推荐结果。'),
                recommendations,
                requirement: data.requirement
                  ? {
                      categories: Array.isArray(data.requirement.categories) ? data.requirement.categories : [],
                      keywords: Array.isArray(data.requirement.keywords) ? data.requirement.keywords : [],
                      constraints: {
                        budget: typeof data.requirement.constraints?.budget === 'number'
                          ? data.requirement.constraints.budget
                          : undefined,
                        target_count: typeof data.requirement.constraints?.target_count === 'number'
                          ? data.requirement.constraints.target_count
                          : undefined,
                        exclude_keywords: Array.isArray(data.requirement.constraints?.exclude_keywords)
                          ? data.requirement.constraints.exclude_keywords
                          : undefined,
                      },
                    }
                  : undefined,
                totalPrice: typeof data.recommendation?.total_price === 'number'
                  ? data.recommendation.total_price
                  : undefined,
                sessionId: data.sessionId || sessionId || undefined,
                status: 'done',
              }));

              setIsLoading(false);
              setCurrentPhase(null);
            }

            if (currentEvent === 'error') {
              sawTerminalEvent = true;
              upsertAssistantMessage(assistantMessageId, () => ({
                id: assistantMessageId,
                role: 'assistant',
                content: data.error || '抱歉，处理你的请求时出错了。你可以换个说法再试一次。',
                status: 'error',
              }));

              setIsLoading(false);
              setCurrentPhase(null);
            }
          } catch (parseError) {
            console.error('Failed to parse SSE data:', parseError);
          }
        }

        if (!sawTerminalEvent) {
          throw new Error('服务响应被意外中断，请稍后重试');
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setIsLoading(false);
      setCurrentPhase(null);

      upsertAssistantMessage(assistantMessageId, () => ({
        id: assistantMessageId,
        role: 'assistant',
        content: '抱歉，处理你的请求时出错了。你可以稍后重试，或者换个更具体的需求。',
        status: 'error',
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitQuery(input);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="cnbc-header-line w-full" />

      <div className="max-w-[1280px] mx-auto py-8 px-6 pb-36">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-sky-700 font-semibold mb-3">
            <BookOpenIcon />
            <span>INTELLIGENT RECOMMENDATIONS</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">智能图书推荐系统</h1>
          <p className="text-slate-600 max-w-3xl text-lg leading-relaxed">
            直接输入你的选书要求，我会给出推荐书单、推荐理由，以及下一步可以继续追问的方向。
          </p>
        </div>

        <div className="cnbc-card p-6 mb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">热门推荐词</h2>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {isLoading ? (
                <>
                  <Loading size="small" />
                  <span>{currentPhase ? getPhaseText(currentPhase) : '处理中'}</span>
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
                onClick={() => setInput(prompt)}
                className="cnbc-starter-btn"
              >
                {prompt}
              </Button>
            ))}
          </div>
        </div>

        <Row gutter={[24, 24]}>
          <Col xs={24} lg={17}>
            <Card className="cnbc-card">
              <div ref={scrollAreaRef} className="overflow-y-auto px-4 py-6" style={{ maxHeight: '68vh' }}>
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-24 h-24 rounded-full bg-sky-50 flex items-center justify-center mb-6 text-5xl">
                      📚
                    </div>
                    <h2 className="text-2xl font-semibold text-slate-900 mb-4">把需求说具体一点，结果会更好</h2>
                    <p className="text-slate-600 max-w-xl leading-relaxed">
                      例如告诉我目标读者、主题方向、预算、希望推荐几本，或者直接说"排除教材""适合陈列销售"等要求。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-10">
                    {messages.map((message) => (
                      <div key={message.id} className="space-y-6">
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
                                  （导出含 <span className="text-sky-700 font-semibold">{getAggregatedStats().totalBooks}</span> 本，总计 <span className="text-emerald-700 font-semibold">¥{getAggregatedStats().totalPrice.toFixed(2)}</span>）
                                </div>
                                <Button
                                  theme="primary"
                                  variant="outline"
                                  icon={<DownloadIcon />}
                                  onClick={() => handleExportExcel(message)}
                                  size="medium"
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
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </Col>

          <Col xs={24} lg={7}>
            <Card className="cnbc-card">
              <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100">
                <ChatIcon className="text-sky-600" />
                <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">继续探索</h3>
              </div>
              {followUpPrompts.length > 0 ? (
                <Space direction="vertical" className="w-full">
                  {followUpPrompts.map((prompt, index) => (
                    <Button
                      key={index}
                      variant="text"
                      block
                      onClick={() => submitQuery(prompt)}
                      style={{ textAlign: 'left', color: '#0070d2', padding: '10px 8px' }}
                    >
                      {prompt}
                    </Button>
                  ))}
                </Space>
              ) : (
                <p className="text-sm text-slate-500 leading-relaxed">开始对话后，这里会出现推荐问题，帮助你继续探索更多书籍选择。</p>
              )}
            </Card>
          </Col>
        </Row>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent pt-10 pb-6 px-6">
        <div className="max-w-[1280px] mx-auto">
          <div className="cnbc-input-container p-2">
            <form onSubmit={handleSubmit} className="flex gap-3">
              <Input
                value={input}
                onChange={(value) => setInput(String(value))}
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
                disabled={!input.trim() || isLoading}
                icon={<SearchIcon />}
              >
                搜索推荐
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

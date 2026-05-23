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
    <Card
      className="tdesign-book-card"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <div className="flex flex-col gap-3 p-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-white line-clamp-2">{book.title}</h3>
            <p className="text-sm text-gray-400 mt-1">{book.author}</p>
          </div>
          <Tag theme="success" variant="light">
            ¥{Number(book.price).toFixed(2)}
          </Tag>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed">{book.explanation}</p>
        {book.publisher && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
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

  const handleExportExcel = useCallback(async (message: MessageType) => {
    if (!message.recommendations || message.recommendations.length === 0) return;

    const books = message.recommendations.map((b) => ({
      book_id: typeof b.book_id === 'number' ? b.book_id : undefined,
      title: b.title,
      author: b.author || null,
      publisher: b.publisher || null,
      category: b.category || null,
      price: b.price || null,
      stock: b.stock || null,
      score: b.match_score !== undefined ? Math.round(b.match_score * 100) : null,
      source: b.source || '智能推荐',
      remark: b.explanation || b.remark || null,
    }));

    const booklistName = generateBooklistName(message.content, message.requirement);
    const body = {
      booklist_name: booklistName,
      books,
      budget: message.requirement?.constraints.budget ?? null,
      total_price: message.totalPrice ?? null,
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
    <div className="tdesign-dark-theme min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-[1200px] mx-auto py-6 px-4 pb-32">
        <Card className="mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-sky-400 mb-2">
                <BookOpenIcon />
                <span>Bookstore Agentic RAG</span>
              </div>
              <h1 className="text-2xl font-bold text-white">智能图书推荐系统</h1>
              <p className="text-sm text-gray-400 mt-2 max-w-xl">
                直接输入你的选书要求，我会给出推荐书单、推荐理由，以及下一步可以继续追问的方向。
              </p>
            </div>

            <Card
              className="min-w-[260px]"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="text-xs text-gray-400 mb-2">当前状态</div>
              <div className="flex items-center gap-2">
                {isLoading ? (
                  <Loading size="small" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                )}
                <span className="text-sm text-gray-200">
                  {isLoading && currentPhase ? getPhaseText(currentPhase) : '可以开始提需求了'}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-3">
                会话 ID：{sessionId ? sessionId.slice(0, 16) : '未创建'}
              </div>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                variant="outline"
                theme="default"
                size="medium"
                onClick={() => setInput(prompt)}
                style={{ border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)' }}
              >
                {prompt}
              </Button>
            ))}
          </div>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={18}>
            <Card
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div ref={scrollAreaRef} className="overflow-y-auto px-2 py-2" style={{ maxHeight: '65vh' }}>
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-20 h-20 rounded-full bg-sky-500/10 flex items-center justify-center mb-5 text-4xl">
                      📚
                    </div>
                    <h2 className="text-xl font-semibold text-white mb-3">把需求说具体一点，结果会更好</h2>
                    <p className="text-sm text-gray-400 max-w-lg">
                      例如告诉我目标读者、主题方向、预算、希望推荐几本，或者直接说"排除教材""适合陈列销售"等要求。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {messages.map((message) => (
                      <div key={message.id} className="space-y-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Tag variant="outline" theme={message.role === 'assistant' ? 'primary' : 'warning'}>
                            {message.role === 'assistant' ? '系统回复' : '你的需求'}
                          </Tag>
                          {message.status === 'streaming' && (
                            <Tag variant="outline" theme="success">
                              <Loading size="small" /> 处理中
                            </Tag>
                          )}
                          {message.status === 'error' && (
                            <Tag theme="danger">需要重试</Tag>
                          )}
                        </div>

                        <div className="whitespace-pre-wrap text-sm text-gray-200 leading-relaxed">
                          {message.content}
                        </div>

                        {message.recommendations && message.recommendations.length > 0 && (
                          <div className="space-y-4 mt-4">
                            <div className="flex items-center justify-between">
                              <div className="text-sm text-gray-400">
                                共推荐 {message.recommendations.length} 本书
                                {message.totalPrice && (
                                  <span className="ml-2"> | 总价：¥{message.totalPrice.toFixed(2)}</span>
                                )}
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
                            <div className="tdesign-book-grid">
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

          <Col xs={24} lg={6}>
            <Card
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="text-sm font-medium text-gray-300 mb-4">继续探索</div>
              {followUpPrompts.length > 0 ? (
                <Space direction="vertical" className="w-full">
                  {followUpPrompts.map((prompt, index) => (
                    <Button
                      key={index}
                      variant="text"
                      block
                      onClick={() => submitQuery(prompt)}
                      style={{ textAlign: 'left', color: '#7dd3fc' }}
                    >
                      <ChatIcon className="mr-2" />
                      {prompt}
                    </Button>
                  ))}
                </Space>
              ) : (
                <p className="text-sm text-gray-500">开始对话后，这里会出现推荐问题</p>
              )}
            </Card>
          </Col>
        </Row>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent pt-8 pb-4 px-4">
        <div className="max-w-[1200px] mx-auto">
          <Card
            style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <form onSubmit={handleSubmit} className="flex gap-3 p-2">
              <Input
                value={input}
                onChange={(value) => setInput(String(value))}
                placeholder="输入你的选书要求..."
                size="large"
                className="flex-1"
                disabled={isLoading}
                style={{ background: 'rgba(255,255,255,0.05)' }}
              />
              <Button
                type="submit"
                theme="primary"
                size="large"
                loading={isLoading}
                disabled={!input.trim() || isLoading}
                icon={<SearchIcon />}
              >
                搜索
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

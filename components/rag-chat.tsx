'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Conversation, ConversationContent } from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FeedbackButtons } from '@/components/ui/feedback-buttons';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { buildFollowUpPrompts, type BookRecommendation, type RequirementSnapshot } from '@/components/rag-chat-utils';

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
  '推荐一些人工智能入门书',
  '给高中生推荐历史阅读书单',
  '预算 200 元，推荐 5 本适合运营学习的书',
  '推荐几本适合书店陈列的畅销科普书',
];

function getPhaseText(phase: string) {
  switch (phase) {
    case 'requirement_analysis':
      return '正在分析你的需求';
    case 'retrieval':
      return '正在从书库里筛选候选书';
    case 'generation':
      return '正在生成推荐单和推荐理由';
    case 'evaluation':
      return '正在复核推荐质量';
    default:
      return '正在处理中';
  }
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
        updated[existingIndex] = updater(updated[existingIndex]);
        return updated;
      }

      return [...prev, updater(undefined)];
    });
  };

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_30%),linear-gradient(180deg,_#050816,_#0b1220_35%,_#111827)] text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-sky-300/80">Bookstore Agentic RAG</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">智能图书推荐系统</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                直接输入你的选书要求，我会给出推荐书单、推荐理由，以及下一步可以继续追问的方向。
              </p>
            </div>

            <Card className="min-w-[240px] border-white/10 bg-slate-950/40 p-4 text-slate-100">
              <div className="text-xs text-slate-400">当前状态</div>
              <div className="mt-2 flex items-center gap-2">
                {isLoading ? <Spinner className="h-4 w-4 animate-spin" /> : <div className="h-2 w-2 rounded-full bg-emerald-400" />}
                <span className="text-sm">{isLoading && currentPhase ? getPhaseText(currentPhase) : '可以开始提需求了'}</span>
              </div>
              <div className="mt-3 text-xs text-slate-400">
                会话 ID：{sessionId ? sessionId.slice(0, 16) : '未创建'}
              </div>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setInput(prompt)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-sky-400/60 hover:bg-sky-400/10"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="flex min-h-[70vh] flex-col overflow-hidden border-white/10 bg-slate-950/45 backdrop-blur">
            <ScrollArea ref={scrollAreaRef} className="flex-1 px-4 py-5 sm:px-6">
              {messages.length === 0 ? (
                <div className="flex h-full min-h-[50vh] flex-col items-center justify-center text-center">
                  <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-sky-400/15 text-4xl shadow-lg shadow-sky-900/20">
                    📚
                  </div>
                  <h2 className="text-xl font-semibold">把需求说具体一点，结果会更好</h2>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">
                    例如告诉我目标读者、主题方向、预算、希望推荐几本，或者直接说“排除教材”“适合陈列销售”等要求。
                  </p>
                </div>
              ) : (
                <Conversation>
                  <ConversationContent className="space-y-5">
                    {messages.map((message, index) => {
                      const previousUserMessage = [...messages.slice(0, index)].reverse().find((item) => item.role === 'user');

                      return (
                        <Message key={message.id} from={message.role}>
                          <MessageContent>
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <Badge variant={message.role === 'assistant' ? 'secondary' : 'outline'} className="border-white/10 bg-white/5 text-slate-200">
                                  {message.role === 'assistant' ? '系统回复' : '你的需求'}
                                </Badge>
                                {message.status === 'streaming' ? (
                                  <Badge variant="outline" className="border-sky-400/40 bg-sky-400/10 text-sky-200">
                                    处理中
                                  </Badge>
                                ) : null}
                                {message.status === 'error' ? (
                                  <Badge variant="destructive">需要重试</Badge>
                                ) : null}
                              </div>

                              <MessageResponse className="whitespace-pre-wrap text-sm leading-7 text-slate-100">
                                {message.content}
                              </MessageResponse>

                              {message.recommendations && message.recommendations.length > 0 ? (
                                <div className="grid gap-4 md:grid-cols-2">
                                  {message.recommendations.map((book) => (
                                    <Card key={book.book_id} className="border-white/10 bg-white/5 p-4 shadow-lg shadow-black/10">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                          <h3 className="line-clamp-2 text-base font-semibold text-white">{book.title}</h3>
                                          <p className="mt-1 text-sm text-slate-400">{book.author}</p>
                                        </div>
                                        <Badge className="bg-emerald-500/15 text-emerald-200">¥{book.price.toFixed(2)}</Badge>
                                      </div>
                                      <p className="mt-3 text-sm leading-6 text-slate-300">{book.explanation}</p>
                                      {book.book_id && message.sessionId ? (
                                        <div className="mt-4 border-t border-white/10 pt-3">
                                          <FeedbackButtons
                                            bookId={String(book.book_id)}
                                            sessionId={message.sessionId}
                                            query={previousUserMessage?.content || ''}
                                            className="text-xs"
                                          />
                                        </div>
                                      ) : null}
                                    </Card>
                                  ))}
                                </div>
                              ) : null}

                              {message.role === 'assistant' && message.status === 'done' && (!message.recommendations || message.recommendations.length === 0) ? (
                                <Card className="border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-50">
                                  这轮没命中可用书目。建议直接补“主题词 + 人群 + 数量 + 预算 + 排除项”，例如：给高中生推荐 5 本历史书，预算 150 元，排除教材教辅。
                                </Card>
                              ) : null}
                            </div>
                          </MessageContent>
                        </Message>
                      );
                    })}
                  </ConversationContent>
                </Conversation>
              )}
            </ScrollArea>

            <div className="border-t border-white/10 bg-slate-950/80 p-4 backdrop-blur sm:p-5">
              {isLoading && currentPhase ? (
                <div className="mb-3 flex items-center gap-3 rounded-2xl border border-sky-400/15 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
                  <Spinner className="h-4 w-4 animate-spin" />
                  <span>{getPhaseText(currentPhase)}</span>
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
                <Input
                  type="text"
                  placeholder="例如：推荐 6 本适合门店陈列的人工智能入门书，排除教材，预算 300 元"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoading}
                  className="h-12 flex-1 border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                />
                <Button type="submit" disabled={isLoading || !input.trim()} className="h-12 min-w-[112px] bg-sky-500 text-white hover:bg-sky-400">
                  {isLoading ? <Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                  发送
                </Button>
              </form>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="border-white/10 bg-white/5 p-5 text-slate-100 backdrop-blur">
              <div className="text-sm font-semibold">下一步可以怎么问</div>
              <div className="mt-4 space-y-2">
                {followUpPrompts.length > 0 ? (
                  followUpPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-sky-400/50 hover:bg-sky-400/10"
                    >
                      {prompt}
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">先发起一条推荐请求，我会根据结果给你下一轮追问建议。</p>
                )}
              </div>
            </Card>

            <Card className="border-white/10 bg-white/5 p-5 text-sm text-slate-300 backdrop-blur">
              <div className="font-semibold text-slate-100">怎么拿到更好的结果</div>
              <ul className="mt-3 space-y-2 leading-6">
                <li>说清楚目标人群，比如“给初中生”“给门店大众读者”。</li>
                <li>尽量带上预算、数量和排除项，比如“排除教材”。</li>
                <li>如果结果不准，继续追问“更偏入门”“更偏销售”“控制总价”。</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

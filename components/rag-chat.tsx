'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, Row, Col } from 'tdesign-react';
import type { MessageType } from '@/components/rag-chat-utils';
import { RAGChatHeader } from '@/components/RAGChat/RAGChatHeader';
import { StarterPrompts } from '@/components/RAGChat/StarterPrompts';
import { MessageList } from '@/components/RAGChat/MessageList';
import { FollowUpSidebar } from '@/components/RAGChat/FollowUpSidebar';
import { ChatInput } from '@/components/RAGChat/ChatInput';
import { Toast } from '@/components/RAGChat/Toast';

import 'tdesign-react/es/style/index.css';

function generateBooklistName(userInput: string, requirement?: { categories?: string[]; constraints?: { target_count?: number } }): string {
  const cleanInput = userInput.trim().replace(/[^\w\u4e00-\u9fa5\s]/g, '').replace(/_+/g, '').replace(/\s+/g, '_').slice(0, 20);
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  if (!requirement || !requirement.categories || requirement.categories.length === 0) {
    return cleanInput ? `${cleanInput}_${timestamp}` : `书单_${timestamp}`;
  }

  const primaryCategory = requirement.categories[0].replace(/_+/g, '');
  const targetCount = requirement.constraints?.target_count;
  const name = targetCount ? `${primaryCategory}_${targetCount}本` : (primaryCategory || cleanInput || '书单');
  return `${name}_${timestamp}`;
}

export function RAGChat() {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastUserQuery, setLastUserQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const storedSessionId = localStorage.getItem('rag-session-id');
    if (storedSessionId) {
      setSessionId(storedSessionId);
    }
  }, []);

  const lastAssistantMessage = (() => {
    const reversed = [...messages].reverse();
    return reversed.find((message) => message.role === 'assistant');
  })();

  const upsertAssistantMessage = useCallback(
    (assistantMessageId: string, updater: (current?: MessageType) => MessageType) => {
      setMessages((prev) => {
        const existingIndex = prev.findIndex((message) => message.id === assistantMessageId);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = updater(updated[existingIndex]);
          return updated;
        }
        return [...prev, updater(undefined)];
      });
    },
    []
  );

  const handleExportExcel = useCallback(async (currentMessage: MessageType) => {
    if (exporting) return;
    setExporting(true);

    try {
      const seenBookIds = new Set<string>();
      const allBooks: Array<{
        book_id?: number; title: string; author?: string | null; publisher?: string | null;
        category?: string | null; price?: number | null; stock?: number | null;
        score?: number | null; source?: string; remark?: string | null;
      }> = [];

      messages.forEach(msg => {
        if (msg.role === 'assistant' && msg.recommendations) {
          msg.recommendations.forEach(book => {
            const bookId = String(book.book_id);
            if (bookId && !seenBookIds.has(bookId)) {
              seenBookIds.add(bookId);
              const numericBookId = Number(bookId);
              allBooks.push({
                book_id: Number.isSafeInteger(numericBookId) ? numericBookId : undefined,
                title: book.title?.trim() || '未知书名',
                author: book.author || null,
                publisher: book.publisher || null,
                category: book.category || null,
                price: typeof book.price === 'number' ? book.price : null,
                stock: typeof book.stock === 'number' ? book.stock : null,
                score: typeof book.match_score === 'number' ? Math.round(book.match_score * 100) : null,
                source: book.source || '智能推荐',
                remark: book.explanation || book.remark || null,
              });
            }
          });
        }
      });

      if (allBooks.length === 0) {
        setToastMessage('没有可导出的书籍');
        setTimeout(() => setToastMessage(null), 4000);
        return;
      }

      const totalPrice = allBooks.reduce((sum, b) => sum + (b.price || 0), 0);
      const booklistName = generateBooklistName(currentMessage.content, currentMessage.requirement);

      const res = await fetch('/api/v1/book-list/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booklist_name: booklistName,
          books: allBooks,
          budget: currentMessage.requirement?.constraints?.budget ?? null,
          total_price: totalPrice,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `导出失败：HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename\*=UTF-8''(.+)/);
      const filename = match ? decodeURIComponent(match[1]) : '书单.xlsx';

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '导出失败，请重试';
      setToastMessage(errorMessage);
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setExporting(false);
    }
  }, [messages, exporting]);

  const submitQuery = useCallback(async (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed || isLoading) return;

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
      { id: assistantMessageId, role: 'assistant', content: '我先帮你梳理需求，然后开始检索书库。', status: 'streaming' },
    ]);
    setLastUserQuery(trimmed);
    setInput('');
    setIsLoading(true);
    setCurrentPhase('requirement_analysis');

    try {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await fetch('/api/rag/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed, sessionId: sessionId || undefined }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        const rawBooks = data.recommendation?.books || [];
        const maxScore = rawBooks.reduce((max: number, b: any) => {
          const score = typeof b.relevance_score === 'number' ? b.relevance_score : 0;
          return score > max ? score : max;
        }, 0);
        const recommendations = rawBooks.map((book: Record<string, unknown>) => {
          let matchScore = typeof book.match_score === 'number' ? book.match_score : undefined;
          if (matchScore === undefined && typeof book.relevance_score === 'number') {
            matchScore = maxScore > 0 ? (book.relevance_score / maxScore) : 0.9;
          }
          return {
            title: book.title, author: book.author, price: Number(book.price),
            explanation: book.explanation, book_id: String(book.book_id ?? ''),
            publisher: book.publisher, category: book.category, stock: book.stock,
            match_score: matchScore, source: book.source,
          };
        });

        if (data.sessionId && data.sessionId !== sessionId) {
          setSessionId(data.sessionId);
          localStorage.setItem('rag-session-id', data.sessionId);
        }

        upsertAssistantMessage(assistantMessageId, () => ({
          id: assistantMessageId, role: 'assistant',
          content: data.summary || (recommendations.length > 0 ? '推荐已生成。' : '这次没找到合适的推荐结果。'),
          recommendations,
          requirement: data.requirement ? {
            categories: Array.isArray(data.requirement.categories) ? data.requirement.categories : [],
            keywords: Array.isArray(data.requirement.keywords) ? data.requirement.keywords : [],
            constraints: {
              budget: typeof data.requirement.constraints?.budget === 'number' ? data.requirement.constraints.budget : undefined,
              target_count: typeof data.requirement.constraints?.target_count === 'number' ? data.requirement.constraints.target_count : undefined,
              exclude_keywords: Array.isArray(data.requirement.constraints?.exclude_keywords) ? data.requirement.constraints.exclude_keywords : undefined,
            },
          } : undefined,
          totalPrice: typeof data.recommendation?.total_price === 'number' ? data.recommendation.total_price : undefined,
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

      if (!reader) throw new Error('无法读取服务响应');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) { currentEvent = line.slice(6).trim(); continue; }
          if (!line.startsWith('data:')) continue;

          const dataStr = line.slice(5).trim();
          if (!dataStr || dataStr === '[DONE]') continue;

          try {
            const data = JSON.parse(dataStr);

            if (currentEvent === 'progress') {
              if (data.phase) setCurrentPhase(data.phase);
              upsertAssistantMessage(assistantMessageId, (current) => ({
                id: assistantMessageId, role: 'assistant',
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
              const rawBooks = data.recommendation?.books || [];
              const maxScore = rawBooks.reduce((max: number, b: any) => {
                const score = typeof b.relevance_score === 'number' ? b.relevance_score : 0;
                return score > max ? score : max;
              }, 0);
              const recommendations = rawBooks.map((book: Record<string, unknown>) => {
                let matchScore = typeof book.match_score === 'number' ? book.match_score : undefined;
                if (matchScore === undefined && typeof book.relevance_score === 'number') {
                  matchScore = maxScore > 0 ? (book.relevance_score / maxScore) : 0.9;
                }
                return {
                  title: book.title, author: book.author, price: typeof book.price === 'number' ? book.price : Number(book.price) || 0,
                  explanation: book.explanation, book_id: String(book.book_id ?? ''),
                  publisher: book.publisher, category: book.category, stock: book.stock,
                  match_score: matchScore, source: book.source,
                };
              });

              if (data.sessionId && data.sessionId !== sessionId) {
                setSessionId(data.sessionId);
                localStorage.setItem('rag-session-id', data.sessionId);
              }

              upsertAssistantMessage(assistantMessageId, () => ({
                id: assistantMessageId, role: 'assistant',
                content: data.summary || (recommendations.length > 0 ? '推荐已生成。' : '这次没找到合适的推荐结果。'),
                recommendations,
                requirement: data.requirement ? {
                  categories: Array.isArray(data.requirement.categories) ? data.requirement.categories : [],
                  keywords: Array.isArray(data.requirement.keywords) ? data.requirement.keywords : [],
                  constraints: {
                    budget: typeof data.requirement.constraints?.budget === 'number' ? data.requirement.constraints.budget : undefined,
                    target_count: typeof data.requirement.constraints?.target_count === 'number' ? data.requirement.constraints.target_count : undefined,
                    exclude_keywords: Array.isArray(data.requirement.constraints?.exclude_keywords) ? data.requirement.constraints.exclude_keywords : undefined,
                  },
                } : undefined,
                totalPrice: typeof data.recommendation?.total_price === 'number' ? data.recommendation.total_price : undefined,
                sessionId: data.sessionId || sessionId || undefined,
                status: 'done',
              }));

              setIsLoading(false);
              setCurrentPhase(null);
            }

            if (currentEvent === 'error') {
              sawTerminalEvent = true;
              upsertAssistantMessage(assistantMessageId, () => ({
                id: assistantMessageId, role: 'assistant',
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
      }

      if (!sawTerminalEvent) {
        throw new Error('服务响应被意外中断，请稍后重试');
      }
    } catch (error) {
      console.error('Error:', error);
      setIsLoading(false);
      setCurrentPhase(null);
      upsertAssistantMessage(assistantMessageId, () => ({
        id: assistantMessageId, role: 'assistant',
        content: '抱歉，处理你的请求时出错了。你可以稍后重试，或者换个更具体的需求。',
        status: 'error',
      }));
    }
  }, [isLoading, sessionId, upsertAssistantMessage]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    submitQuery(input);
  }, [input, submitQuery]);

  const handleStarterSelect = useCallback((prompt: string) => {
    setInput(prompt);
    setTimeout(() => submitQuery(prompt), 0);
  }, [submitQuery]);

  const handleFollowUp = useCallback((query: string) => {
    submitQuery(query);
  }, [submitQuery]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="cnbc-header-line w-full" />

      <div className="max-w-[1280px] mx-auto py-8 px-6 pb-36">
        <RAGChatHeader />

        <StarterPrompts
          isLoading={isLoading}
          currentPhase={currentPhase}
          onSelect={handleStarterSelect}
        />

        <Row gutter={[24, 24]}>
          <Col xs={24} lg={17}>
            <Card className="cnbc-card">
              <MessageList
                messages={messages}
                exporting={exporting}
                onExport={handleExportExcel}
              />
            </Card>
          </Col>

          <Col xs={24} lg={7}>
            <FollowUpSidebar
              lastUserQuery={lastUserQuery}
              lastAssistantMessage={lastAssistantMessage}
              onSubmit={handleFollowUp}
            />
          </Col>
        </Row>
      </div>

      <ChatInput
        value={input}
        onChange={(value) => setInput(value)}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />

      <Toast message={toastMessage} />
    </div>
  );
}

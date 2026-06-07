'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { MessageType } from '@/components/rag-chat-utils';
import { RAGChatHeader } from '@/components/RAGChat/RAGChatHeader';
import { StarterPrompts } from '@/components/RAGChat/StarterPrompts';
import { MessageList } from '@/components/RAGChat/MessageList';
import { ChatInput } from '@/components/RAGChat/ChatInput';
import { Toast } from '@/components/RAGChat/Toast';
import { TuningPanel } from '@/components/RAGChat/TuningPanel';
import { buildFollowUpPrompts, recoverInterruptedMessages } from '@/components/rag-chat-utils';
import {
  buildPseudoSql,
  findExactTemplate,
  normalizeRequirementText,
  type RequirementTemplate,
} from '@/components/query-preparation';
import type { RequirementAnalysis } from '@/lib/types/rag';
import { Sparkles, Menu, Plus, MessageSquare, Trash2, X, Sliders, Bookmark, FileSearch } from 'lucide-react';

import 'tdesign-react/es/style/index.css';

const CHAT_REQUEST_TIMEOUT_MS = 30_000;

interface SessionItem {
  id: string;
  title: string;
  messages: MessageType[];
  lastSql?: string;
  targetCount: number;
  categoryWeight: number;
  keywordWeight: number;
  selectedExclusions: string[];
  selectedKeywords?: string[];
}

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
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [, setCurrentPhase] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastUserQuery, setLastUserQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Custom Tuning parameters:
  const [targetCount, setTargetCount] = useState(15);
  const [categoryWeight, setCategoryWeight] = useState(1.2);
  const [keywordWeight, setKeywordWeight] = useState(0.6);
  const [, setDbExclusions] = useState<string[]>([]);
  const [selectedExclusions, setSelectedExclusions] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [lastSql, setLastSql] = useState<string | undefined>(undefined);
  const [templates, setTemplates] = useState<RequirementTemplate[]>([]);
  const [preparedQuery, setPreparedQuery] = useState('');
  const [draftRequirement, setDraftRequirement] = useState<RequirementAnalysis | null>(null);
  const [confirmedRequirement, setConfirmedRequirement] = useState<RequirementAnalysis | null>(null);
  const [isDraftConfirmed, setIsDraftConfirmed] = useState(false);
  const [suggestedExclusions, setSuggestedExclusions] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<{ type: 'ai' | 'template'; label: string; detail: string } | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);

  // Mobile UI drawers state:
  const [showLeftDrawer, setShowLeftDrawer] = useState(false);
  const [showRightDrawer, setShowRightDrawer] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    try {
      setTemplates(JSON.parse(localStorage.getItem('rag-requirement-templates') || '[]'));
    } catch {
      setTemplates([]);
    }
  }, []);

  // Fetch db exclusions on mount
  useEffect(() => {
    const fetchExclusions = async () => {
      try {
        const res = await fetch('/api/rag/exclusions');
        if (res.ok) {
          const data = await res.json();
          if (data.keywords) {
            setDbExclusions(data.keywords);
          }
        }
      } catch (err) {
        console.error('Failed to load exclusions:', err);
      }
    };
    fetchExclusions();
  }, []);

  // Load sessions from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('rag-chat-sessions');
    const storedActiveId = localStorage.getItem('rag-active-session-id');

    let parsedSessions: SessionItem[] = [];
    if (stored) {
      try {
        const storedSessions = JSON.parse(stored) as SessionItem[];
        parsedSessions = storedSessions.map((session) => ({
          ...session,
          messages: recoverInterruptedMessages(session.messages || []),
        }));
        localStorage.setItem('rag-chat-sessions', JSON.stringify(parsedSessions));
      } catch (e) {
        console.error('Failed to parse sessions from local storage', e);
      }
    }

    if (parsedSessions.length === 0) {
      const newSessId = crypto.randomUUID();
      const defaultSession: SessionItem = {
        id: newSessId,
        title: '新推荐会话',
        messages: [],
        lastSql: undefined,
        targetCount: 15,
        categoryWeight: 1.2,
        keywordWeight: 0.6,
        selectedExclusions: [],
      };
      parsedSessions = [defaultSession];
      localStorage.setItem('rag-chat-sessions', JSON.stringify(parsedSessions));
      localStorage.setItem('rag-active-session-id', newSessId);
      setSessions(parsedSessions);
      setActiveSessionId(newSessId);
    } else {
      setSessions(parsedSessions);
      if (storedActiveId && parsedSessions.some(s => s.id === storedActiveId)) {
        setActiveSessionId(storedActiveId);
      } else {
        const fallbackId = parsedSessions[0].id;
        setActiveSessionId(fallbackId);
        localStorage.setItem('rag-active-session-id', fallbackId);
      }
    }
  }, []);

  // Sync state with active session
  useEffect(() => {
    if (!activeSessionId || sessions.length === 0) return;
    const activeSession = sessions.find(s => s.id === activeSessionId);
    if (activeSession) {
      setMessages(activeSession.messages || []);
      setLastSql(activeSession.lastSql);
      setTargetCount(activeSession.targetCount ?? 15);
      setCategoryWeight(activeSession.categoryWeight ?? 1.2);
      setKeywordWeight(activeSession.keywordWeight ?? 0.6);
      setSelectedExclusions(activeSession.selectedExclusions ?? []);
      setSelectedKeywords(activeSession.selectedKeywords ?? []);
      setSessionId(activeSession.id);

      const lastUser = [...(activeSession.messages || [])]
        .reverse()
        .find(m => m.role === 'user');
      if (lastUser) {
        setLastUserQuery(lastUser.content);
      } else {
        setLastUserQuery('');
      }
    }
  }, [activeSessionId, sessions]);

  // Update helper
  const updateActiveSession = useCallback((updates: Partial<SessionItem>) => {
    if (!activeSessionId) return;
    setSessions((prevSessions) => {
      const updated = prevSessions.map((sess) => {
        if (sess.id === activeSessionId) {
          return {
            ...sess,
            ...updates,
          };
        }
        return sess;
      });
      localStorage.setItem('rag-chat-sessions', JSON.stringify(updated));
      return updated;
    });
  }, [activeSessionId]);

  const handleCreateSession = useCallback(() => {
    const newSessId = crypto.randomUUID();
    const newSession: SessionItem = {
      id: newSessId,
      title: '新推荐会话',
      messages: [],
      lastSql: undefined,
      targetCount: 15,
      categoryWeight: 1.2,
      keywordWeight: 0.6,
      selectedExclusions: [],
    };

    setSessions((prev) => {
      const updated = [newSession, ...prev];
      localStorage.setItem('rag-chat-sessions', JSON.stringify(updated));
      return updated;
    });
    setActiveSessionId(newSessId);
    localStorage.setItem('rag-active-session-id', newSessId);
    setMessages([]);
    setLastSql(undefined);
    setTargetCount(15);
    setCategoryWeight(1.2);
    setKeywordWeight(0.6);
    setSelectedExclusions([]);
    setSessionId(newSessId);
    setLastUserQuery('');
  }, []);

  const handleSwitchSession = useCallback((id: string) => {
    setActiveSessionId(id);
    localStorage.setItem('rag-active-session-id', id);
  }, []);

  const handleDeleteSession = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确认删除该推荐会话吗？')) {
      setSessions((prev) => {
        let updated = prev.filter(s => s.id !== id);
        const nextActiveId = updated[0]?.id || crypto.randomUUID();
        if (updated.length === 0) {
          updated = [{
            id: nextActiveId,
            title: '新推荐会话',
            messages: [],
            lastSql: undefined,
            targetCount: 15,
            categoryWeight: 1.2,
            keywordWeight: 0.6,
            selectedExclusions: [],
          }];
        }
        localStorage.setItem('rag-chat-sessions', JSON.stringify(updated));

        if (activeSessionId === id) {
          setActiveSessionId(updated[0]?.id || nextActiveId);
          localStorage.setItem('rag-active-session-id', updated[0]?.id || nextActiveId);
        }
        return updated;
      });
    }
  }, [activeSessionId]);

  const handleTargetCountChange = (val: number) => {
    setTargetCount(val);
    setConfirmedRequirement(null);
    setIsDraftConfirmed(false);
    setDraftRequirement((current) => current ? {
      ...current,
      constraints: { ...current.constraints, target_count: val },
    } : current);
    updateActiveSession({ targetCount: val });
  };

  const handleCategoryWeightChange = (val: number) => {
    setCategoryWeight(val);
    setConfirmedRequirement(null);
    setIsDraftConfirmed(false);
    updateActiveSession({ categoryWeight: val });
  };

  const handleKeywordWeightChange = (val: number) => {
    setKeywordWeight(val);
    setConfirmedRequirement(null);
    setIsDraftConfirmed(false);
    updateActiveSession({ keywordWeight: val });
  };

  const handleExclusionsChange = (val: string[]) => {
    setSelectedExclusions(val);
    setConfirmedRequirement(null);
    setIsDraftConfirmed(false);
    setDraftRequirement((current) => current ? {
      ...current,
      constraints: { ...current.constraints, exclude_keywords: val },
    } : current);
    updateActiveSession({ selectedExclusions: val });
  };

  const handleKeywordsChange = (val: string[]) => {
    setSelectedKeywords(val);
    setConfirmedRequirement(null);
    setIsDraftConfirmed(false);
    setDraftRequirement((current) => current ? {
      ...current,
      keywords: val,
      expanded_search_terms: val,
    } : current);
    updateActiveSession({ selectedKeywords: val });
  };

  const handleResetSession = useCallback(() => {
    if (confirm('确认清空当前对话上下文并重新开始？')) {
      setMessages([]);
      setLastSql(undefined);
      setTargetCount(15);
      setCategoryWeight(1.2);
      setKeywordWeight(0.6);
      setSelectedExclusions([]);
      setSelectedKeywords([]);
      setLastUserQuery('');
      setPreparedQuery('');
      setDraftRequirement(null);
      setConfirmedRequirement(null);
      setIsDraftConfirmed(false);
      setSuggestedExclusions([]);
      setStrategy(null);
      updateActiveSession({
        messages: [],
        lastSql: undefined,
        targetCount: 15,
        categoryWeight: 1.2,
        keywordWeight: 0.6,
        selectedExclusions: [],
        selectedKeywords: [],
        title: '新推荐会话',
      });
    }
  }, [updateActiveSession]);

  const applyPreparedRequirement = useCallback((
    query: string,
    requirement: RequirementAnalysis,
    exclusions: string[],
    nextStrategy: { type: 'ai' | 'template'; label: string; detail: string },
  ) => {
    const nextRequirement = {
      ...requirement,
      original_query: query,
      constraints: {
        ...requirement.constraints,
        target_count: requirement.constraints.target_count ?? targetCount,
        exclude_keywords: exclusions,
      },
    };
    setPreparedQuery(query);
    setDraftRequirement(nextRequirement);
    setConfirmedRequirement(null);
    setIsDraftConfirmed(false);
    setSelectedExclusions(exclusions);
    setSelectedKeywords([...new Set([
      ...(requirement.keywords || []),
      ...(requirement.expanded_search_terms || []),
    ])]);
    setTargetCount(nextRequirement.constraints.target_count ?? targetCount);
    setSuggestedExclusions(exclusions);
    setStrategy(nextStrategy);
    setInput('');
  }, [targetCount]);

  const prepareRequirement = useCallback(async (rawQuery: string, forceAi = false) => {
    const query = rawQuery.trim();
    if (!query || isPreparing || isLoading) return;

    const matchedTemplate = forceAi ? undefined : findExactTemplate(query, templates);
    if (matchedTemplate) {
      setCategoryWeight(matchedTemplate.categoryWeight);
      setKeywordWeight(matchedTemplate.keywordWeight);
      applyPreparedRequirement(
        query,
        matchedTemplate.requirement,
        matchedTemplate.requirement.constraints.exclude_keywords ?? [],
        {
          type: 'template',
          label: `需求模板直用：${matchedTemplate.name}`,
          detail: `标准化文本精确命中，已跳过 LLM 解析 · 更新于 ${new Date(matchedTemplate.updatedAt).toLocaleDateString('zh-CN')}`,
        },
      );
      return;
    }

    setIsPreparing(true);
    try {
      const response = await fetch('/api/rag/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      const usedFallback = data.strategy === 'local-fallback';
      applyPreparedRequirement(query, data.requirement, suggestions, {
        type: 'ai',
        label: usedFallback ? '本地规则降级解析' : 'AI 需求解析',
        detail: usedFallback
          ? 'LLM 当前不可用，本轮使用本地规则提取需求；请重点检查查询草稿。'
          : '本轮已调用需求分析模型。请检查右侧草稿与中间查询预览。',
      });
    } catch (error) {
      console.error('Failed to prepare requirement:', error);
      setToastMessage('需求解析失败，请稍后重试');
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsPreparing(false);
    }
  }, [applyPreparedRequirement, isLoading, isPreparing, templates]);

  const confirmAdjustments = useCallback(() => {
    if (!draftRequirement) return;
    const confirmed = {
      ...draftRequirement,
      keywords: selectedKeywords,
      expanded_search_terms: selectedKeywords,
      constraints: {
        ...draftRequirement.constraints,
        target_count: targetCount,
        exclude_keywords: selectedExclusions,
      },
    };
    setConfirmedRequirement(confirmed);
    setDraftRequirement(confirmed);
    setIsDraftConfirmed(true);
  }, [draftRequirement, selectedExclusions, selectedKeywords, targetCount]);

  const saveSessionAsTemplate = useCallback((session: SessionItem) => {
    if (!draftRequirement || !preparedQuery) {
      setToastMessage('请先解析并确认一个需求');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }
    const name = window.prompt('模板名称', session.title || '新需求模板')?.trim();
    if (!name) return;
    const nextTemplate: RequirementTemplate = {
      id: crypto.randomUUID(),
      name,
      sourceText: preparedQuery,
      normalizedText: normalizeRequirementText(preparedQuery),
      requirement: {
        ...(confirmedRequirement ?? draftRequirement),
        constraints: {
          ...(confirmedRequirement ?? draftRequirement).constraints,
          target_count: targetCount,
          exclude_keywords: selectedExclusions,
        },
      },
      categoryWeight,
      keywordWeight,
      updatedAt: new Date().toISOString(),
    };
    setTemplates((current) => {
      const updated = [nextTemplate, ...current.filter((item) => item.normalizedText !== nextTemplate.normalizedText)];
      localStorage.setItem('rag-requirement-templates', JSON.stringify(updated));
      return updated;
    });
  }, [categoryWeight, confirmedRequirement, draftRequirement, keywordWeight, preparedQuery, selectedExclusions, targetCount]);

  const lastAssistantMessage = useMemo(() => {
    const reversed = [...messages].reverse();
    return reversed.find((message) => message.role === 'assistant');
  }, [messages]);

  const followUpPrompts = useMemo(() => {
    return buildFollowUpPrompts(lastUserQuery, lastAssistantMessage);
  }, [lastAssistantMessage, lastUserQuery]);

  const upsertAssistantMessage = useCallback(
    (assistantMessageId: string, updater: (current?: MessageType) => MessageType) => {
      setMessages((prev) => {
        const existingIndex = prev.findIndex((message) => message.id === assistantMessageId);
        let updated: MessageType[];
        if (existingIndex !== -1) {
          updated = [...prev];
          updated[existingIndex] = updater(updated[existingIndex]);
        } else {
          updated = [...prev, updater(undefined)];
        }
        updateActiveSession({ messages: updated });
        return updated;
      });
    },
    [updateActiveSession]
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

  const submitQuery = useCallback(async (rawInput: string, prepared?: RequirementAnalysis) => {
    const trimmed = rawInput.trim();
    if (!trimmed || isLoading) return;

    const userMessage: MessageType = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      status: 'done',
    };
    const assistantMessageId = crypto.randomUUID();

    const isFirstMsg = messages.length === 0;
    const newTitle = isFirstMsg
      ? (trimmed.slice(0, 12) + (trimmed.length > 12 ? '...' : ''))
      : undefined;

    const streamingMsg: MessageType = {
      id: assistantMessageId,
      role: 'assistant',
      content: '正在为您梳理需求，调取书库向量检索...',
      status: 'streaming',
    };

    setMessages((prev) => {
      const updated = [...prev, userMessage, streamingMsg];
      updateActiveSession({
        messages: updated,
        ...(newTitle ? { title: newTitle } : {}),
      });
      return updated;
    });

    setLastUserQuery(trimmed);
    setInput('');
    setDraftRequirement(null);
    setIsLoading(true);
    setCurrentPhase('requirement_analysis');

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      timeoutId = setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS);

      const response = await fetch('/api/rag/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          sessionId: sessionId || undefined,
          limit: targetCount,
          excludeKeywords: selectedExclusions,
          categoryWeight: categoryWeight,
          keywordWeight: keywordWeight,
          confirmedRequirement: prepared,
        }),
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

        const sqlFromResp = data.retrieval?.sql;
        if (sqlFromResp) {
          setLastSql(sqlFromResp);
          setTimeout(() => updateActiveSession({ lastSql: sqlFromResp }), 0);
        }

        if (data.sessionId && data.sessionId !== activeSessionId) {
          setSessions((prev) => {
            const updated = prev.map((s) => {
              if (s.id === activeSessionId) {
                return { ...s, id: data.sessionId };
              }
              return s;
            });
            localStorage.setItem('rag-chat-sessions', JSON.stringify(updated));
            return updated;
          });
          setActiveSessionId(data.sessionId);
          localStorage.setItem('rag-active-session-id', data.sessionId);
          setSessionId(data.sessionId);
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
              const sqlFromResp = data.data?.sql;
              if (sqlFromResp) {
                setLastSql(sqlFromResp);
                setTimeout(() => updateActiveSession({ lastSql: sqlFromResp }), 0);
              }
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

              const sqlFromResp = data.retrieval?.sql;
              if (sqlFromResp) {
                setLastSql(sqlFromResp);
                setTimeout(() => updateActiveSession({ lastSql: sqlFromResp }), 0);
              }

              if (data.sessionId && data.sessionId !== activeSessionId) {
                setSessions((prev) => {
                  const updated = prev.map((s) => {
                    if (s.id === activeSessionId) {
                      return { ...s, id: data.sessionId };
                    }
                    return s;
                  });
                  localStorage.setItem('rag-chat-sessions', JSON.stringify(updated));
                  return updated;
                });
                setActiveSessionId(data.sessionId);
                localStorage.setItem('rag-active-session-id', data.sessionId);
                setSessionId(data.sessionId);
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
      const isTimeout = error instanceof DOMException && error.name === 'AbortError';
      upsertAssistantMessage(assistantMessageId, () => ({
        id: assistantMessageId, role: 'assistant',
        content: isTimeout
          ? '查询等待超时，已自动停止。请重试，系统会创建新的会话继续处理。'
          : '抱歉，处理你的请求时出错了。你可以稍后重试，或者换个更具体的需求。',
        status: 'error',
      }));
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      abortControllerRef.current = null;
    }
  }, [isLoading, activeSessionId, sessionId, targetCount, selectedExclusions, categoryWeight, keywordWeight, upsertAssistantMessage, updateActiveSession, messages.length]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    prepareRequirement(input);
  }, [input, prepareRequirement]);

  const handleStarterSelect = useCallback((prompt: string) => {
    setInput(prompt);
    setTimeout(() => prepareRequirement(prompt), 0);
  }, [prepareRequirement]);

  const handleFollowUp = useCallback((query: string) => {
    prepareRequirement(query);
  }, [prepareRequirement]);

  const pseudoSql = useMemo(
    () => draftRequirement ? buildPseudoSql(draftRequirement, categoryWeight, keywordWeight) : '',
    [categoryWeight, draftRequirement, keywordWeight],
  );

  const renderSidebarContent = (onClose?: () => void) => (
    <div className="flex flex-col justify-between h-full">
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-2 px-1 py-3 mb-4 select-none">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-550 flex items-center justify-center text-white border border-white/10 shadow-md">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-200 tracking-tight leading-none">BookStore RAG</h1>
            <span className="text-[9px] text-slate-500 font-mono">v1.2</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            handleCreateSession();
            onClose?.();
          }}
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 mb-4 rounded-xl border border-white/10 hover:border-blue-500/40 hover:bg-slate-900/60 text-slate-200 hover:text-white transition-all text-xs font-bold shadow-md shadow-black/10 active:scale-95"
        >
          <Plus className="w-4 h-4 text-blue-400" />
          <span>新建推荐会话</span>
        </button>

        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2 px-1">
          会话历史
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0">
          {sessions.map((sess) => {
            const isActive = sess.id === activeSessionId;
            return (
              <div
                key={sess.id}
                onClick={() => {
                  handleSwitchSession(sess.id);
                  onClose?.();
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  saveSessionAsTemplate(sess);
                }}
                title="右键保存为需求模板并修改模板名称"
                className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-300 border text-xs font-semibold select-none ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-450 text-blue-400 border-blue-500/25 shadow-sm shadow-blue-500/5'
                    : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-900/45 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 truncate flex-1 min-w-0 pr-1">
                  <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-550'}`} />
                  <span className="truncate">{sess.title || '新推荐会话'}</span>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleDeleteSession(sess.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-rose-455 hover:text-rose-400 transition-all active:scale-90"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-5 border-t border-white/5 pt-4">
          <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span>需求模板</span>
            <Bookmark className="h-3.5 w-3.5" />
          </div>
          <div className="space-y-1.5">
            {templates.length === 0 ? (
              <p className="px-1 text-[10px] leading-4 text-slate-600">右键会话可保存模板</p>
            ) : templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  setCategoryWeight(template.categoryWeight);
                  setKeywordWeight(template.keywordWeight);
                  applyPreparedRequirement(
                    template.sourceText,
                    template.requirement,
                    template.requirement.constraints.exclude_keywords ?? [],
                    {
                      type: 'template',
                      label: `手动采用模板：${template.name}`,
                      detail: '用户手动选择模板，已跳过 LLM 解析。',
                    },
                  );
                  onClose?.();
                }}
                className="w-full rounded-md border border-transparent px-2.5 py-2 text-left hover:border-slate-700 hover:bg-slate-900/60"
              >
                <span className="block truncate text-[11px] font-semibold text-slate-300">{template.name}</span>
                <span className="mt-1 block text-[9px] text-slate-600">精确命中后跳过 LLM</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 pt-4 text-[10px] text-slate-600 text-center select-none shrink-0 font-mono">
        <div>Gemini RAG Engine</div>
        <div className="mt-0.5 opacity-60">© 2026 Antigravity</div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d0f12] text-slate-100">
      {/* 1. Left Sidebar (Desktop) */}
      <aside className="hidden h-full w-56 shrink-0 border-r border-[#282b31] bg-[#111318] p-4 md:flex md:flex-col md:justify-between">
        {renderSidebarContent()}
      </aside>

      {/* 2. Middle Column (Chat Console) */}
      <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[#0d0f12]">
        {/* Sticky Header */}
        <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between border-b border-[#282b31] bg-[#101216] px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div>
              <h2 className="text-sm md:text-base font-bold text-slate-100 tracking-tight leading-none">
                {sessions.find(s => s.id === activeSessionId)?.title || '新推荐会话'}
              </h2>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-slate-505 text-slate-500 font-mono">Gemini RAG Engine v1.2</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLeftDrawer(true)}
              className="md:hidden p-2 rounded-xl bg-slate-900 border border-slate-800/80 text-slate-400 hover:text-slate-200 transition-all active:scale-95"
            >
              <Menu className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={() => setShowRightDrawer(true)}
              className="lg:hidden p-2 rounded-xl bg-slate-900 border border-slate-800/80 text-slate-400 hover:text-slate-200 transition-all active:scale-95"
            >
              <Sliders className="w-4.5 h-4.5" />
            </button>
          </div>
        </header>

        {/* Scrollable Message List / Starter Screen */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {draftRequirement ? (
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-5 md:px-8">
              <section className="strategy-banner">
                <div>
                  <div className="text-xs font-semibold text-amber-200">本轮策略：{strategy?.label}</div>
                  <div className="mt-1 text-[11px] leading-5 text-slate-500">{strategy?.detail}</div>
                </div>
                {strategy?.type === 'template' && (
                  <button type="button" onClick={() => prepareRequirement(preparedQuery, true)} className="text-[11px] text-amber-200 hover:text-amber-100">
                    改用 AI 重新解析
                  </button>
                )}
              </section>

              <section className="workspace-panel mt-4 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">用户需求</span>
                  <button type="button" onClick={() => setInput(preparedQuery)} className="text-[10px] text-slate-500 hover:text-slate-300">编辑</button>
                </div>
                <p className="text-sm leading-6 text-slate-200">{preparedQuery}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {draftRequirement.categories.map((item) => <span key={item} className="filter-chip">{item}</span>)}
                  {draftRequirement.keywords.slice(0, 5).map((item) => <span key={item} className="filter-chip">{item}</span>)}
                </div>
              </section>

              <section className="mt-5 flex min-h-0 flex-1 flex-col">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSearch className="h-4 w-4 text-amber-300" />
                    <h3 className="text-sm font-semibold text-slate-200">本轮查询预览</h3>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {isDraftConfirmed ? '已确认，可执行查询' : '随右侧草稿实时更新 · 尚未生效'}
                  </span>
                </div>
                <pre className="sql-preview flex-1">{pseudoSql}</pre>
                <p className="mt-2 border-l-2 border-amber-600/60 bg-amber-500/5 px-3 py-2 text-[11px] leading-5 text-slate-500">
                  右侧调整只会更新预览。点击“确认调整”后，本轮条件才会生效。
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={confirmAdjustments} className="secondary-action">确认调整</button>
                  <button
                    type="button"
                    disabled={!isDraftConfirmed || !draftRequirement || isLoading}
                    onClick={() => isDraftConfirmed && draftRequirement && submitQuery(preparedQuery, draftRequirement)}
                    className="primary-action"
                  >
                    {isLoading ? '查询中…' : isDraftConfirmed ? '查询' : '查询（请先确认）'}
                  </button>
                </div>
              </section>
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-8 md:px-8">
              <RAGChatHeader />
              <StarterPrompts isLoading={isLoading || isPreparing} onSelect={handleStarterSelect} />
            </div>
          ) : (
            <MessageList
              messages={messages}
              exporting={exporting}
              onExport={handleExportExcel}
            />
          )}
        </div>

        {/* Suggestion pills floating right above input capsule */}
        {messages.length > 0 && followUpPrompts.length > 0 && (
          <div className="absolute bottom-[96px] left-0 right-0 flex flex-wrap items-center justify-center gap-2 px-6 z-30 pointer-events-auto">
            {followUpPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleFollowUp(prompt)}
                disabled={isLoading}
                className="px-3 py-1.5 rounded-full bg-slate-950/85 backdrop-blur border border-slate-800/80 text-xs font-semibold text-slate-300 hover:text-blue-400 hover:border-blue-500/40 hover:bg-blue-500/10 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Chat Input docked inside Middle Column */}
        <ChatInput
          value={input}
          onChange={(value) => setInput(value)}
          onSubmit={handleSubmit}
          isLoading={isLoading}
        className="z-20 shrink-0 border-t border-[#282b31] bg-[#0d0f12] px-5 py-3"
        />
      </main>

      {/* 3. Right Settings Sidebar (Desktop) */}
      <aside className="hidden h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-[#282b31] bg-[#121419] p-4 lg:flex">
        <TuningPanel
          targetCount={targetCount}
          onChangeTargetCount={handleTargetCountChange}
          categoryWeight={categoryWeight}
          onChangeCategoryWeight={handleCategoryWeightChange}
          keywordWeight={keywordWeight}
          onChangeKeywordWeight={handleKeywordWeightChange}
          dbExclusions={suggestedExclusions}
          selectedExclusions={selectedExclusions}
          onChangeExclusions={handleExclusionsChange}
          suggestedKeywords={draftRequirement?.expanded_search_terms ?? draftRequirement?.keywords}
          selectedKeywords={selectedKeywords}
          onChangeKeywords={handleKeywordsChange}
          lastSql={lastSql}
          onClearSession={handleResetSession}
          suggestionCount={suggestedExclusions.length}
        />
      </aside>

      {/* 4. Mobile Drawers */}
      {/* Mobile Left Drawer Overlay */}
      {showLeftDrawer && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 md:hidden flex">
          <div className="w-64 bg-slate-950 border-r border-white/5 p-4 flex flex-col justify-between h-full relative animate-fade-in-up">
            <button
              onClick={() => setShowLeftDrawer(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
            {renderSidebarContent(() => setShowLeftDrawer(false))}
          </div>
          <div className="flex-1" onClick={() => setShowLeftDrawer(false)} />
        </div>
      )}

      {/* Mobile Right Drawer Overlay */}
      {showRightDrawer && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 lg:hidden flex justify-end">
          <div className="flex-1" onClick={() => setShowRightDrawer(false)} />
          <div className="w-80 bg-slate-950 border-l border-white/5 p-5 flex flex-col h-full relative animate-fade-in-up">
            <button
              onClick={() => setShowRightDrawer(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="pt-8 flex-1 overflow-y-auto min-h-0">
              <TuningPanel
                targetCount={targetCount}
                onChangeTargetCount={handleTargetCountChange}
                categoryWeight={categoryWeight}
                onChangeCategoryWeight={handleCategoryWeightChange}
                keywordWeight={keywordWeight}
                onChangeKeywordWeight={handleKeywordWeightChange}
                dbExclusions={suggestedExclusions}
                selectedExclusions={selectedExclusions}
                onChangeExclusions={handleExclusionsChange}
                suggestedKeywords={draftRequirement?.expanded_search_terms ?? draftRequirement?.keywords}
                selectedKeywords={selectedKeywords}
                onChangeKeywords={handleKeywordsChange}
                lastSql={lastSql}
                onClearSession={handleResetSession}
                suggestionCount={suggestedExclusions.length}
              />
            </div>
          </div>
        </div>
      )}

      <Toast message={toastMessage} />
    </div>
  );
}

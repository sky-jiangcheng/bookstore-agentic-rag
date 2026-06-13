'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Settings,
  Eye,
  EyeOff,
  Check,
  ExternalLink,
  Loader2,
  AlertCircle,
  Zap,
  Sun,
  Moon,
  Monitor,
  Plus,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { LLMProviderConfig } from '@/lib/config/provider-config';
import {
  applyThemeMode,
  loadThemeMode,
  saveThemeMode,
  subscribeToSystemTheme,
  type ThemeMode,
} from '@/lib/theme';

interface LLMSettingsDialogProps {
  config: LLMProviderConfig;
  onSave: (config: LLMProviderConfig) => void;
}

const DEFAULT_MODEL_EXAMPLES = [
  'gemini-2.0-flash',
  'gemini-2.5-pro-exp-03-25',
  'gemini-1.5-pro',
  'gpt-4o',
  'gpt-4o-mini',
  'deepseek-chat',
  'claude-sonnet-4-20250514',
];

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '');
}

export function LLMSettingsDialog({ config, onSave }: LLMSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'model' | 'library' | 'appearance'>('model');
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model, setModel] = useState(config.model);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl ?? '');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'fail'>('idle');
  const [testError, setTestError] = useState('');
  const [savedTheme, setSavedTheme] = useState<ThemeMode>('dark');
  const [themeDraft, setThemeDraft] = useState<ThemeMode>('dark');

  useEffect(() => {
    const mode = loadThemeMode();
    setSavedTheme(mode);
    setThemeDraft(mode);
  }, []);

  useEffect(() => {
    applyThemeMode(savedTheme);
    return subscribeToSystemTheme(savedTheme);
  }, [savedTheme]);

  const syncDrafts = useCallback(() => {
    const theme = loadThemeMode();
    setApiKey(config.apiKey);
    setModel(config.model);
    setBaseUrl(config.baseUrl ?? '');
    setSavedTheme(theme);
    setThemeDraft(theme);
    setShowKey(false);
    setTestStatus('idle');
    setTestError('');
  }, [config]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      syncDrafts();
      setActiveTab('model');
    }
    setOpen(nextOpen);
  };

  const handleSave = () => {
    const newConfig: LLMProviderConfig = {
      type: 'openai-compatible',
      apiKey: apiKey.trim(),
      model: model.trim() || 'gemini-2.0-flash',
      baseUrl: normalizeBaseUrl(baseUrl.trim()) || undefined,
    };
    onSave(newConfig);
    saveThemeMode(themeDraft);
    setSavedTheme(themeDraft);
    applyThemeMode(themeDraft);
    setOpen(false);
  };

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestStatus('idle');
    setTestError('');

    const providerConfig: LLMProviderConfig = {
      type: 'openai-compatible',
      apiKey: apiKey.trim(),
      model: model.trim() || 'gemini-2.0-flash',
      baseUrl: normalizeBaseUrl(baseUrl.trim()) || undefined,
    };

    try {
      const res = await fetch('/api/rag/test-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(providerConfig),
      });
      let data: { ok?: boolean; error?: string };
      try {
        data = await res.json();
      } catch {
        setTestStatus('fail');
        setTestError(`服务器返回了非 JSON 响应 (HTTP ${res.status})`);
        return;
      }
      if (data.ok) {
        setTestStatus('success');
      } else {
        setTestStatus('fail');
        setTestError(data.error || '连接失败');
      }
    } catch (err) {
      setTestStatus('fail');
      setTestError(err instanceof Error ? err.message : '网络请求失败');
    } finally {
      setTesting(false);
    }
  }, [apiKey, model, baseUrl]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-700/60 px-3 py-2 text-[10px] text-slate-500 hover:border-slate-600 hover:text-slate-300 transition-all"
        >
          <Settings className="h-3.5 w-3.5" />
          <span>设置</span>
        </button>
      </DialogTrigger>
      <DialogContent className="border-slate-700 bg-[#15181f] text-slate-200 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base text-slate-100">设置</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            模型连接与界面外观分别管理，配置保存在当前浏览器中。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 rounded-lg border border-slate-700/70 bg-slate-900/50 p-1">
          {([
            ['model', '模型配置'],
            ['library', '馆别管理'],
            ['appearance', '外观'],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                activeTab === tab
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'model' ? (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-400">API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza... 或 sk-..."
                className="w-full rounded-md border border-slate-700 bg-[#101216] px-2.5 py-2 pr-8 text-xs text-slate-200 outline-none focus:border-amber-500/60"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-400">模型名称</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gemini-2.0-flash"
              className="w-full rounded-md border border-slate-700 bg-[#101216] px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-amber-500/60"
            />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DEFAULT_MODEL_EXAMPLES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModel(m)}
                  className="rounded border border-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-500 hover:border-slate-600 hover:text-slate-300"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-400">API 地址 (Base URL)</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://generativelanguage.googleapis.com/v1beta/openai"
              className="w-full rounded-md border border-slate-700 bg-[#101216] px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-amber-500/60 font-mono"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              支持任何 OpenAI 兼容 API，例如 Google Gemini、DeepSeek、OpenAI
            </p>
          </div>
        </div>
        ) : activeTab === 'library' ? (
          <LibraryManagement />
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold text-slate-200">界面主题</div>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                选择后会立即预览；关闭弹窗不会保存更改。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['light', '明亮', Sun],
                ['dark', '暗色', Moon],
                ['system', '跟随系统', Monitor],
              ] as const).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setThemeDraft(mode);
                    saveThemeMode(mode);
                    setSavedTheme(mode);
                    applyThemeMode(mode);
                  }}
                  className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-xs font-semibold transition-all ${
                    themeDraft === mode
                      ? 'border-blue-500/60 bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20'
                      : 'border-slate-700 bg-slate-900/40 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab !== 'library' && (
        <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-4">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            {activeTab === 'model' ? (
              <>
                <ExternalLink className="h-3 w-3" />
                <span>
                  <a href="https://ai.google.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">ai.google.dev</a>
                </span>
              </>
            ) : (
              <span>当前选择：{themeDraft === 'light' ? '明亮' : themeDraft === 'dark' ? '暗色' : '跟随系统'}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'model' && (
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !apiKey.trim()}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-400 hover:border-slate-600 hover:text-slate-200 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : testStatus === 'success' ? (
                <Zap className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              <span>
                {testing ? '测试中…' : '测试连接'}
              </span>
              {testStatus === 'success' && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />}
              {testStatus === 'fail' && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]" />}
            </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-all active:scale-95"
            >
              <Check className="h-3.5 w-3.5" />
              保存
            </button>
          </div>
        </div>
        )}
        {activeTab === 'model' && testStatus === 'fail' && testError && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-rose-700/50 bg-rose-500/10 px-3 py-2.5">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
            <p className="text-[11px] leading-5 text-rose-200">{testError}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface LibraryCategory {
  code: string;
  name: string;
  icon: string;
  sort_order: number;
  reclassified_at: string | null;
  keyword_count: number;
}

function LibraryManagement() {
  const [categories, setCategories] = useState<LibraryCategory[]>([]);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [keywordsMap, setKeywordsMap] = useState<Record<string, string[]>>({});
  const [pendingKeywords, setPendingKeywords] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [reclassifying, setReclassifying] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [toast, setToast] = useState('');

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/library-categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const loadKeywords = useCallback(async (code: string) => {
    try {
      const res = await fetch(`/api/admin/library-categories/${encodeURIComponent(code)}/keywords`);
      if (res.ok) {
        const data = await res.json();
        setKeywordsMap(prev => ({ ...prev, [code]: data.keywords || [] }));
        setPendingKeywords(prev => ({ ...prev, [code]: data.keywords || [] }));
      }
    } catch (err) {
      console.error('Failed to load keywords:', err);
    }
  }, []);

  const toggleExpand = (code: string) => {
    if (expandedCode === code) {
      setExpandedCode(null);
      return;
    }
    setExpandedCode(code);
    if (!keywordsMap[code]) {
      loadKeywords(code);
    }
  };

  const addKeyword = (code: string, keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    setPendingKeywords(prev => {
      const current = prev[code] || [];
      if (current.includes(trimmed)) return prev;
      return { ...prev, [code]: [...current, trimmed] };
    });
  };

  const removeKeyword = (code: string, keyword: string) => {
    setPendingKeywords(prev => ({
      ...prev,
      [code]: (prev[code] || []).filter(k => k !== keyword),
    }));
  };

  const saveKeywords = async (code: string) => {
    try {
      setSaving(code);
      const keywords = pendingKeywords[code] || [];
      const res = await fetch(`/api/admin/library-categories/${encodeURIComponent(code)}/keywords`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords }),
      });
      if (res.ok) {
        setKeywordsMap(prev => ({ ...prev, [code]: keywords }));
        setToast('屏蔽词已保存');
        setTimeout(() => setToast(''), 2000);
        loadCategories();
      } else {
        setToast('保存失败');
        setTimeout(() => setToast(''), 2000);
      }
    } catch (err) {
      console.error('Failed to save keywords:', err);
      setToast('保存失败');
      setTimeout(() => setToast(''), 2000);
    } finally {
      setSaving(null);
    }
  };

  const createCategory = async () => {
    if (!newCode.trim() || !newName.trim()) return;
    try {
      const res = await fetch('/api/admin/library-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newCode.trim(), name: newName.trim() }),
      });
      if (res.ok) {
        setShowNewForm(false);
        setNewCode('');
        setNewName('');
        loadCategories();
      }
    } catch (err) {
      console.error('Failed to create category:', err);
    }
  };

  const deleteCategory = async (code: string) => {
    if (!confirm(`确认删除馆别「${code}」？关联的屏蔽词也会被停用。`)) return;
    try {
      const res = await fetch(`/api/admin/library-categories?code=${encodeURIComponent(code)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setExpandedCode(prev => prev === code ? null : prev);
        loadCategories();
      }
    } catch (err) {
      console.error('Failed to delete category:', err);
    }
  };

  const triggerReclassify = async () => {
    if (!confirm('确认对所有图书执行重分类？此操作会根据当前屏蔽词规则重新计算每本书的馆别归属。')) return;
    try {
      setReclassifying(true);
      const res = await fetch('/api/admin/reclassify', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setToast(`重分类完成：处理了 ${data.processed} 本书`);
        setTimeout(() => setToast(''), 4000);
        loadCategories();
      } else {
        setToast('重分类失败');
        setTimeout(() => setToast(''), 3000);
      }
    } catch (err) {
      console.error('Failed to reclassify:', err);
      setToast('重分类请求失败');
      setTimeout(() => setToast(''), 3000);
    } finally {
      setReclassifying(false);
    }
  };

  const unsavedCount = (code: string) => {
    const saved = keywordsMap[code] || [];
    const pending = pendingKeywords[code] || [];
    if (saved.length !== pending.length) return true;
    return saved.some((k, i) => k !== pending[i]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <p className="text-[11px] leading-5 text-slate-500">
          管理图书馆别及其对应的屏蔽词规则。编辑后需执行重分类才能生效。
        </p>
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-2.5 py-1.5 text-[10px] text-amber-200 hover:bg-amber-500/10"
        >
          <Plus className="h-3 w-3" />
          新增馆别
        </button>
      </div>

      {showNewForm && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="mb-2 flex gap-2">
            <input
              value={newCode}
              onChange={e => setNewCode(e.target.value)}
              placeholder="馆别代码（如 乡镇馆）"
              className="min-w-0 flex-1 rounded-md border border-slate-700 bg-[#101216] px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500/60"
            />
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="显示名称"
              className="min-w-0 flex-1 rounded-md border border-slate-700 bg-[#101216] px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500/60"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowNewForm(false)} className="rounded-md px-2 py-1 text-[10px] text-slate-500 hover:text-slate-300">取消</button>
            <button type="button" onClick={createCategory} className="rounded-md bg-amber-600 px-3 py-1 text-[10px] text-white hover:bg-amber-500">创建</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {categories.map(cat => {
          const isExpanded = expandedCode === cat.code;
          const isPending = !cat.reclassified_at;
          const hasUnsaved = unsavedCount(cat.code);

          return (
            <div key={cat.code} className="rounded-md border border-slate-700/60 bg-slate-900/30">
              <button
                type="button"
                onClick={() => toggleExpand(cat.code)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
                  <span className="text-sm font-semibold text-slate-200">{cat.name}</span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{cat.keyword_count} 词</span>
                  {isPending && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">待刷新</span>
                  )}
                  {hasUnsaved && (
                    <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-300">未保存</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {hasUnsaved && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); saveKeywords(cat.code); }}
                      disabled={saving === cat.code}
                      className="rounded-md bg-blue-600 px-2 py-1 text-[10px] text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      {saving === cat.code ? '保存中…' : '保存'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); deleteCategory(cat.code); }}
                    className="rounded p-1 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-700/40 px-3 py-3">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(pendingKeywords[cat.code] || []).map(kw => (
                      <span key={kw} className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300">
                        {kw}
                        <button type="button" onClick={() => removeKeyword(cat.code, kw)} className="text-slate-500 hover:text-rose-400">×</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      placeholder="添加屏蔽词"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          addKeyword(cat.code, (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                      className="min-w-0 flex-1 rounded-md border border-slate-700 bg-[#101216] px-2 py-1.5 text-[10px] text-slate-200 outline-none focus:border-amber-500/60"
                    />
                    <button
                      type="button"
                      onClick={e => {
                        const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                        addKeyword(cat.code, input.value);
                        input.value = '';
                      }}
                      className="rounded-md border border-amber-500/40 px-2 text-[10px] text-amber-200 hover:bg-amber-500/10"
                    >
                      添加
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-white/5 pt-3">
        <div className="flex items-center gap-1.5">
          {toast && <span className="text-[10px] text-emerald-400">{toast}</span>}
        </div>
        <button
          type="button"
          onClick={triggerReclassify}
          disabled={reclassifying}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-2 text-[10px] font-semibold text-white hover:bg-amber-500 transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${reclassifying ? 'animate-spin' : ''}`} />
          {reclassifying ? '重分类中…' : '执行重分类'}
        </button>
      </div>
    </div>
  );
}

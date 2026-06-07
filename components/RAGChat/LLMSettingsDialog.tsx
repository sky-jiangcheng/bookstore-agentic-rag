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
} from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { LLMProviderConfig, LLMProviderType } from '@/lib/config/provider-config';
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

const PROVIDER_LABELS: Record<LLMProviderType, string> = {
  google: 'Google Gemini',
  'openai-compatible': 'OpenAI 兼容',
};

const PLACEHOLDERS: Record<LLMProviderType, { apiKey: string; model: string; baseUrl: string }> = {
  google: { apiKey: 'AIza...', model: 'gemini-2.0-flash', baseUrl: '' },
  'openai-compatible': { apiKey: 'sk-...', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' },
};

const MODEL_EXAMPLES: Record<LLMProviderType, string[]> = {
  google: ['gemini-2.0-flash', 'gemini-2.5-pro-exp-03-25', 'gemini-1.5-pro'],
  'openai-compatible': ['gpt-4o', 'gpt-4o-mini', 'deepseek-chat', 'claude-sonnet-4-20250514'],
};

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '');
}

export function LLMSettingsDialog({ config, onSave }: LLMSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'model' | 'appearance'>('model');
  const [type, setType] = useState<LLMProviderType>(config.type);
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
    setType(config.type);
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
    } else {
      applyThemeMode(savedTheme);
    }
    setOpen(nextOpen);
  };

  const handleSave = () => {
    const newConfig: LLMProviderConfig = {
      type,
      apiKey: apiKey.trim(),
      model: model.trim() || (type === 'google' ? 'gemini-2.0-flash' : 'gpt-4o'),
      baseUrl: type === 'openai-compatible' ? (normalizeBaseUrl(baseUrl.trim()) || undefined) : undefined,
    };
    onSave(newConfig);
    saveThemeMode(themeDraft);
    setSavedTheme(themeDraft);
    applyThemeMode(themeDraft);
    setOpen(false);
  };

  const handleTypeChange = (newType: LLMProviderType) => {
    setType(newType);
    if (newType === 'openai-compatible' && !baseUrl) {
      setBaseUrl('https://api.openai.com/v1');
    }
    setTestStatus('idle');
    setTestError('');
  };

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestStatus('idle');
    setTestError('');

    const providerConfig: LLMProviderConfig = {
      type,
      apiKey: apiKey.trim(),
      model: model.trim() || (type === 'google' ? 'gemini-2.0-flash' : 'gpt-4o'),
      baseUrl: type === 'openai-compatible' ? (normalizeBaseUrl(baseUrl.trim()) || undefined) : undefined,
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
  }, [type, apiKey, model, baseUrl]);

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

        <div className="grid grid-cols-2 rounded-lg border border-slate-700/70 bg-slate-900/50 p-1">
          {([
            ['model', '模型配置'],
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
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-400">供应商</label>
            <div className="grid grid-cols-2 gap-2">
              {(['google', 'openai-compatible'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={`rounded-lg border px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                    type === t
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                      : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                  }`}
                >
                  <div>{PROVIDER_LABELS[t]}</div>
                  {t === 'openai-compatible' && (
                    <div className="mt-0.5 text-[10px] font-normal text-slate-500">支持任何 OpenAI 兼容 API</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-400">模型名称</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={PLACEHOLDERS[type].model}
              className="w-full rounded-md border border-slate-700 bg-[#101216] px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-amber-500/60"
            />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {MODEL_EXAMPLES[type].map((m) => (
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
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-400">
              API Key
              {config.apiKey && apiKey === config.apiKey && (
                <span className="ml-2 text-[10px] text-emerald-500">已配置</span>
              )}
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={PLACEHOLDERS[type].apiKey}
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

          {type === 'openai-compatible' && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold text-slate-400">API 地址 (Base URL)</label>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={PLACEHOLDERS[type].baseUrl}
                className="w-full rounded-md border border-slate-700 bg-[#101216] px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-amber-500/60 font-mono"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                例如: https://api.openai.com/v1, https://api.deepseek.com/v1
                不需要包含 /chat/completions，SDK 会自动追加
              </p>
            </div>
          )}
        </div>
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

        <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-4">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            {activeTab === 'model' ? (
              <>
                <ExternalLink className="h-3 w-3" />
                <span>
                  {type === 'google'
                    ? <a href="https://ai.google.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">ai.google.dev</a>
                    : <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">platform.openai.com</a>
                  }
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

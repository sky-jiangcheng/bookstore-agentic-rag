import { useMemo } from 'react';
import { ChatIcon } from 'tdesign-icons-react';
import { Card, Button, Space } from 'tdesign-react';
import { buildFollowUpPrompts } from '@/components/rag-chat-utils';
import type { MessageType } from '@/components/rag-chat-utils';

export function FollowUpSidebar({
  lastUserQuery,
  lastAssistantMessage,
  onSubmit,
}: {
  lastUserQuery: string;
  lastAssistantMessage?: MessageType;
  onSubmit: (query: string) => void;
}) {
  const followUpPrompts = useMemo(
    () => buildFollowUpPrompts(lastUserQuery, lastAssistantMessage),
    [lastAssistantMessage, lastUserQuery]
  );

  return (
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
              onClick={() => onSubmit(prompt)}
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
  );
}

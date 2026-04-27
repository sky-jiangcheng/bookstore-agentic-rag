'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ThumbsUp, ThumbsDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeedbackButtonsProps {
  bookId: string;
  sessionId: string;
  query: string;
  onFeedback?: (type: 'thumbs_up' | 'thumbs_down' | 'not_relevant') => void;
  className?: string;
}

export function FeedbackButtons({
  bookId,
  sessionId,
  query,
  onFeedback,
  className,
}: FeedbackButtonsProps) {
  const [feedbackState, setFeedbackState] = useState<'none' | 'thumbs_up' | 'thumbs_down' | 'not_relevant'>('none');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFeedback = async (type: 'thumbs_up' | 'thumbs_down' | 'not_relevant') => {
    if (feedbackState !== 'none') return; // Already submitted

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          query,
          bookId,
          feedbackType: type,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

      setFeedbackState(type);
      onFeedback?.(type);
    } catch (error) {
      console.error('[feedback] Failed to submit:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (feedbackState !== 'none') {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <span>感谢您的反馈！</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setFeedbackState('none')}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <span className="text-xs text-muted-foreground mr-2">推荐是否有帮助？</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => handleFeedback('thumbs_up')}
        disabled={isSubmitting}
        title="有帮助"
      >
        <ThumbsUp className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => handleFeedback('thumbs_down')}
        disabled={isSubmitting}
        title="没有帮助"
      >
        <ThumbsDown className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => handleFeedback('not_relevant')}
        disabled={isSubmitting}
        title="不相关"
      >
        不相关
      </Button>
    </div>
  );
}

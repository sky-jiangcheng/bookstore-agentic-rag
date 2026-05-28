/**
 * Feedback API Endpoint
 * Records user feedback for recommendations
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { storeFeedback, getSessionFeedback } from '@/lib/feedback';
import { buildSafeErrorResponse, logServerError } from '@/lib/utils/safe-error';

const feedbackSchema = z.object({
  sessionId: z.string().min(1).max(256),
  query: z.string().min(1).max(2000),
  bookId: z.string().min(1).max(256),
  feedbackType: z.enum(['thumbs_up', 'thumbs_down', 'not_relevant', 'click']),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parseResult = feedbackSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    const sessionId = parseResult.data.sessionId;
    const query = parseResult.data.query;
    const bookId = parseResult.data.bookId;
    const feedbackType = parseResult.data.feedbackType;
    const metadata = parseResult.data.metadata;

    // Store feedback
    const feedback = await storeFeedback({
      sessionId,
      query,
      bookId,
      feedbackType,
      timestamp: Date.now(),
      metadata,
    });

    return NextResponse.json({
      success: true,
      feedback: {
        id: feedback.id,
        bookId: feedback.bookId,
        feedbackType: feedback.feedbackType,
      },
    });
  } catch (error) {
    logServerError('[feedback]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '反馈提交失败'),
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId parameter is required' },
        { status: 400 }
      );
    }

    const limit = Math.min(Math.max(parseInt(limitParam || '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(offsetParam || '0', 10) || 0, 0);

    const allFeedback = await getSessionFeedback(sessionId);
    const paginatedFeedback = allFeedback.slice(offset, offset + limit);

    return NextResponse.json({
      sessionId,
      feedback: paginatedFeedback,
      count: paginatedFeedback.length,
      total: allFeedback.length,
      limit,
      offset,
    });
  } catch (error) {
    logServerError('[feedback]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '获取反馈失败'),
      { status: 500 }
    );
  }
}

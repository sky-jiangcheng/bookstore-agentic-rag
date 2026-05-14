/**
 * Feedback API Endpoint
 * Records user feedback for recommendations
 */

import { NextRequest, NextResponse } from 'next/server';
import { storeFeedback, getSessionFeedback } from '@/lib/feedback';
import { buildSafeErrorResponse, logServerError } from '@/lib/utils/safe-error';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { sessionId, query, bookId, feedbackType, metadata } = body;

    // Validate required fields
    if (!sessionId || !query || !bookId || !feedbackType) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, query, bookId, feedbackType' },
        { status: 400 }
      );
    }

    // Validate feedback type
    const validFeedbackTypes = ['thumbs_up', 'thumbs_down', 'not_relevant', 'click'];
    if (!validFeedbackTypes.includes(feedbackType)) {
      return NextResponse.json(
        { error: `Invalid feedbackType. Must be one of: ${validFeedbackTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Store feedback
    const feedback = await storeFeedback({
      sessionId,
      query,
      bookId: String(bookId),
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

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId parameter is required' },
        { status: 400 }
      );
    }

    const feedback = await getSessionFeedback(sessionId);

    return NextResponse.json({
      sessionId,
      feedback,
      count: feedback.length,
    });
  } catch (error) {
    logServerError('[feedback]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '获取反馈失败'),
      { status: 500 }
    );
  }
}

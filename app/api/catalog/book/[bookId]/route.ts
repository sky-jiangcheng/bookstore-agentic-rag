import { NextRequest, NextResponse } from 'next/server';

import { getBookDetails } from '@/lib/clients/catalog-client';
import { buildSafeErrorResponse, logServerError } from '@/lib/utils/safe-error';

interface RouteContext {
  params: Promise<{
    bookId: string;
  }>;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { bookId } = await context.params;
    const normalizedBookId = bookId.trim();

    if (!normalizedBookId) {
      return NextResponse.json({ error: 'Invalid book id' }, { status: 400 });
    }

    const book = await getBookDetails(normalizedBookId);
    return NextResponse.json({ book });
  } catch (error) {
    logServerError('[catalog/book]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '获取图书详情失败'),
      { status: 503 }
    );
  }
}

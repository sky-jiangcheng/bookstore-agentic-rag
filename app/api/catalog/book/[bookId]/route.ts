import { NextRequest, NextResponse } from 'next/server';

import { getBookDetails } from '@/lib/clients/catalog-client';
import { corsHeaders } from '@/lib/utils/cors';
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
    return NextResponse.json({ book }, { headers: corsHeaders(_req) });
  } catch (error) {
    logServerError('[catalog/book]', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404, headers: corsHeaders(_req) }
      );
    }

    return NextResponse.json(
      buildSafeErrorResponse(error, '获取图书详情失败'),
      { status: 500, headers: corsHeaders(_req) }
    );
  }
}

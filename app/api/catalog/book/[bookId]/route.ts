import { NextRequest, NextResponse } from 'next/server';

import { getBookDetails } from '@/lib/clients/catalog-client';

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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to get book details',
      },
      { status: 503 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';

import { getPopularBooks } from '@/lib/clients/catalog-client';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const count = Number.parseInt(url.searchParams.get('count') ?? '10', 10);
    const books = await getPopularBooks(Number.isNaN(count) ? 10 : count);

    return NextResponse.json({
      books,
      count: books.length,
      filtered: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load popular books',
      },
      { status: 503 }
    );
  }
}

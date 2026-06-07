import { NextRequest, NextResponse } from 'next/server';

import { getPopularBooks } from '@/lib/clients/catalog-service';
import { buildSafeErrorResponse, logServerError } from '@/lib/utils/safe-error';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const count = Number.parseInt(url.searchParams.get('count') ?? '10', 10);
    const category = url.searchParams.get('category') ?? undefined;
    const books = await getPopularBooks(Number.isNaN(count) ? 10 : count, category);

    return NextResponse.json({
      books,
      count: books.length,
      filtered: true,
    });
  } catch (error) {
    logServerError('[catalog/popular]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '获取热门图书失败'),
      { status: 500 }
    );
  }
}

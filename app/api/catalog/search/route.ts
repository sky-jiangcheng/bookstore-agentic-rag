import { NextRequest, NextResponse } from 'next/server';

import { searchCatalog } from '@/lib/clients/catalog-client';
import type { CatalogSearchFilters } from '@/lib/types/rag';
import { buildSafeErrorResponse, logServerError } from '@/lib/utils/safe-error';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CatalogSearchFilters;
    const books = await searchCatalog(body);

    return NextResponse.json({
      books,
      count: books.length,
      filtered: true,
    });
  } catch (error) {
    logServerError('[catalog/search]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '搜索目录失败'),
      { status: 503 }
    );
  }
}

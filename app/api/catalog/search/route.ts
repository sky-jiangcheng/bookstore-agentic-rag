import { NextRequest, NextResponse } from 'next/server';

import { searchCatalog } from '@/lib/clients/catalog-service';
import type { CatalogSearchFilters } from '@/lib/types/rag';
import { buildSafeErrorResponse, logServerError } from '@/lib/utils/safe-error';

async function handleSearch(
  filters: CatalogSearchFilters,
): Promise<NextResponse> {
  const books = await searchCatalog(filters);

  return NextResponse.json({
    books,
    count: books.length,
    filtered: true,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CatalogSearchFilters;
    return await handleSearch(body);
  } catch (error) {
    logServerError('[catalog/search]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '搜索目录失败'),
      { status: 503 },
    );
  }
}

/** GET 支持：从 URL 查询参数解析搜索条件 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filters: CatalogSearchFilters = {};

    const query = searchParams.get('q') || searchParams.get('query');
    if (query) filters.query = query;

    const category = searchParams.get('category');
    if (category) filters.categories = [category];

    const author = searchParams.get('author');
    if (author) filters.author = author;

    const priceMin = searchParams.get('price_min') || searchParams.get('priceMin');
    if (priceMin) filters.price_min = parseFloat(priceMin);

    const priceMax = searchParams.get('price_max') || searchParams.get('priceMax');
    if (priceMax) filters.price_max = parseFloat(priceMax);

    const limit = searchParams.get('limit');
    if (limit) filters.limit = parseInt(limit, 10);

    return await handleSearch(filters);
  } catch (error) {
    logServerError('[catalog/search]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '搜索目录失败'),
      { status: 503 },
    );
  }
}

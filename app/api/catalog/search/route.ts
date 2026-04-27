import { NextRequest, NextResponse } from 'next/server';

import { searchCatalog } from '@/lib/clients/catalog-client';
import type { CatalogSearchFilters } from '@/lib/types/rag';

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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to search catalog',
      },
      { status: 503 }
    );
  }
}

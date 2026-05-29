import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { searchCatalog } from '@/lib/clients/catalog-client';
import { buildSafeErrorResponse, logServerError } from '@/lib/utils/safe-error';

const catalogSearchSchema = z.object({
  categories: z.array(z.string().max(50)).max(10).optional(),
  author: z.string().max(200).optional(),
  price_min: z.number().min(0).optional(),
  price_max: z.number().min(0).optional(),
  query: z.string().max(500).optional(),
}).refine(
  (data) => {
    if (data.price_min !== undefined && data.price_max !== undefined) {
      return data.price_min <= data.price_max;
    }
    return true;
  },
  { message: 'price_min must be less than or equal to price_max' }
);

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parseResult = catalogSearchSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    const books = await searchCatalog(parseResult.data);

    return await handleSearch(filters);
  } catch (error) {
    logServerError('[catalog/search]', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      buildSafeErrorResponse(error, '搜索目录失败'),
      { status: 500 }
    );
  }
}

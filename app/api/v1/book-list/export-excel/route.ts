import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PassThrough } from 'stream';

import { buildExcelExportStream, nodeStreamToWeb } from '@/lib/book-list';
import { searchCatalog } from '@/lib/clients/catalog-service';
import { logServerError, buildSafeErrorResponse } from '@/lib/utils/safe-error';

const exportSchema = z.object({
  booklist_name: z.string().min(1).max(200).default('书单'),
  books: z
    .array(
      z.object({
        book_id: z.any().optional(),
        title: z.string().min(1).default('未知书名'),
        author: z.string().optional().nullable().default(null),
        publisher: z.string().optional().nullable().default(null),
        category: z.string().optional().nullable().default(null),
        price: z.number().nonnegative().optional().nullable().default(null),
        stock: z.number().int().nonnegative().optional().nullable().default(null),
        score: z.number().min(0).max(100).optional().nullable().default(null),
        source: z.string().optional().nullable().default(null),
        remark: z.string().optional().nullable().default(null),
      }),
    )
    .optional(),
  filters: z
    .object({
      categories: z.array(z.string()).optional(),
      author: z.string().optional(),
      price_min: z.number().optional(),
      price_max: z.number().optional(),
      query: z.string().optional(),
      search_terms: z.array(z.string()).optional(),
      limit: z.number().optional(),
    })
    .optional(),
  budget: z.number().nonnegative().optional().nullable().default(null),
  total_price: z.number().nonnegative().optional().nullable().default(null),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const body = exportSchema.parse(json);

    let exportBooks: any[] = [];
    if (body.books && body.books.length > 0) {
      exportBooks = body.books;
    } else if (body.filters) {
      // Fetch books from database using filters, disabling pagination for exporting all results
      const exportFilters = {
        ...body.filters,
        page: undefined,
        limit: body.filters.limit ?? 10000,
      };
      const dbBooks = await searchCatalog(exportFilters);
      exportBooks = dbBooks.map((b, i) => ({
        book_id: Number(b.book_id) || i + 1,
        title: b.title,
        author: b.author,
        publisher: b.publisher,
        category: b.category,
        price: b.price,
        stock: b.stock,
        score: b.relevance_score,
        source: 'catalog_search',
        remark: '',
      }));
    } else {
      return NextResponse.json({ error: 'Must provide either books or filters' }, { status: 400 });
    }

    // Prepare streaming response
    const passThrough = new PassThrough();
    buildExcelExportStream(
      {
        booklist_name: body.booklist_name,
        books: exportBooks,
        budget: body.budget,
        total_price: body.total_price,
      },
      passThrough,
    );

    const safeName = body.booklist_name.replace(/[^\w\s\-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `${safeName}_${dateStr}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);

    const webStream = nodeStreamToWeb(passThrough);

    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
        'Access-Control-Expose-Headers': 'Content-Disposition',
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    logServerError('[book-list/export-excel]', err);
    return NextResponse.json(buildSafeErrorResponse(err, '导出失败'), { status: 500 });
  }
}

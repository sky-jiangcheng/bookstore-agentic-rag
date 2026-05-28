import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { buildExcelBuffer } from '@/lib/book-list/excel-export';
import { logServerError, buildSafeErrorResponse } from '@/lib/utils/safe-error';

const exportSchema = z.object({
  booklist_name: z.string().min(1).max(200).default('书单'),
  books: z
    .array(
      z.object({
        book_id: z.number().int().optional(),
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
    .min(1, '书籍列表至少需要1本书'),
  budget: z.number().nonnegative().optional().nullable().default(null),
  total_price: z.number().nonnegative().optional().nullable().default(null),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const body = exportSchema.parse(json);
    const buffer = await buildExcelBuffer(body);

    const safeName = body.booklist_name.replace(/[^\w\s\-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `${safeName}_${dateStr}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);

    return new Response(new Uint8Array(buffer), {
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

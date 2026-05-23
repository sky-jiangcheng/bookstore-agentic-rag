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
        title: z.string().min(1),
        author: z.string().optional().nullable(),
        publisher: z.string().optional().nullable(),
        category: z.string().optional().nullable(),
        price: z.number().nonnegative().optional().nullable(),
        stock: z.number().int().nonnegative().optional().nullable(),
        score: z.number().min(0).max(100).optional().nullable(),
        source: z.string().optional().nullable(),
        remark: z.string().optional().nullable(),
      }),
    )
    .min(1, '书籍列表至少需要1本书'),
  budget: z.number().nonnegative().optional().nullable(),
  total_price: z.number().nonnegative().optional().nullable(),
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
      return NextResponse.json({ error: 'Invalid request', details: err.flatten() }, { status: 400 });
    }
    logServerError('[book-list/export-excel]', err);
    return NextResponse.json(buildSafeErrorResponse(err, '导出失败'), { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { BookListHttpError, parseBookListRequirements } from '@/lib/book-list/service';
import { validateConfig } from '@/lib/config/environment';
import { buildSafeErrorResponse, logServerError } from '@/lib/utils/safe-error';

const parseSchema = z.object({
  user_input: z.string().min(5).max(1000),
  use_history: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    validateConfig();
    const json = await req.json();
    const body = parseSchema.parse(json);
    const data = await parseBookListRequirements(body);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: err.flatten() }, { status: 400 });
    }
    if (err instanceof BookListHttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    logServerError('[book-list/parse]', err);
    return NextResponse.json(
      buildSafeErrorResponse(err, '解析请求失败'),
      { status: 500 },
    );
  }
}

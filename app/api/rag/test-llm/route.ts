import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { z } from 'zod';
import { createModel } from '@/lib/ai/model-factory';
import { logServerError } from '@/lib/utils/safe-error';

const providerSchema = z.object({
  type: z.enum(['google', 'openai-compatible']),
  apiKey: z.string(),
  model: z.string(),
  baseUrl: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = providerSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid provider config', details: parsed.error.flatten() }, { status: 400 });
    }

    const config = parsed.data;

    const model = createModel({
      type: config.type,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
    });

    const start = Date.now();
    const { text, usage } = await generateText({
      model,
      prompt: 'Hi',
      maxOutputTokens: 2,
    });
    const latency = Date.now() - start;

    return NextResponse.json({
      ok: true,
      latency,
      response: text.slice(0, 50),
      usage,
    });
  } catch (error) {
    logServerError('[TestLLM]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      ok: false,
      error: message,
    });
  }
}

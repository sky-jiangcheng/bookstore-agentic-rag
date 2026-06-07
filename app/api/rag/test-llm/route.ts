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

    if (config.type === 'openai-compatible' && config.baseUrl) {
      const chatUrl = config.baseUrl.replace(/\/+$/, '') + '/chat/completions';
      const diagnosticRes = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 2,
        }),
      });
      if (!diagnosticRes.ok) {
        const body = await diagnosticRes.text().catch(() => '');
        return NextResponse.json({
          ok: false,
          error: `诊断请求失败 (HTTP ${diagnosticRes.status})
URL: ${chatUrl}
响应: ${body.slice(0, 500)}`,
        });
      }
      const data = await diagnosticRes.json().catch(() => null);
      return NextResponse.json({
        ok: true,
        latency: 0,
        response: data?.choices?.[0]?.message?.content?.slice(0, 50) ?? '',
      });
    }

    const model = createModel({
      type: config.type,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
    });

    const start = Date.now();
    const { text } = await generateText({
      model,
      prompt: 'Hi',
      maxOutputTokens: 2,
    });
    const latency = Date.now() - start;

    return NextResponse.json({
      ok: true,
      latency,
      response: text.slice(0, 50),
    });
  } catch (error: unknown) {
    logServerError('[TestLLM]', error);
    let detail = error instanceof Error ? error.message : 'Unknown error';
    if (error != null && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof err.statusCode === 'number') parts.push(`HTTP ${err.statusCode}`);
      if (typeof err.url === 'string') parts.push(`URL: ${err.url}`);
      if (typeof err.responseBody === 'string') parts.push(`响应: ${err.responseBody.slice(0, 300)}`);
      if (parts.length > 0) detail = `${detail}\n${parts.join('\n')}`;
    }
    return NextResponse.json({
      ok: false,
      error: detail,
    });
  }
}

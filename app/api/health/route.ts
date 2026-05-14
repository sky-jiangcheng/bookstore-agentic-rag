import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'bookstore-agentic-rag',
    timestamp: new Date().toISOString(),
  });
}

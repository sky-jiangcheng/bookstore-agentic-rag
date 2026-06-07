import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  try {
    const result = await sql<{ keyword: string }>`
      SELECT keyword 
      FROM filter_keywords 
      WHERE is_active = TRUE 
      ORDER BY id ASC
    `;
    const keywords = result.rows.map((row) => row.keyword).filter(Boolean);
    return NextResponse.json({ keywords });
  } catch (error) {
    console.error('[exclusions api] Failed to fetch active exclusion keywords:', error);
    return NextResponse.json({ error: 'Failed to fetch exclusion keywords' }, { status: 500 });
  }
}

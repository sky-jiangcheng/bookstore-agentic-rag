import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get('category');

    let result;
    if (category && category !== 'none') {
      result = await sql<{ keyword: string }>`
        SELECT keyword 
        FROM filter_keywords 
        WHERE category = ${category} AND is_active = TRUE 
        ORDER BY id ASC
      `;
    } else {
      result = await sql<{ keyword: string }>`
        SELECT keyword 
        FROM filter_keywords 
        WHERE is_active = TRUE 
        ORDER BY id ASC
      `;
    }
    
    const keywords = result.rows.map((row) => row.keyword).filter(Boolean);
    return NextResponse.json({ keywords });
  } catch (error) {
    console.error('[exclusions api] Failed to fetch active exclusion keywords:', error);
    return NextResponse.json({ error: 'Failed to fetch exclusion keywords' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { keyword, category, action } = body;

    if (!keyword || !category || !action || !['add', 'remove'].includes(action)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    if (action === 'add') {
      await sql`
        INSERT INTO filter_keywords (keyword, category, is_active)
        VALUES (${keyword}, ${category}, TRUE)
        ON CONFLICT (keyword, category) 
        DO UPDATE SET is_active = TRUE, updated_at = NOW()
      `;
    } else {
      await sql`
        UPDATE filter_keywords
        SET is_active = FALSE, updated_at = NOW()
        WHERE keyword = ${keyword} AND category = ${category}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[exclusions api] Failed to update exclusion keyword:', error);
    return NextResponse.json({ error: 'Failed to update exclusion keyword' }, { status: 500 });
  }
}

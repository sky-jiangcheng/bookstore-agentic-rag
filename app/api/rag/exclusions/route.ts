import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { corsHeaders } from '@/lib/utils/cors';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const libraryCode = url.searchParams.get('library_code');

    let result;
    if (libraryCode && libraryCode !== 'none') {
      result = await sql<{ keyword: string }>`
        SELECT keyword 
        FROM filter_keywords 
        WHERE library_code = ${libraryCode} AND is_active = TRUE 
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
    return NextResponse.json({ keywords }, { headers: corsHeaders(req) });
  } catch (error) {
    console.error('[exclusions api] Failed to fetch active exclusion keywords:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exclusion keywords' },
      { status: 500, headers: corsHeaders(req) }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { keyword, library_code, action } = body;

    if (!keyword || !library_code || !action || !['add', 'remove'].includes(action)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    if (action === 'add') {
      await sql`
        UPDATE filter_keywords
        SET is_active = TRUE, updated_at = NOW()
        WHERE keyword = ${keyword} AND library_code = ${library_code}
      `;
      await sql`
        INSERT INTO filter_keywords (keyword, library_code, is_active)
        SELECT ${keyword}, ${library_code}, TRUE
        WHERE NOT EXISTS (
          SELECT 1 FROM filter_keywords
          WHERE keyword = ${keyword} AND library_code = ${library_code}
        )
      `;
    } else {
      await sql`
        UPDATE filter_keywords
        SET is_active = FALSE, updated_at = NOW()
        WHERE keyword = ${keyword} AND library_code = ${library_code}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[exclusions api] Failed to update exclusion keyword:', error);
    return NextResponse.json({ error: 'Failed to update exclusion keyword' }, { status: 500 });
  }
}

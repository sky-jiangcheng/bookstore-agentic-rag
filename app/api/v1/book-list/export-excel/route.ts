import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PassThrough } from 'stream';

import { nodeStreamToWeb } from '@/lib/book-list';
import { logServerError, buildSafeErrorResponse } from '@/lib/utils/safe-error';
import { hasDatabaseConfig } from '@/lib/config/environment';
import { streamBooksForExport } from '@/lib/server/catalog-repository';
import ExcelJS from 'exceljs';

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

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: 'Microsoft YaHei', bold: true, color: { argb: 'FFFFFFFF' }, size: 11,
};
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' },
};
const META_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' },
};
const META_FONT: Partial<ExcelJS.Font> = {
  name: 'Microsoft YaHei', bold: true, size: 11,
};
const NORMAL_FONT: Partial<ExcelJS.Font> = {
  name: 'Microsoft YaHei', size: 11,
};
const CENTER_ALIGN: Partial<ExcelJS.Alignment> = {
  horizontal: 'center', vertical: 'middle',
};
const COL_WIDTHS = [6, 30, 15, 20, 12, 10, 8, 10, 10, 20];

function mapDbBookToExportRow(book: any, index: number): any[] {
  const score = book.relevance_score ?? 0;
  const scoreDisplay = score <= 1 ? `${Math.round(score * 100)}%` : `${Math.round(score)}%`;
  return [
    index,
    book.title,
    book.author ?? '',
    book.publisher ?? '',
    book.category ?? '',
    book.price ?? 0,
    book.stock ?? 0,
    scoreDisplay,
    'catalog_search',
    '',
  ];
}

async function writeExcelStream(
  passThrough: PassThrough,
  booklistName: string,
  filters: (z.infer<typeof exportSchema>['filters'] & { limit?: number }) | undefined,
  staticBooks: any[] | undefined,
  budget: number | null | undefined,
  total_price: number | null | undefined,
): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: passThrough,
    useStyles: true,
    useSharedStrings: true,
  });
  const worksheet = workbook.addWorksheet(booklistName.slice(0, 31));

  for (let i = 0; i < COL_WIDTHS.length; i++) {
    worksheet.getColumn(i + 1).width = COL_WIDTHS[i];
  }

  // Meta rows
  const metaRows: [string, string][] = [
    ['书单名称', booklistName],
  ];
  if (budget != null) {
    metaRows.push(['预算', `¥${Number(budget).toFixed(2)}`]);
  }
  if (total_price != null) {
    metaRows.push(['总价格', `¥${Number(total_price).toFixed(2)}`]);
  }
  metaRows.push(['导出时间', new Date().toISOString().replace('T', ' ').slice(0, 19)]);

  for (const [label, value] of metaRows) {
    const row = worksheet.addRow([label, value]);
    const labelCell = row.getCell(1);
    labelCell.font = META_FONT;
    labelCell.fill = META_FILL;
    labelCell.border = THIN_BORDER;
    const valueCell = row.getCell(2);
    valueCell.font = NORMAL_FONT;
    valueCell.fill = META_FILL;
    valueCell.border = THIN_BORDER;
    row.commit();
  }

  worksheet.addRow([]).commit();

  // Header
  const headers = ['序号', '书名', '作者', '出版社', '分类', '价格', '库存', '相关度', '来源', '备注'];
  const headerRow = worksheet.addRow(headers);
  for (let col = 0; col < headers.length; col++) {
    const cell = headerRow.getCell(col + 1);
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = CENTER_ALIGN;
    cell.border = THIN_BORDER;
  }
  headerRow.commit();

  const centerCols = new Set([1, 6, 7, 8]);
  let rowIndex = 1;

  if (staticBooks) {
    for (const book of staticBooks) {
      const rowData = [
        rowIndex++,
        book.title,
        book.author ?? '',
        book.publisher ?? '',
        book.category ?? '',
        book.price ?? 0,
        book.stock ?? 0,
        book.score != null
          ? (book.score <= 1 ? `${Math.round(book.score * 100)}%` : `${Math.round(book.score)}%`)
          : '0%',
        book.source ?? '',
        book.remark ?? '',
      ];
      const row = worksheet.addRow(rowData);
      for (let col = 0; col < rowData.length; col++) {
        const cell = row.getCell(col + 1);
        cell.font = NORMAL_FONT;
        cell.border = THIN_BORDER;
        if (centerCols.has(col + 1)) cell.alignment = CENTER_ALIGN;
        if (col + 1 === 6) cell.numFmt = '¥#,##0.00';
      }
      row.commit();
    }
  } else if (filters && hasDatabaseConfig()) {
    for await (const batch of streamBooksForExport(filters)) {
      for (const book of batch) {
        const rowData = mapDbBookToExportRow(book, rowIndex++);
        const row = worksheet.addRow(rowData);
        for (let col = 0; col < rowData.length; col++) {
          const cell = row.getCell(col + 1);
          cell.font = NORMAL_FONT;
          cell.border = THIN_BORDER;
          if (centerCols.has(col + 1)) cell.alignment = CENTER_ALIGN;
          if (col + 1 === 6) cell.numFmt = '¥#,##0.00';
        }
        row.commit();
      }
    }
  }

  // Update book count in meta
  worksheet.getCell('A2').value = String(rowIndex - 1);

  worksheet.commit();
  await workbook.commit();
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const body = exportSchema.parse(json);

    if (!body.books && !body.filters) {
      return NextResponse.json({ error: 'Must provide either books or filters' }, { status: 400 });
    }

    const passThrough = new PassThrough();
    const safeName = body.booklist_name.replace(/[^\w\s\-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `${safeName}_${dateStr}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);

    const exportFilters = body.filters ? { ...body.filters, limit: body.filters.limit ?? 10000 } : undefined;
    writeExcelStream(
      passThrough,
      body.booklist_name,
      exportFilters,
      body.books,
      body.budget,
      body.total_price,
    ).catch((err) => {
      passThrough.destroy(err);
    });

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

export const maxDuration = 60;

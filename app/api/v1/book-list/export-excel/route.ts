import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logServerError, buildSafeErrorResponse } from '@/lib/utils/safe-error';
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
const COL_WIDTHS = [6, 18, 30, 15, 20, 12, 10, 8, 10, 10, 20];

function isAbnormalId(id: string): boolean {
  return !/^97[89]\d{10}$/.test(id) && !/^\d{10}$/.test(id);
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const body = exportSchema.parse(json);

    if (!body.books) {
      return NextResponse.json({ error: 'Must provide books array' }, { status: 400 });
    }

    const safeName = body.booklist_name.replace(/[^\w\u4e00-\u9fa5\s\-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `${safeName}_${dateStr}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BookStore RAG';
    workbook.created = new Date();
    const sheetName = body.booklist_name.replace(/[\\\/?*\[\]:]/g, '_').slice(0, 31) || '书单';
    const worksheet = workbook.addWorksheet(sheetName);

    for (let i = 0; i < COL_WIDTHS.length; i++) {
      worksheet.getColumn(i + 1).width = COL_WIDTHS[i];
    }

    const metaRows: [string, string][] = [
      ['书单名称', body.booklist_name],
      ['总数', ''],
    ];
    if (body.budget != null) {
      metaRows.push(['预算', `¥${Number(body.budget).toFixed(2)}`]);
    }
    if (body.total_price != null) {
      metaRows.push(['总价格', `¥${Number(body.total_price).toFixed(2)}`]);
    }
    metaRows.push(['导出时间', new Date().toISOString().replace('T', ' ').slice(0, 19)]);

    for (const [label, value] of metaRows) {
      const row = worksheet.addRow([label, value]);
      row.getCell(1).font = META_FONT;
      row.getCell(1).fill = META_FILL;
      row.getCell(1).border = THIN_BORDER;
      row.getCell(2).font = NORMAL_FONT;
      row.getCell(2).fill = META_FILL;
      row.getCell(2).border = THIN_BORDER;
    }

    worksheet.addRow([]);

    const headers = ['序号', '书号', '书名', '作者', '出版社', '分类', '价格', '库存', '相关度', '来源', '备注'];
    const headerRow = worksheet.addRow(headers);
    for (let col = 0; col < headers.length; col++) {
      const cell = headerRow.getCell(col + 1);
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = THIN_BORDER;
    }

    const centerCols = new Set([1, 7, 8, 9]);
    let rowIndex = 1;

    for (const book of body.books) {
      const bookId = String(book.book_id ?? '');
      const rowData = [
        rowIndex++,
        isAbnormalId(bookId) ? `${bookId} ⚠` : bookId,
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
        if (col + 1 === 7) cell.numFmt = '¥#,##0.00';
      }
    }

    worksheet.getCell('A2').value = String(rowIndex - 1);

    const buf = await workbook.xlsx.writeBuffer();
    const uint8 = new Uint8Array(buf);

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': String(uint8.length),
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

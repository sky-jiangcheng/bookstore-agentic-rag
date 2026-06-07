// lib/book-list/excel-stream-export.ts
import { PassThrough } from 'stream';
import ExcelJS from 'exceljs';
import type { ExportBookListRequest } from './excel-export';

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

export function buildExcelExportStream(
  req: ExportBookListRequest,
  passThrough: PassThrough,
): void {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: passThrough,
    useStyles: true,
    useSharedStrings: true,
  });

  const worksheet = workbook.addWorksheet(req.booklist_name.slice(0, 31));

  // Set column widths
  for (let i = 0; i < COL_WIDTHS.length; i++) {
    worksheet.getColumn(i + 1).width = COL_WIDTHS[i];
  }

  // Calculate total price
  const totalPrice = req.total_price ?? req.books.reduce((s, b) => s + (b.price ?? 0), 0);

  const metaRows: [string, string][] = [
    ['书单名称', req.booklist_name],
    ['书籍数量', String(req.books.length)],
    ['总价格', `¥${totalPrice.toFixed(2)}`],
  ];
  if (req.budget != null) {
    metaRows.push(['预算', `¥${req.budget.toFixed(2)}`]);
  }
  metaRows.push(['导出时间', new Date().toISOString().replace('T', ' ').slice(0, 19)]);

  // Write metadata rows
  for (let i = 0; i < metaRows.length; i++) {
    const row = worksheet.addRow([metaRows[i][0], metaRows[i][1]]);
    
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

  // Empty spacer row
  worksheet.addRow([]).commit();

  // Data table header
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

  // Data rows
  const centerCols = new Set([1, 6, 7, 8]); // 序号, 价格, 库存, 相关度
  for (let i = 0; i < req.books.length; i++) {
    const book = req.books[i];
    const score = book.score ?? 0;
    const scoreDisplay = score <= 1 ? `${Math.round(score * 100)}%` : `${Math.round(score)}%`;

    const rowData = [
      i + 1,
      book.title,
      book.author ?? '',
      book.publisher ?? '',
      book.category ?? '',
      book.price ?? 0,
      book.stock ?? 0,
      scoreDisplay,
      book.source ?? '',
      book.remark ?? '',
    ];

    const row = worksheet.addRow(rowData);
    for (let col = 0; col < rowData.length; col++) {
      const cell = row.getCell(col + 1);
      cell.font = NORMAL_FONT;
      cell.border = THIN_BORDER;
      if (centerCols.has(col + 1)) {
        cell.alignment = CENTER_ALIGN;
      }
      if (col + 1 === 6) {
        cell.numFmt = '¥#,##0.00';
      }
    }
    row.commit();
  }

  worksheet.commit();
  workbook.commit().catch((err) => {
    passThrough.emit('error', err);
  });
}

export function nodeStreamToWeb(nodeStream: PassThrough): ReadableStream {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) => {
        controller.enqueue(chunk);
      });
      nodeStream.on('end', () => {
        controller.close();
      });
      nodeStream.on('error', (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    }
  });
}

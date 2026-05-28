import ExcelJS from 'exceljs';

export interface ExportBookItem {
  book_id?: number;
  title: string;
  author?: string | null;
  publisher?: string | null;
  category?: string | null;
  price?: number | null;
  stock?: number | null;
  score?: number | null;
  source?: string | null;
  remark?: string | null;
}

export interface ExportBookListRequest {
  booklist_name: string;
  books: ExportBookItem[];
  budget?: number | null;
  total_price?: number | null;
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: 'Microsoft YaHei', bold: true, color: { argb: 'FFFFFFFF' }, size: 11,
};
const HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' },
};
const META_FILL: ExcelJS.FillPattern = {
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

export async function buildExcelBuffer(req: ExportBookListRequest): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(req.booklist_name.slice(0, 31));

  // Metadata rows
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

  for (let i = 0; i < metaRows.length; i++) {
    const row = ws.getRow(i + 1);
    const labelCell = row.getCell(1);
    const valueCell = row.getCell(2);

    labelCell.value = metaRows[i][0];
    labelCell.font = META_FONT;
    labelCell.fill = META_FILL;
    labelCell.border = THIN_BORDER;

    valueCell.value = metaRows[i][1];
    valueCell.font = NORMAL_FONT;
    valueCell.fill = META_FILL;
    valueCell.border = THIN_BORDER;
  }

  // Data table header
  const dataStartRow = metaRows.length + 2;
  const headers = ['序号', '书名', '作者', '出版社', '分类', '价格', '库存', '相关度', '来源', '备注'];
  const headerRow = ws.getRow(dataStartRow);
  for (let col = 0; col < headers.length; col++) {
    const cell = headerRow.getCell(col + 1);
    cell.value = headers[col];
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = CENTER_ALIGN;
    cell.border = THIN_BORDER;
  }

  // Data rows
  const centerCols = new Set([1, 6, 7, 8]); // 序号, 价格, 库存, 相关度
  for (let i = 0; i < req.books.length; i++) {
    const book = req.books[i];
    const row = ws.getRow(dataStartRow + 1 + i);
    const score = book.score ?? 0;
    const scoreDisplay = score <= 1 ? `${Math.round(score * 100)}%` : `${Math.round(score)}%`;

    const values: (string | number)[] = [
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

    for (let col = 0; col < values.length; col++) {
      const cell = row.getCell(col + 1);
      cell.value = values[col];
      cell.font = NORMAL_FONT;
      cell.border = THIN_BORDER;
      if (centerCols.has(col + 1)) {
        cell.alignment = CENTER_ALIGN;
      }
      if (col + 1 === 6) {
        cell.numFmt = '¥#,##0.00';
      }
    }
  }

  // Column widths
  for (let i = 0; i < COL_WIDTHS.length; i++) {
    ws.getColumn(i + 1).width = COL_WIDTHS[i];
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

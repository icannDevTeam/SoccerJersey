import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
const TZ = 'Asia/Jakarta';
const BURGUNDY = 'FF730B2B';
const BURGUNDY_DARK = 'FF52091F';
const GOLD = 'FFE5BC43';
const GOLD_SOFT = 'FFFBF4DC';
const STRIPE = 'FFFAF6F7';
const GRAY = 'FF6B7280';
const BORDER = 'FFE5E7EB';

const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: BORDER } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

const fmt = (iso, opts) => iso ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).format(new Date(iso)) : '';
const dateTime = iso => fmt(iso, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Stops spreadsheet apps from treating student-entered text as a formula.
const safe = value => {
  const text = String(value ?? '');
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
};

function banner(sheet, lastCol, title, subtitle, logoId) {
  sheet.mergeCells(1, 1, 1, lastCol);
  sheet.mergeCells(2, 1, 2, lastCol);
  sheet.mergeCells(3, 1, 3, lastCol);
  const top = sheet.getCell(1, 1);
  top.value = 'BINUS SCHOOL SIMPRUG';
  top.font = { name: 'Calibri', size: 10, bold: true, color: { argb: GOLD } };
  const main = sheet.getCell(2, 1);
  main.value = title;
  main.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  const sub = sheet.getCell(3, 1);
  sub.value = subtitle;
  sub.font = { name: 'Calibri', size: 10, color: { argb: 'FFF3E3E8' } };
  for (let row = 1; row <= 3; row++) {
    for (let col = 1; col <= lastCol; col++) sheet.getCell(row, col).fill = fill(BURGUNDY);
    sheet.getCell(row, 1).alignment = { vertical: 'middle', indent: 1 };
  }
  for (let col = 1; col <= lastCol; col++) sheet.getCell(4, col).fill = fill(GOLD);
  sheet.getRow(1).height = 20;
  sheet.getRow(2).height = 30;
  sheet.getRow(3).height = 20;
  sheet.getRow(4).height = 5;
  if (logoId !== undefined) {
    // Logo sits at the right edge of the banner so it never covers the title.
    const lastWidthPx = (sheet.getColumn(lastCol).width ?? 9) * 7.5;
    const offset = Math.max(0, 1 - 66 / lastWidthPx);
    sheet.addImage(logoId, { tl: { col: lastCol - 1 + offset, row: 0.25 }, ext: { width: 58, height: 58 }, editAs: 'absolute' });
  }
}

function headerRow(row) {
  row.height = 22;
  row.eachCell(cell => {
    cell.fill = fill(BURGUNDY);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cell.border = { ...box, bottom: { style: 'medium', color: { argb: GOLD } } };
  });
}

function bodyRow(row, index) {
  row.height = 20;
  row.eachCell({ includeEmpty: true }, cell => {
    if (index % 2) cell.fill = fill(STRIPE);
    cell.border = box;
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, ...cell.alignment };
  });
}

function sectionTitle(sheet, rowNumber, text, lastCol) {
  sheet.mergeCells(rowNumber, 1, rowNumber, lastCol);
  const cell = sheet.getCell(rowNumber, 1);
  cell.value = text.toUpperCase();
  cell.font = { bold: true, size: 11, color: { argb: BURGUNDY } };
  cell.border = { bottom: { style: 'medium', color: { argb: GOLD } } };
  sheet.getRow(rowNumber).height = 22;
}

export async function buildExcelReport(submissions, admin) {
  const now = new Date();
  const generated = `${fmt(now.toISOString(), { dateStyle: 'long', timeStyle: 'short' })} WIB`;
  const rows = [...submissions].sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  const isTest = item => item.jerseyNumber === 0;
  const real = rows.filter(item => !isTest(item));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = admin?.name ?? 'Jersey Admin';
  workbook.created = now;
  workbook.title = 'Junior Soccer Jersey Registration Report';

  let logoId;
  try {
    const buffer = await readFile(fileURLToPath(new URL('./images/logo.jpe', import.meta.url)));
    logoId = workbook.addImage({ buffer, extension: 'jpeg' });
  } catch {}

  const subtitle = `Generated ${generated}  ·  Prepared by ${admin?.name ?? ''}${admin?.position ? `, ${admin.position}` : ''}`;

  // ── Summary sheet ──
  const summary = workbook.addWorksheet('Summary', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: '&8BINUS School Simprug · Junior Soccer Jersey Report&R&8Page &P of &N' },
  });
  summary.columns = [{ width: 24 }, { width: 16 }, { width: 16 }, { width: 4 }, { width: 22 }, { width: 14 }];
  banner(summary, 6, 'Junior Soccer Jersey Registration Report', subtitle, logoId);

  const stats = [
    ['Students registered', real.length],
    ['Numbers available', 99 - real.length],
    ['Test records (#0)', rows.length - real.length],
  ];
  sectionTitle(summary, 6, 'Overview', 6);
  stats.forEach(([label, value], i) => {
    const row = summary.getRow(7 + i);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    row.getCell(1).font = { color: { argb: GRAY } };
    row.getCell(2).font = { bold: true, size: 14, color: { argb: BURGUNDY } };
    row.getCell(1).border = { left: { style: 'thick', color: { argb: i % 2 ? GOLD : BURGUNDY } }, bottom: thin };
    row.getCell(2).border = { bottom: thin };
    row.getCell(1).alignment = { vertical: 'middle', indent: 1 };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    row.height = 24;
  });

  sectionTitle(summary, 11, 'Order summary by size', 3);
  const sizeHead = summary.getRow(12);
  sizeHead.values = ['Size', 'Tops', 'Pants'];
  headerRow(sizeHead);
  SIZES.forEach((size, i) => {
    const row = summary.getRow(13 + i);
    row.values = [size, rows.filter(r => r.jerseySize === size).length, rows.filter(r => r.pantsSize === size).length];
    bodyRow(row, i);
    row.getCell(1).font = { bold: true };
  });
  const totalRow = summary.getRow(13 + SIZES.length);
  const first = 13, last = 12 + SIZES.length;
  totalRow.values = ['Total', { formula: `SUM(B${first}:B${last})` }, { formula: `SUM(C${first}:C${last})` }];
  totalRow.eachCell(cell => {
    cell.fill = fill(GOLD_SOFT);
    cell.font = { bold: true };
    cell.border = { ...box, top: { style: 'medium', color: { argb: GOLD } } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  });
  totalRow.height = 22;
  const offList = rows.filter(r => !SIZES.includes(r.jerseySize) || !SIZES.includes(r.pantsSize)).length;
  if (offList) {
    const note = summary.getCell(totalRow.number + 1, 1);
    note.value = `${offList} record(s) use a size outside S–3XL and are not counted above.`;
    note.font = { italic: true, size: 9, color: { argb: 'FFB42318' } };
  }

  summary.getCell(11, 5).value = 'STUDENTS BY CLASS';
  summary.mergeCells(11, 5, 11, 6);
  summary.getCell(11, 5).font = { bold: true, size: 11, color: { argb: BURGUNDY } };
  summary.getCell(11, 5).border = { bottom: { style: 'medium', color: { argb: GOLD } } };
  const classHead = summary.getRow(12);
  classHead.getCell(5).value = 'Class';
  classHead.getCell(6).value = 'Students';
  [5, 6].forEach(col => {
    const cell = classHead.getCell(col);
    cell.fill = fill(BURGUNDY);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', indent: 1 };
    cell.border = { ...box, bottom: { style: 'medium', color: { argb: GOLD } } };
  });
  [['Class 4', '4'], ['Class 5', '5'], ['Class 6', '6'], ['Not provided', '']].forEach(([label, value], i) => {
    const row = summary.getRow(13 + i);
    row.getCell(5).value = label;
    row.getCell(6).value = rows.filter(r => (r.class ?? '') === value).length;
    [5, 6].forEach(col => {
      const cell = row.getCell(col);
      if (i % 2) cell.fill = fill(STRIPE);
      cell.border = box;
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    });
  });

  const signRow = totalRow.number + 4;
  summary.getCell(signRow, 1).value = 'Checked by';
  summary.getCell(signRow, 5).value = 'Approved by';
  [1, 2, 3, 5, 6].forEach(col => { summary.getCell(signRow, col).border = { top: { style: 'thin', color: { argb: 'FF9CA3AF' } } }; });
  [1, 5].forEach(col => { summary.getCell(signRow, col).font = { size: 9, color: { argb: GRAY } }; });

  // ── Registrations sheet ──
  const detail = workbook.addWorksheet('Registrations', {
    views: [{ state: 'frozen', ySplit: 6, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '6:6', margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: '&8BINUS School Simprug · Junior Soccer Jersey Report&R&8Page &P of &N' },
  });
  const columns = [
    ['#', 6], ['Jersey No.', 11], ['Student name', 32], ['Printed name', 18], ['Class', 10],
    ['Top', 8], ['Pants', 8], ['Submitted (WIB)', 21], ['Last edited (WIB)', 21], ['Edited by', 24], ['Note', 12],
  ];
  detail.columns = columns.map(([, width]) => ({ width }));
  banner(detail, columns.length, 'Registration Details', subtitle, logoId);
  const head = detail.getRow(6);
  head.values = columns.map(([label]) => label);
  headerRow(head);

  rows.forEach((item, i) => {
    const row = detail.getRow(7 + i);
    row.values = [
      i + 1, item.jerseyNumber, safe(item.studentName), safe(item.nickname), item.class ? `Class ${item.class}` : '—',
      safe(item.jerseySize), safe(item.pantsSize), dateTime(item.createdAt), dateTime(item.updatedAt),
      safe(item.updatedBy ?? ''), isTest(item) ? 'Test record' : '',
    ];
    bodyRow(row, i);
    row.getCell(1).font = { color: { argb: GRAY } };
    const num = row.getCell(2);
    num.fill = fill(BURGUNDY);
    num.font = { bold: true, color: { argb: 'FFF4D773' } };
    num.alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(3).font = { bold: true };
    row.getCell(4).font = { name: 'Consolas', bold: true };
    [6, 7].forEach(col => {
      const cell = row.getCell(col);
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      if (!SIZES.includes(cell.value)) cell.font = { bold: true, color: { argb: 'FFB42318' } };
    });
    if (isTest(item)) row.getCell(11).font = { bold: true, color: { argb: 'FF8A6A10' } };
  });
  if (!rows.length) {
    detail.mergeCells(7, 1, 7, columns.length);
    detail.getCell(7, 1).value = 'No submissions yet.';
    detail.getCell(7, 1).alignment = { horizontal: 'center' };
    detail.getCell(7, 1).font = { italic: true, color: { argb: GRAY } };
  } else {
    detail.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + rows.length, column: columns.length } };
  }

  // ── Numbers sheet: 1–99 grid ──
  const grid = workbook.addWorksheet('Number Board', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  grid.columns = Array.from({ length: 10 }, () => ({ width: 14 }));
  banner(grid, 10, 'Jersey Number Board', `${real.length} of 99 numbers taken  ·  Burgundy = taken, white = available`, logoId);
  const byNumber = new Map(rows.map(item => [item.jerseyNumber, item]));
  for (let n = 1; n <= 99; n++) {
    const rowNumber = 6 + Math.floor((n - 1) / 10) * 2;
    const col = ((n - 1) % 10) + 1;
    const item = byNumber.get(n);
    const numCell = grid.getCell(rowNumber, col);
    const nameCell = grid.getCell(rowNumber + 1, col);
    numCell.value = n;
    nameCell.value = item ? safe(item.nickname) : 'Available';
    numCell.alignment = nameCell.alignment = { horizontal: 'center', vertical: 'middle' };
    numCell.font = { bold: true, size: 14, color: { argb: item ? 'FFF4D773' : 'FF9CA3AF' } };
    nameCell.font = { size: 8, bold: !!item, color: { argb: item ? 'FFFFFFFF' : 'FFB0B5BD' } };
    numCell.fill = nameCell.fill = fill(item ? BURGUNDY : 'FFFFFFFF');
    numCell.border = { top: thin, left: thin, right: thin };
    nameCell.border = { bottom: thin, left: thin, right: thin };
    grid.getRow(rowNumber).height = 24;
    grid.getRow(rowNumber + 1).height = 15;
  }

  workbook.eachSheet(sheet => sheet.eachRow({ includeEmpty: true }, row => row.eachCell({ includeEmpty: true }, cell => {
    cell.font = { name: 'Calibri', size: 10, ...cell.font };
  })));

  return workbook.xlsx.writeBuffer();
}

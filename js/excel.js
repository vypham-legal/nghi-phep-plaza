// Đọc / ghi file Excel ngay trên trình duyệt (file không gửi đi đâu ngoài Supabase của app).
// Thư viện ExcelJS chỉ được tải khi HR bấm nút Excel lần đầu.
import { h, parseNum } from './ui.js';

const EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
let loading = null;

export function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = EXCELJS_URL;
      s.onload = () => resolve(window.ExcelJS);
      s.onerror = () => { loading = null; reject(new Error('Không tải được thư viện Excel. Kiểm tra mạng rồi thử lại.')); };
      document.head.append(s);
    });
  }
  return loading;
}

// ---------- Màu theo giao diện ----------
const C = {
  head: 'FF7A3D4F',      // mận
  headText: 'FFFFFFFF',
  ref: 'FFF3ECEE',       // cột tham khảo (không nhập)
  refText: 'FF866A72',
  border: 'FFE3C2CA',
  title: 'FF7A3D4F',
  gold: 'FFB07A45',
};
const thin = { style: 'thin', color: { argb: C.border } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

/**
 * Tạo sheet dữ liệu có định dạng.
 * columns: [{ header, key, width, ref?: true (cột tham khảo), list?: [...] (danh sách chọn),
 *             decimal?: true (số ≥ 0), numFmt?, note? }]
 * rows: mảng object theo key; giá trị có thể là { formula, result }.
 */
export function addDataSheet(wb, name, columns, rows, { validationRows = 300 } = {}) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 14 }));

  const head = ws.getRow(1);
  head.height = 42;
  head.eachCell((cell, i) => {
    const col = columns[i - 1];
    cell.font = { bold: true, color: { argb: col.ref ? C.refText : C.headText }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.ref ? C.ref : C.head } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDER;
    if (col.note) cell.note = col.note;
  });

  for (const r of rows) ws.addRow(r);

  const last = Math.max(rows.length + 1, validationRows);
  columns.forEach((col, i) => {
    const letter = ws.getColumn(i + 1).letter;
    for (let n = 2; n <= last; n++) {
      const cell = ws.getCell(`${letter}${n}`);
      if (n <= rows.length + 1) {
        cell.border = BORDER;
        cell.alignment = { vertical: 'middle', horizontal: col.decimal || col.numFmt ? 'right' : 'left' };
        if (col.ref) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ref } };
          cell.font = { color: { argb: C.refText } };
        }
      }
      if (col.numFmt) cell.numFmt = col.numFmt;
      if (col.list) {
        cell.dataValidation = {
          type: 'list', allowBlank: true, formulae: [`"${col.list.join(',')}"`],
          showErrorMessage: true, errorTitle: 'Giá trị không hợp lệ', error: `Chọn một trong: ${col.list.join(', ')}`,
        };
      } else if (col.decimal) {
        cell.dataValidation = {
          type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 999],
          showErrorMessage: true, errorTitle: 'Số không hợp lệ', error: 'Nhập số ≥ 0, theo bước 0,5 (vd 12 hoặc 12,5).',
        };
      } else if (col.integer) {
        cell.dataValidation = {
          type: 'whole', operator: 'between', allowBlank: true, formulae: [2000, 2100],
          showErrorMessage: true, errorTitle: 'Năm không hợp lệ', error: 'Nhập năm, vd 2026.',
        };
      }
    }
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

/** Sheet hướng dẫn: lines = [chuỗi | { text, bold, color }] */
export function addGuideSheet(wb, title, lines) {
  const ws = wb.addWorksheet('Hướng dẫn');
  ws.getColumn(1).width = 110;
  const t = ws.addRow([title]);
  t.font = { bold: true, size: 14, color: { argb: C.title } };
  t.height = 24;
  ws.addRow([]);
  for (const l of lines) {
    const row = ws.addRow([typeof l === 'string' ? l : l.text]);
    row.alignment = { wrapText: true, vertical: 'top' };
    if (typeof l === 'object') row.font = { bold: !!l.bold, color: l.color ? { argb: l.color } : undefined };
  }
  return ws;
}

export async function downloadWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function newWorkbook(ExcelJS) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Đăng ký nghỉ phép';
  wb.created = new Date();
  return wb;
}

export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

// ---------- Đọc file ----------
const JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
let zipLoading = null;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!zipLoading) {
    zipLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSZIP_URL;
      s.onload = () => resolve(window.JSZip);
      s.onerror = () => { zipLoading = null; reject(new Error('Không tải được thư viện đọc file.')); };
      document.head.append(s);
    });
  }
  return zipLoading;
}

/** Bỏ các "Bảng" Excel (xl/tables/*) khỏi file .xlsx, giữ nguyên dữ liệu ô. */
async function stripTables(buffer) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files);
  for (const f of names.filter((n) => n.startsWith('xl/tables/'))) zip.remove(f);
  for (const f of names.filter((n) => /^xl\/worksheets\/_rels\/[^/]+\.rels$/.test(n))) {
    const x = await zip.file(f).async('string');
    zip.file(f, x.replace(/<Relationship[^>]*relationships\/table"[^>]*\/>/g, ''));
  }
  for (const f of names.filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n))) {
    const x = await zip.file(f).async('string');
    zip.file(f, x.replace(/<tableParts[\s\S]*?<\/tableParts>|<tableParts[^>]*\/>/g, ''));
  }
  const ct = await zip.file('[Content_Types].xml').async('string');
  zip.file('[Content_Types].xml', ct.replace(/<Override[^>]*\/xl\/tables\/[^>]*\/>/g, ''));
  return zip.generateAsync({ type: 'arraybuffer' });
}

export const normHeader = (s) => String(s ?? '').normalize('NFC').toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();

/** Giá trị ô → chuỗi (xử lý chữ định dạng, link email, công thức). */
export function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
    if ('text' in v) return cellText(v.text);
    if ('result' in v) return cellText(v.result);
    if ('error' in v) return '';
    return '';
  }
  return String(v).trim();
}

/** Giá trị ô → số; '' → null; sai → NaN */
export function cellNum(v) {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof v.result === 'number') return v.result;
  return parseNum(cellText(v));
}

/**
 * Đọc file .xlsx, tìm sheet có tiêu đề cột phù hợp.
 * matchers: { key: (header) => boolean }, required: [key...], prefer: tên sheet ưu tiên
 * Trả về { sheetName, found: Set(keys), rows: [{ rowNumber, values: { key: rawValue } }] }
 */
export async function readSheet(file, { matchers, required, prefer = [] }) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Chỉ nhận file Excel .xlsx. Nếu là file .xls cũ, mở bằng Excel rồi "Lưu thành" .xlsx.');
  if (file.size > 10 * 1024 * 1024) throw new Error('File quá lớn (tối đa 10 MB).');
  const ExcelJS = await loadExcelJS();
  const raw = await file.arrayBuffer();
  let wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(raw);
  } catch {
    // ExcelJS lỗi với file có "Bảng" (Format as Table). Gỡ phần định nghĩa bảng (dữ liệu ô giữ nguyên) rồi đọc lại.
    try {
      wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await stripTables(raw));
    } catch {
      throw new Error('Không đọc được file. Hãy chắc chắn đây là file Excel .xlsx và không bị đặt mật khẩu.');
    }
  }

  const sheets = [...wb.worksheets].filter((ws) => ws.state !== 'hidden' && ws.state !== 'veryHidden');
  sheets.sort((a, b) => {
    const pa = prefer.includes(a.name) ? 0 : 1;
    const pb = prefer.includes(b.name) ? 0 : 1;
    return pa - pb;
  });

  for (const ws of sheets) {
    const colOf = {};
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      const head = normHeader(cellText(cell.value));
      if (!head || head.includes('tham khảo')) return;
      for (const [key, test] of Object.entries(matchers)) {
        if (!(key in colOf) && test(head)) { colOf[key] = col; break; }
      }
    });
    if (!required.every((k) => k in colOf)) continue;

    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = {};
      let any = false;
      for (const [key, col] of Object.entries(colOf)) {
        const v = row.getCell(col).value;
        values[key] = v;
        if (cellText(v) !== '') any = true;
      }
      if (any) rows.push({ rowNumber, values });
    });
    return { sheetName: ws.name, found: new Set(Object.keys(colOf)), rows };
  }
  throw new Error('Không tìm thấy sheet có đủ cột cần thiết ở dòng 1. Hãy dùng file mẫu tải từ app (không đổi tên cột).');
}

/** Chọn file .xlsx bằng hộp thoại của trình duyệt */
export function pickFile() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hidden: true });
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    input.addEventListener('cancel', () => { resolve(null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

// ---------- Bảng xem trước khi nhập ----------
const STATUS = {
  new: ['Thêm mới', 'tag-ok'],
  update: ['Cập nhật', 'tag-info'],
  same: ['Không đổi', ''],
  error: ['Lỗi', 'tag-err'],
  skip: ['Bỏ qua', ''],
};

/** items: [{ rowNumber, status, label, detail }] */
export function previewTable(items) {
  const counts = { new: 0, update: 0, same: 0, error: 0, skip: 0 };
  for (const it of items) counts[it.status]++;
  const summary = h('div', { class: 'import-summary' },
    ...['new', 'update', 'same', 'error'].map((k) =>
      h('span', { class: `tag ${STATUS[k][1]}` }, `${STATUS[k][0]}: ${counts[k]}`)),
  );
  const order = { error: 0, new: 1, update: 2, same: 3, skip: 4 };
  const sorted = [...items].sort((a, b) => order[a.status] - order[b.status] || a.rowNumber - b.rowNumber);
  const table = h('div', { class: 'table-wrap import-table' }, h('table', { class: 'data' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Dòng'), h('th', {}, 'Kết quả'), h('th', {}, 'Nhân viên'), h('th', {}, 'Chi tiết'))),
    h('tbody', {}, sorted.map((it) => h('tr', { class: it.status === 'error' ? 'row-error' : (it.status === 'same' ? 'row-muted' : null) },
      h('td', { class: 'num' }, String(it.rowNumber)),
      h('td', {}, h('span', { class: `tag ${STATUS[it.status][1]}` }, STATUS[it.status][0])),
      h('td', { class: 'nowrap' }, it.label || ''),
      h('td', {}, it.detail || ''),
    ))),
  ));
  return { node: h('div', {}, summary, table), counts };
}

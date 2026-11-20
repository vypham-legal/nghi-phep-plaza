// HR — Quỹ phép: tải file mẫu, xuất Excel, nhập từ Excel (xem trước rồi mới ghi).
import { h, fmt, isHalfStep, openDialog, toast, errMsg } from '../ui.js';
import {
  loadExcelJS, newWorkbook, addDataSheet, addGuideSheet, downloadWorkbook, today,
  readSheet, cellText, cellNum, pickFile, previewTable,
} from '../excel.js';

export const FIELDS = [
  ['standard_days', '(1) NP tiêu chuẩn'],
  ['current_year_days', '(2) NP năm nay'],
  ['carried_over_days', '(3) NP năm trước chuyển sang'],
  ['seniority_days', '(4) NP tăng theo thâm niên'],
  ['bonus_days', '(5) NP được thưởng khác'],
  ['cancelled_days', '(6) NP đã hủy'],
];
const SHORT = Object.fromEntries(FIELDS.map(([k, l]) => [k, l.slice(0, 3)]));

const COLUMNS = [
  { header: 'Năm *', key: 'year', width: 8, integer: true },
  { header: 'Mã NV *', key: 'code', width: 11 },
  { header: 'Họ và tên (tham khảo)', key: 'name', width: 26, ref: true },
  ...FIELDS.map(([key, header]) => ({ header, key, width: 13, decimal: true, numFmt: '0.##' })),
  { header: '(7) Tổng NP được sử dụng (tham khảo)', key: 'total', width: 14, ref: true, numFmt: '0.##' },
  { header: '(8) NP đã sử dụng (tham khảo)', key: 'used', width: 13, ref: true, numFmt: '0.##' },
  { header: '(9) NP còn lại (tham khảo)', key: 'remain', width: 13, ref: true, numFmt: '0.##' },
];

const GUIDE = [
  { text: 'Cách dùng', bold: true },
  '1. Điền sheet "Quỹ phép": mỗi dòng là quỹ phép của một nhân viên trong một năm.',
  '2. Lưu file (.xlsx), vào app → Quỹ phép → Nhập từ Excel → chọn file → xem trước → bấm Nhập.',
  '3. App so khớp theo Năm + Mã NV: đã có → cập nhật; chưa có → tạo mới. Dòng không có trong file giữ nguyên.',
  '',
  { text: 'Quy tắc', bold: true },
  '• Mã NV phải có sẵn trong app (thêm nhân viên trước, ở màn Nhân viên hoặc file Nhân viên).',
  '• Cột (1)–(6): số ≥ 0, theo bước 0,5 (vd 12 hoặc 12,5).',
  '• (7) = (2) + (3) + (4) + (5) − (6); (9) = (7) − (8). Các cột này và cột Họ và tên màu xám chỉ để tham khảo, app bỏ qua khi nhập.',
  '• (8) "NP đã sử dụng" do app tự tính từ các đơn Phép năm đã duyệt — không nhập ở đây.',
  '',
  { text: 'Ô để trống', bold: true },
  '• Quỹ phép đã có: ô trống = giữ nguyên số hiện có. Quỹ phép mới: ô trống = 0.',
  '• Dòng để trống cả 6 cột (1)–(6) sẽ được bỏ qua.',
  '',
  { text: 'Lưu ý', bold: true },
  '• File chỉ được đọc trên máy của bạn rồi ghi vào app; không gửi đi nơi khác.',
  '• Không đổi tên cột ở dòng 1.',
];

// ---------------------------------------------------------------------
/** rows: [{ emp, saved, used }] như trên màn Quỹ phép */
export async function exportBalances(year, rows, { template = false } = {}) {
  const ExcelJS = await loadExcelJS();
  const wb = newWorkbook(ExcelJS);
  const data = rows
    .filter((r) => r.emp.is_active || r.saved)
    .map((r, i) => {
      const n = i + 2;
      const out = { year, code: r.emp.code, name: r.emp.full_name };
      for (const [k] of FIELDS) out[k] = !template && r.saved ? Number(r.saved[k]) : null;
      const total = !template && r.saved
        ? Number(r.saved.current_year_days) + Number(r.saved.carried_over_days) + Number(r.saved.seniority_days) + Number(r.saved.bonus_days) - Number(r.saved.cancelled_days)
        : 0;
      out.total = { formula: `E${n}+F${n}+G${n}+H${n}-I${n}`, result: total };
      out.used = template ? null : r.used;
      out.remain = { formula: `J${n}-K${n}`, result: total - (template ? 0 : r.used) };
      return out;
    });
  addDataSheet(wb, 'Quỹ phép', COLUMNS, data);
  addGuideSheet(wb, `Mẫu nhập quỹ phép năm ${year}`, GUIDE);
  await downloadWorkbook(wb, template ? `Mau_nhap_quy_phep_${year}.xlsx` : `Quy_phep_${year}_${today()}.xlsx`);
}

// ---------------------------------------------------------------------
const MATCHERS = {
  year: (x) => x === 'năm',
  code: (x) => x === 'mã nv' || x === 'mã nhân viên',
  standard_days: (x) => x.includes('tiêu chuẩn'),
  current_year_days: (x) => x.includes('năm nay') && !x.includes('tổng'),
  carried_over_days: (x) => x.includes('năm trước'),
  seniority_days: (x) => x.includes('thâm niên'),
  bonus_days: (x) => x.includes('thưởng'),
  cancelled_days: (x) => x.includes('đã hủy'),
};

export async function importBalances(ctx, defaultYear, onDone) {
  const file = await pickFile();
  if (!file) return;
  const { supabase } = ctx;
  let sheet;
  try {
    sheet = await readSheet(file, { matchers: MATCHERS, required: ['code', 'current_year_days'], prefer: ['Quỹ phép', 'Nhân viên'] });
  } catch (err) {
    toast(errMsg(err), 'error');
    return;
  }

  const { data: emps, error: e1 } = await supabase.from('employees').select('id, code, full_name, is_active');
  if (e1) throw e1;
  const years = new Set([defaultYear]);
  if (sheet.found.has('year')) {
    for (const r of sheet.rows) { const y = cellNum(r.values.year); if (Number.isInteger(y)) years.add(y); }
  }
  const { data: bals, error: e2 } = await supabase.from('leave_balances').select('*').in('year', [...years]);
  if (e2) throw e2;

  const items = analyze(sheet, emps, bals, defaultYear);
  showPreview(ctx, file.name, sheet, items, defaultYear, onDone);
}

function analyze(sheet, emps, bals, defaultYear) {
  const byCode = new Map(emps.map((e) => [e.code, e]));
  const balOf = new Map(bals.map((b) => [`${b.employee_id}|${b.year}`, b]));
  const seen = new Map();
  const items = [];

  for (const { rowNumber, values } of sheet.rows) {
    const errors = [];
    const code = cellText(values.code).toUpperCase();
    const emp = byCode.get(code);
    let year = defaultYear;
    if (sheet.found.has('year')) {
      const y = cellNum(values.year);
      if (y === null) year = defaultYear;
      else if (!Number.isInteger(y) || y < 2000 || y > 2100) { errors.push(`Năm "${cellText(values.year)}" không hợp lệ.`); year = null; }
      else year = y;
    }

    const input = {};
    let filled = 0;
    for (const [k, label] of FIELDS) {
      if (!sheet.found.has(k)) { input[k] = null; continue; }
      const v = cellNum(values[k]);
      if (v === null) { input[k] = null; continue; }
      filled++;
      if (!isHalfStep(v)) errors.push(`${label}: "${cellText(values[k])}" không hợp lệ (số ≥ 0, bước 0,5).`);
      input[k] = v;
    }
    if (!filled && !errors.length) continue; // dòng trống số liệu → bỏ qua

    if (!code) errors.push('Thiếu Mã NV.');
    else if (!emp) errors.push(`Mã NV "${code}" chưa có trong app — thêm nhân viên trước.`);
    const key = `${code}|${year}`;
    if (code && year && seen.has(key)) errors.push(`Trùng Năm + Mã NV với dòng ${seen.get(key)}.`);
    else if (code && year) seen.set(key, rowNumber);

    const label = `${code}${emp ? ' – ' + emp.full_name : ''} · ${year ?? '?'}`;
    if (errors.length) { items.push({ rowNumber, status: 'error', label, detail: errors.join(' ') }); continue; }

    const saved = balOf.get(`${emp.id}|${year}`);
    const final = { employee_id: emp.id, year };
    for (const [k] of FIELDS) final[k] = input[k] ?? (saved ? Number(saved[k]) : 0);

    if (!saved) {
      items.push({ rowNumber, status: 'new', label, final,
        detail: FIELDS.map(([k]) => `${SHORT[k]} ${fmt(final[k])}`).join(' · ') });
      continue;
    }
    const changes = FIELDS.filter(([k]) => final[k] !== Number(saved[k])).map(([k]) => `${SHORT[k]} ${fmt(saved[k])} → ${fmt(final[k])}`);
    items.push({ rowNumber, status: changes.length ? 'update' : 'same', label, final, detail: changes.join(' · ') });
  }
  return items;
}

function showPreview(ctx, fileName, sheet, items, defaultYear, onDone) {
  const { node, counts } = previewTable(items);
  const writable = counts.new + counts.update;
  const body = h('div', {},
    h('p', { class: 'muted' },
      `File: ${fileName} · Sheet: ${sheet.sheetName} · ${items.length} dòng có số liệu.`,
      sheet.found.has('year') ? '' : ` File không có cột Năm → áp dụng cho năm ${defaultYear}.`),
    counts.error ? h('p', { class: 'notice' }, `Có ${counts.error} dòng lỗi. Sửa các dòng này trong file rồi nhập lại; chưa có gì được ghi.`) : null,
    !counts.error && !writable ? h('p', { class: 'notice' }, 'File không có thay đổi nào so với dữ liệu hiện tại.') : null,
    node,
  );
  openDialog({
    title: 'Xem trước dữ liệu nhập — Quỹ phép',
    body,
    wide: true,
    cancelText: counts.error || !writable ? 'Đóng' : 'Hủy',
    submitText: `Nhập ${writable} dòng`,
    onSubmit: counts.error || !writable ? null : async () => {
      const payload = items.filter((i) => i.status === 'new' || i.status === 'update').map((i) => i.final);
      const { error } = await ctx.supabase.from('leave_balances').upsert(payload, { onConflict: 'employee_id,year' });
      if (error) throw error;
      toast(`Đã nhập quỹ phép cho ${payload.length} dòng.`);
      await onDone();
      return true;
    },
  });
}

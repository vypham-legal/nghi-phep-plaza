// HR: quỹ phép theo năm — nhập cột (1)–(6); (7), (8), (9) tự tính.
import { h, clear, fmt, parseNum, isHalfStep, currentYear, toast, errMsg } from '../ui.js';

const COLS = [
  ['standard_days', '(1)', 'NP tiêu chuẩn'],
  ['current_year_days', '(2)', 'NP năm nay'],
  ['carried_over_days', '(3)', 'NP năm trước chuyển sang'],
  ['seniority_days', '(4)', 'NP tăng theo thâm niên'],
  ['bonus_days', '(5)', 'NP được thưởng khác'],
  ['cancelled_days', '(6)', 'NP đã hủy'],
];
const DEFAULTS = { standard_days: 12, current_year_days: 12, carried_over_days: 0, seniority_days: 0, bonus_days: 0, cancelled_days: 0 };

export async function renderBalances(root, ctx) {
  const { supabase } = ctx;
  const thisYear = currentYear();
  let year = thisYear;
  let rows = []; // { emp, saved, used, inputs: {key: input}, tr, cells }

  const yearSel = h('select', { 'aria-label': 'Năm' },
    ...Array.from({ length: thisYear + 2 - 2025 }, (_, i) => 2025 + i)
      .map((y) => h('option', { value: String(y) }, `Năm ${y}`)));
  yearSel.value = String(year);

  const saveBtn = h('button', { type: 'button', class: 'btn', disabled: true }, 'Lưu thay đổi');
  const undoBtn = h('button', { type: 'button', class: 'btn btn-secondary', disabled: true }, 'Hủy thay đổi');
  const fillBtn = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Điền mặc định cho người chưa có quỹ');
  const summary = h('p', { class: 'muted' });
  const tableBox = h('div', { class: 'table-wrap' });

  root.append(
    h('div', { class: 'page-head' }, h('h2', { class: 'page-title' }, 'Quỹ phép năm'), yearSel),
    h('div', { class: 'toolbar' }, saveBtn, undoBtn, fillBtn),
    summary,
    tableBox,
    h('p', { class: 'hint' },
      '(7) = (2) + (3) + (4) + (5) − (6). (8) = tổng đơn Phép năm đã duyệt trong năm (tính theo "Từ ngày"). (9) = (7) − (8). ',
      'Nhập số theo bước 0,5 (vd 12 hoặc 12,5). Dòng tô vàng là dòng có thay đổi chưa lưu hoặc chưa có quỹ.'),
  );

  const dirtyRows = () => rows.filter(isDirty);
  ctx.leaveGuard = (silent) => !dirtyRows().length || (!silent && confirm('Có thay đổi quỹ phép chưa lưu. Bỏ các thay đổi này?'));

  yearSel.addEventListener('change', async () => {
    if (dirtyRows().length && !confirm('Có thay đổi chưa lưu. Bỏ các thay đổi này để chuyển năm?')) {
      yearSel.value = String(year);
      return;
    }
    year = Number(yearSel.value);
    await reload();
  });
  undoBtn.addEventListener('click', () => { if (confirm('Bỏ tất cả thay đổi chưa lưu?')) draw(); });
  fillBtn.addEventListener('click', () => {
    let n = 0;
    for (const r of rows) {
      if (r.saved || !r.emp.is_active) continue;
      for (const [k] of COLS) if (r.inputs[k].value.trim() === '') { r.inputs[k].value = fmt(DEFAULTS[k]); n++; }
      update(r);
    }
    if (!n) toast('Tất cả nhân viên đang làm việc đã có quỹ phép năm này.');
  });
  saveBtn.addEventListener('click', save);

  async function reload() {
    const [emps, bals, view] = await Promise.all([
      supabase.from('employees').select('id, code, full_name, position, is_active').order('code'),
      supabase.from('leave_balances').select('*').eq('year', year),
      supabase.from('v_leave_balance').select('employee_id, used_days').eq('year', year),
    ]);
    for (const r of [emps, bals, view]) if (r.error) throw r.error;
    const balBy = new Map(bals.data.map((b) => [b.employee_id, b]));
    const usedBy = new Map(view.data.map((v) => [v.employee_id, Number(v.used_days)]));
    rows = emps.data
      .filter((e) => e.is_active || balBy.has(e.id))
      .map((emp) => ({ emp, saved: balBy.get(emp.id) || null, used: usedBy.get(emp.id) || 0 }));
    draw();
  }

  function draw() {
    const tbody = h('tbody');
    for (const r of rows) {
      r.inputs = {};
      const cells = COLS.map(([k, num, label]) => {
        const inp = h('input', {
          type: 'text', inputmode: 'decimal', class: 'num-input',
          value: r.saved ? fmt(r.saved[k]) : '',
          placeholder: r.saved ? '' : fmt(DEFAULTS[k]),
          'aria-label': `${r.emp.code} ${num} ${label}`,
        });
        inp.addEventListener('input', () => update(r));
        r.inputs[k] = inp;
        return h('td', {}, inp);
      });
      r.totalCell = h('td', { class: 'num' });
      r.usedCell = h('td', { class: 'num' }, fmt(r.used));
      r.remainCell = h('td', { class: 'num strong' });
      r.statusTag = h('span');
      r.tr = h('tr', { class: r.emp.is_active ? null : 'row-muted' },
        h('td', { class: 'sticky-col' }, r.emp.code),
        h('td', { class: 'nowrap' }, r.emp.full_name, ' ', r.statusTag),
        ...cells, r.totalCell, r.usedCell, r.remainCell,
      );
      tbody.append(r.tr);
      update(r);
    }
    if (!rows.length) tbody.append(h('tr', {}, h('td', { colspan: '11', class: 'muted center' }, 'Chưa có nhân viên.')));

    clear(tableBox).append(h('table', { class: 'data data-balances' },
      h('thead', {}, h('tr', {},
        h('th', { class: 'sticky-col' }, 'Mã NV'), h('th', {}, 'Họ và tên'),
        ...COLS.map(([, num, label]) => h('th', { class: 'num' }, h('span', { class: 'th-num' }, num), ' ', label)),
        h('th', { class: 'num' }, h('span', { class: 'th-num' }, '(7)'), ' Tổng được dùng'),
        h('th', { class: 'num' }, h('span', { class: 'th-num' }, '(8)'), ' Đã dùng'),
        h('th', { class: 'num' }, h('span', { class: 'th-num' }, '(9)'), ' Còn lại'),
      )),
      tbody,
    ));
    refreshButtons();
  }

  /** Giá trị đang nhập của 1 dòng: {values, valid} — ô trống = 0 */
  function readRow(r) {
    const values = {};
    let valid = true;
    for (const [k] of COLS) {
      const v = parseNum(r.inputs[k].value);
      const ok = v === null || isHalfStep(v);
      r.inputs[k].classList.toggle('invalid', !ok);
      if (!ok) valid = false;
      values[k] = v === null ? 0 : v;
    }
    return { values, valid };
  }

  function isDirty(r) {
    if (!r.inputs) return false;
    if (!r.saved) return COLS.some(([k]) => r.inputs[k].value.trim() !== '');
    return COLS.some(([k]) => {
      const v = parseNum(r.inputs[k].value);
      return (v === null ? 0 : v) !== Number(r.saved[k]);
    });
  }

  function update(r) {
    const { values, valid } = readRow(r);
    const total = values.current_year_days + values.carried_over_days + values.seniority_days + values.bonus_days - values.cancelled_days;
    const remain = total - r.used;
    const empty = !r.saved && !isDirty(r);
    r.totalCell.textContent = valid && !empty ? fmt(total) : '';
    r.remainCell.textContent = valid && !empty ? fmt(remain) : '';
    r.remainCell.classList.toggle('negative', valid && !empty && remain < 0);
    const dirty = isDirty(r);
    r.tr.classList.toggle('row-attention', dirty || (!r.saved && r.emp.is_active));
    clear(r.statusTag);
    if (!r.saved && !dirty && r.emp.is_active) r.statusTag.append(h('span', { class: 'tag tag-warn' }, 'Chưa có quỹ'));
    else if (dirty) r.statusTag.append(h('span', { class: 'tag tag-warn' }, 'Chưa lưu'));
    else if (!r.emp.is_active) r.statusTag.append(h('span', { class: 'tag' }, 'Đã nghỉ'));
    refreshButtons();
  }

  function refreshButtons() {
    const n = dirtyRows().length;
    saveBtn.disabled = !n;
    undoBtn.disabled = !n;
    saveBtn.textContent = n ? `Lưu thay đổi (${n})` : 'Lưu thay đổi';
    const missing = rows.filter((r) => !r.saved && r.emp.is_active).length;
    summary.textContent = `${rows.length} nhân viên · ${missing} chưa có quỹ phép năm ${year}.`;
  }

  async function save() {
    const changed = dirtyRows();
    const payload = [];
    for (const r of changed) {
      const { values, valid } = readRow(r);
      if (!valid) {
        toast(`Dòng ${r.emp.code}: số không hợp lệ (phải ≥ 0, bước 0,5).`, 'error');
        r.tr.scrollIntoView({ block: 'center' });
        return;
      }
      payload.push({ employee_id: r.emp.id, year, ...values });
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Đang lưu…';
    const { error } = await supabase.from('leave_balances').upsert(payload, { onConflict: 'employee_id,year' });
    if (error) {
      toast(errMsg(error), 'error');
      refreshButtons();
      return;
    }
    toast(`Đã lưu quỹ phép của ${payload.length} nhân viên.`);
    await reload();
  }

  await reload();
}

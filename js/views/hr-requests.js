// HR — Tất cả đơn: lọc, xem chi tiết, duyệt thay, hủy đơn đã duyệt, nhập hộ đơn giấy.
import { h, clear, fmt, currentYear, toast, errMsg, openDialog } from '../ui.js';
import { loadLeaveTypes, loadPeople, requestDetail, askReason, statusTag, fmtRange, STATUS } from '../requests.js';
import { decisionActions, annualWarnings } from './approvals.js';
import { buildRequestForm } from './request-form.js';

const SOURCE = { app: 'App', hr_entry: 'HR nhập hộ', import: 'Số liệu cũ' };

export async function renderHrRequests(root, ctx) {
  const { supabase } = ctx;
  const typeList = await loadLeaveTypes(supabase);
  const types = new Map(typeList.map((t) => [t.id, t]));
  const thisYear = currentYear();
  let employees = [];
  let rows = [];
  let people = new Map();
  let warns = new Map();

  const yearSel = h('select', { 'aria-label': 'Năm' },
    ...[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => h('option', { value: String(y) }, `Năm ${y}`)));
  yearSel.value = String(thisYear);
  const monthSel = h('select', { 'aria-label': 'Tháng' },
    h('option', { value: '' }, 'Cả năm'),
    ...Array.from({ length: 12 }, (_, i) => h('option', { value: String(i + 1) }, `Tháng ${i + 1}`)));
  const statusSel = h('select', { 'aria-label': 'Trạng thái' },
    h('option', { value: '' }, 'Mọi trạng thái'),
    ...Object.entries(STATUS).map(([k, v]) => h('option', { value: k }, v.label)));
  const typeSel = h('select', { 'aria-label': 'Loại phép' },
    h('option', { value: '' }, 'Mọi loại phép'),
    ...typeList.map((t) => h('option', { value: String(t.id) }, t.name)));
  const search = h('input', { type: 'search', placeholder: 'Tìm mã đơn, mã NV, tên…', 'aria-label': 'Tìm' });
  const summary = h('p', { class: 'muted' });
  const tableBox = h('div', { class: 'table-wrap' });

  root.append(
    h('div', { class: 'page-head' },
      h('h2', { class: 'page-title' }, 'Tất cả đơn nghỉ phép'),
      h('button', { type: 'button', class: 'btn', onclick: () => paperDialog() }, '+ Nhập đơn giấy'),
    ),
    h('div', { class: 'toolbar' }, yearSel, monthSel, statusSel, typeSel, search),
    summary,
    tableBox,
  );
  const reload = () => load().catch((e) => toast(errMsg(e), 'error'));
  [yearSel, monthSel, statusSel, typeSel].forEach((s) => s.addEventListener('change', reload));
  search.addEventListener('input', draw);

  async function load() {
    const y = Number(yearSel.value);
    const m = Number(monthSel.value);
    const fromD = m ? `${y}-${String(m).padStart(2, '0')}-01` : `${y}-01-01`;
    const toD = m ? new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) : `${y}-12-31`;
    let q = supabase.from('leave_requests').select('*').gte('start_date', fromD).lte('start_date', toD)
      .order('start_date', { ascending: false }).order('code', { ascending: false });
    if (statusSel.value) q = q.eq('status', statusSel.value);
    if (typeSel.value) q = q.eq('leave_type_id', Number(typeSel.value));
    const [{ data, error }, ppl, { data: emps, error: e2 }] = await Promise.all([
      q, loadPeople(supabase), supabase.from('employees').select('*').order('code'),
    ]);
    if (error) throw error;
    if (e2) throw e2;
    rows = data;
    people = ppl;
    employees = emps;
    warns = await annualWarnings(supabase, rows.filter((r) => r.status === 'pending'), types);
    draw();
  }

  function draw() {
    const q = search.value.trim().toLowerCase();
    const byId = new Map(employees.map((e) => [e.id, e]));
    const shown = rows.filter((r) => {
      if (!q) return true;
      const e = byId.get(r.employee_id);
      return [r.code, e?.code, e?.full_name].some((v) => (v || '').toLowerCase().includes(q));
    });
    const total = shown.filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.days), 0);
    const pend = shown.filter((r) => r.status === 'pending').length;
    summary.textContent = `${shown.length} đơn · ${pend} chờ duyệt · tổng ${fmt(total)} ngày đã duyệt.`;

    const tbody = h('tbody');
    for (const r of shown) {
      const e = byId.get(r.employee_id);
      const w = warns.get(r.id);
      tbody.append(h('tr', { class: `clickable${w?.over ? ' row-attention' : ''}`, tabindex: '0', onclick: () => open(r),
        onkeydown: (ev) => { if (ev.key === 'Enter') open(r); } },
        h('td', { class: 'nowrap' }, r.code),
        h('td', { class: 'nowrap' }, e ? `${e.code} – ${e.full_name}` : ''),
        h('td', {}, types.get(r.leave_type_id)?.name || ''),
        h('td', { class: 'nowrap' }, fmtRange(r.start_date, r.end_date)),
        h('td', { class: 'num' }, fmt(r.days)),
        h('td', {}, statusTag(r.status), w?.over ? [' ', h('span', { class: 'tag tag-warn' }, 'Vượt phép')] : null),
        h('td', {}, SOURCE[r.source] || r.source),
        h('td', { class: 'nowrap' }, r.decided_by ? people.get(r.decided_by)?.full_name || '' : ''),
      ));
    }
    if (!shown.length) tbody.append(h('tr', {}, h('td', { colspan: '8', class: 'muted center' }, 'Không có đơn phù hợp.')));
    clear(tableBox).append(h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, ['Mã đơn', 'Nhân viên', 'Loại phép', 'Thời gian', 'Số ngày', 'Trạng thái', 'Nguồn', 'Người duyệt'].map((t) => h('th', {}, t)))),
      tbody));
  }

  function open(r) {
    const actions = [];
    if (r.status === 'pending') {
      actions.push(...decisionActions(ctx, r));
      actions.push({
        label: 'Hủy đơn', kind: 'secondary',
        run: async () => {
          const why = await askReason({ title: `Hủy đơn ${r.code}`, label: 'Lý do hủy', required: false, submitText: 'Hủy đơn' });
          if (why === null) return false;
          const { error } = await supabase.from('leave_requests').update({ status: 'cancelled', cancel_reason: why || null }).eq('id', r.id);
          if (error) throw error;
          toast(`Đã hủy đơn ${r.code}.`);
          return true;
        },
      });
    }
    if (r.status === 'approved') {
      actions.push({
        label: 'Hủy đơn đã duyệt', kind: 'danger',
        run: async () => {
          const why = await askReason({ title: `Hủy đơn đã duyệt ${r.code}`, label: 'Lý do hủy (vd nhân viên đi làm lại)', required: true, submitText: 'Hủy đơn' });
          if (why === null) return false;
          const { error } = await supabase.from('leave_requests').update({ status: 'cancelled', cancel_reason: why }).eq('id', r.id);
          if (error) throw error;
          toast(`Đã hủy đơn ${r.code}. Số phép được hoàn lại.`);
          return true;
        },
      });
    }
    const w = warns.get(r.id);
    requestDetail(ctx, r, {
      types, people, canAttach: true, actions,
      extra: w ? h('p', { class: w.over ? 'notice' : 'muted' }, w.text) : null,
      onChanged: async () => { await load(); ctx.refreshBadges?.(); },
    });
  }

  async function paperDialog() {
    const box = h('div');
    let api;
    const dlg = openDialog({
      title: 'Nhập hộ đơn giấy',
      body: box,
      wide: true,
      submitText: 'Lưu đơn',
      onSubmit: async () => api.submit(),
    });
    try {
      api = await buildRequestForm(box, ctx, {
        hr: true, employees,
        onDone: async (r) => { toast(`Đã lưu đơn ${r.code}.`); await load(); ctx.refreshBadges?.(); },
      });
    } catch (err) {
      dlg.showError(errMsg(err));
    }
  }

  await load();
}

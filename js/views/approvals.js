// Duyệt đơn: Quản lý / Giám sát trực tiếp duyệt đơn của người mình duyệt; HR duyệt thay.
import { h, clear, fmt, toast, errMsg } from '../ui.js';
import { loadLeaveTypes, loadPeople, requestCard, requestDetail, askReason } from '../requests.js';

/** Hành động Duyệt / Từ chối dùng chung (cũng dùng ở màn HR) */
export function decisionActions(ctx, r) {
  const { supabase } = ctx;
  return [
    {
      label: 'Duyệt', kind: 'primary',
      run: async () => {
        const note = await askReason({ title: `Duyệt đơn ${r.code}`, label: 'Ý kiến (không bắt buộc)', required: false, submitText: 'Duyệt' });
        if (note === null) return false;
        const { error } = await supabase.from('leave_requests').update({ status: 'approved', decision_note: note || null }).eq('id', r.id);
        if (error) throw error;
        toast(`Đã duyệt đơn ${r.code}.`);
        return true;
      },
    },
    {
      label: 'Từ chối', kind: 'danger',
      run: async () => {
        const note = await askReason({ title: `Từ chối đơn ${r.code}`, label: 'Lý do từ chối', required: true, submitText: 'Từ chối' });
        if (note === null) return false;
        const { error } = await supabase.from('leave_requests').update({ status: 'rejected', decision_note: note }).eq('id', r.id);
        if (error) throw error;
        toast(`Đã từ chối đơn ${r.code}.`);
        return true;
      },
    },
  ];
}

/** Cảnh báo vượt phép năm cho từng đơn chờ: { requestId: 'chuỗi cảnh báo' } */
export async function annualWarnings(supabase, requests, types) {
  const annual = requests.filter((r) => types.get(r.leave_type_id)?.deducts_balance);
  if (!annual.length) return new Map();
  const empIds = [...new Set(annual.map((r) => r.employee_id))];
  const years = [...new Set(annual.map((r) => Number(r.start_date.slice(0, 4))))];
  const { data, error } = await supabase.from('v_leave_balance')
    .select('employee_id, year, remaining_days, pending_days').in('employee_id', empIds).in('year', years);
  if (error) throw error;
  const bal = new Map((data || []).map((b) => [`${b.employee_id}|${b.year}`, b]));
  const out = new Map();
  for (const r of annual) {
    const y = Number(r.start_date.slice(0, 4));
    const b = bal.get(`${r.employee_id}|${y}`);
    if (!b) { out.set(r.id, { text: `Chưa có quỹ phép năm ${y}.`, over: true }); continue; }
    const remaining = Number(b.remaining_days);
    const otherPending = Number(b.pending_days) - (r.status === 'pending' ? Number(r.days) : 0);
    const avail = remaining - otherPending;
    out.set(r.id, {
      text: Number(r.days) > avail
        ? `Vượt phép: còn ${fmt(remaining)} ngày${otherPending ? `, đơn chờ khác ${fmt(otherPending)}` : ''}; đơn này ${fmt(r.days)} ngày.`
        : `Phép năm còn ${fmt(remaining)} ngày${otherPending ? ` (đơn chờ khác ${fmt(otherPending)})` : ''}.`,
      over: Number(r.days) > avail,
    });
  }
  return out;
}

export async function renderApprovals(root, ctx) {
  const { supabase, state } = ctx;
  const me = state.me;
  const types = new Map((await loadLeaveTypes(supabase)).map((t) => [t.id, t]));

  const mineBox = h('div', { class: 'req-list' });
  const hrBox = h('div', { class: 'req-list' });
  const doneBox = h('div', { class: 'req-list' });

  root.append(
    h('h2', { class: 'page-title' }, 'Duyệt đơn'),
    h('h3', { class: 'section-title' }, 'Chờ bạn duyệt'), mineBox,
    ...(state.isHr ? [h('h3', { class: 'section-title' }, 'Chờ người khác duyệt (HR có thể duyệt thay)'), hrBox] : []),
    h('h3', { class: 'section-title' }, 'Bạn đã xử lý gần đây'), doneBox,
  );

  async function load() {
    const [{ data: reports, error: e0 }, { data: pending, error: e1 }, { data: done, error: e2 }, people] = await Promise.all([
      supabase.from('employees').select('id').eq('approver_id', me.id),
      supabase.from('leave_requests').select('*').eq('status', 'pending').neq('employee_id', me.id).order('start_date'),
      supabase.from('leave_requests').select('*').eq('decided_by', me.id).order('decided_at', { ascending: false }).limit(20),
      loadPeople(supabase),
    ]);
    for (const e of [e0, e1, e2]) if (e) throw e;
    const mineIds = new Set(state.isApprover ? reports.map((x) => x.id) : []);
    const mine = pending.filter((r) => mineIds.has(r.employee_id));
    const others = pending.filter((r) => !mineIds.has(r.employee_id));
    const warns = await annualWarnings(supabase, pending, types);

    const draw = (box, rows, empty, canDecide) => {
      clear(box);
      if (!rows.length) { box.append(h('p', { class: 'muted' }, empty)); return; }
      for (const r of rows) {
        const w = warns.get(r.id);
        box.append(requestCard(r, {
          types, people, showEmployee: true,
          warn: w?.over ? w.text : null,
          onOpen: (x) => open(x, people, canDecide, w),
        }));
      }
    };
    draw(mineBox, mine, 'Không có đơn nào đang chờ bạn duyệt.', true);
    if (state.isHr) draw(hrBox, others, 'Không có đơn nào khác đang chờ duyệt.', true);
    draw(doneBox, done, 'Chưa có.', false);
  }

  function open(r, people, canDecide, w) {
    requestDetail(ctx, r, {
      types, people,
      canAttach: state.isHr,
      extra: w ? h('p', { class: w.over ? 'notice' : 'muted' }, w.text) : null,
      actions: canDecide && r.status === 'pending' ? decisionActions(ctx, r) : [],
      onChanged: async () => { await load(); ctx.refreshBadges?.(); },
    });
  }

  await load();
}


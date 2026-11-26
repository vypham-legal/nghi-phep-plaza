// Đơn của tôi: danh sách theo năm, chi tiết, hủy đơn đang chờ, thêm/bớt giấy tờ.
import { h, clear, fmt, currentYear, toast, errMsg } from '../ui.js';
import { loadLeaveTypes, loadPeople, loadBalance, requestCard, requestDetail, askReason } from '../requests.js';

export async function renderMyRequests(root, ctx) {
  const { supabase, state } = ctx;
  const me = state.me;
  const types = new Map((await loadLeaveTypes(supabase)).map((t) => [t.id, t]));
  const thisYear = currentYear();
  let year = thisYear;

  const yearSel = h('select', { 'aria-label': 'Năm' },
    ...[thisYear + 1, thisYear, thisYear - 1].map((y) => h('option', { value: String(y) }, `Năm ${y}`)));
  yearSel.value = String(year);
  const statusSel = h('select', { 'aria-label': 'Trạng thái' },
    h('option', { value: '' }, 'Tất cả trạng thái'),
    h('option', { value: 'pending' }, 'Chờ duyệt'),
    h('option', { value: 'approved' }, 'Đã duyệt'),
    h('option', { value: 'rejected' }, 'Từ chối'),
    h('option', { value: 'cancelled' }, 'Đã hủy'));
  const balBox = h('p', { class: 'muted' });
  const list = h('div', { class: 'req-list' });

  root.append(
    h('div', { class: 'page-head' },
      h('h2', { class: 'page-title' }, 'Đơn của tôi'),
      h('a', { href: '#/don/moi', class: 'btn' }, '+ Nộp đơn'),
    ),
    h('div', { class: 'toolbar' }, yearSel, statusSel),
    balBox,
    list,
  );
  const reload = () => load().catch((e) => toast(errMsg(e), 'error'));
  yearSel.addEventListener('change', () => { year = Number(yearSel.value); reload(); });
  statusSel.addEventListener('change', reload);

  async function load() {
    let q = supabase.from('leave_requests').select('*')
      .eq('employee_id', me.id)
      .gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`)
      .order('start_date', { ascending: false });
    if (statusSel.value) q = q.eq('status', statusSel.value);
    const [{ data, error }, people, bal] = await Promise.all([q, loadPeople(supabase), loadBalance(supabase, me.id, year)]);
    if (error) throw error;

    balBox.textContent = bal
      ? `Phép năm ${year}: tổng ${fmt(bal.total_days)} · đã dùng ${fmt(bal.used_days)} · còn ${fmt(bal.remaining_days)} ngày${Number(bal.pending_days) ? ` · đang chờ duyệt ${fmt(bal.pending_days)}` : ''}.`
      : `Chưa có quỹ phép năm ${year}.`;

    clear(list);
    if (!data.length) {
      list.append(h('div', { class: 'card muted-card center' },
        h('p', {}, 'Chưa có đơn nào.'),
        h('a', { href: '#/don/moi', class: 'btn' }, 'Nộp đơn nghỉ phép')));
      return;
    }
    for (const r of data) {
      list.append(requestCard(r, { types, people, onOpen: (x) => open(x, people) }));
    }
  }

  function open(r, people) {
    const pending = r.status === 'pending';
    requestDetail(ctx, r, {
      types, people,
      canAttach: pending,
      actions: pending ? [{
        label: 'Hủy đơn', kind: 'danger',
        run: async () => {
          const why = await askReason({ title: `Hủy đơn ${r.code}`, label: 'Lý do hủy (không bắt buộc)', required: false, submitText: 'Hủy đơn' });
          if (why === null) return false;
          const { error } = await supabase.from('leave_requests').update({ status: 'cancelled', cancel_reason: why || null }).eq('id', r.id);
          if (error) throw error;
          toast(`Đã hủy đơn ${r.code}.`);
          return true;
        },
      }] : [],
      onChanged: load,
    });
  }

  await load();
}

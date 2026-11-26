// Trang chủ: số phép năm còn lại, nút nộp đơn, đơn gần đây, việc cần duyệt.
import { h, fmt, currentYear } from '../ui.js';
import { loadLeaveTypes, loadPeople, requestCard, requestDetail } from '../requests.js';

export async function renderHome(root, ctx) {
  const { supabase, state } = ctx;
  const me = state.me;
  const year = currentYear();

  const [{ data: bal, error: e1 }, approverRes, { data: recent, error: e2 }, typeList, pendingRes] = await Promise.all([
    supabase.from('v_leave_balance').select('*').eq('employee_id', me.id).eq('year', year).maybeSingle(),
    me.approver_id
      ? supabase.from('employees').select('full_name, position').eq('id', me.approver_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('leave_requests').select('*').eq('employee_id', me.id).neq('source', 'import')
      .order('submitted_at', { ascending: false }).limit(3),
    loadLeaveTypes(supabase),
    state.isApprover || state.isHr
      ? supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').neq('employee_id', me.id)
      : Promise.resolve({ count: 0 }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const approver = approverRes.data;
  const types = new Map(typeList.map((t) => [t.id, t]));

  root.append(h('h2', { class: 'page-title' }, `Xin chào, ${me.full_name}`));

  if (pendingRes.count) {
    root.append(h('a', { href: '#/duyet', class: 'card attention todo-card' },
      h('strong', {}, `${pendingRes.count} đơn đang chờ duyệt`), h('span', {}, 'Mở mục Duyệt đơn →')));
  }

  if (!bal) {
    root.append(h('section', { class: 'card attention' },
      h('h3', {}, `Phép năm ${year}`),
      h('p', {}, `HR chưa nhập quỹ phép năm ${year} cho bạn. Vui lòng liên hệ HR.`),
    ));
  } else {
    const remaining = Number(bal.remaining_days);
    const pending = Number(bal.pending_days);
    const afterPending = remaining - pending;
    const warn = afterPending < 0;
    root.append(h('section', { class: `card balance-card${warn ? ' attention' : ''}` },
      h('p', { class: 'balance-label' }, `Phép năm ${year} còn lại`),
      h('p', { class: 'balance-number' }, fmt(remaining), h('span', { class: 'balance-unit' }, ' ngày')),
      h('dl', { class: 'balance-grid' },
        h('dt', {}, 'Tổng được dùng (7)'), h('dd', {}, fmt(bal.total_days)),
        h('dt', {}, 'Đã dùng (8)'), h('dd', {}, fmt(bal.used_days)),
        h('dt', {}, 'Đang chờ duyệt'), h('dd', {}, fmt(pending)),
      ),
      warn ? h('p', { class: 'notice' }, `Nếu các đơn đang chờ được duyệt, bạn sẽ vượt ${fmt(-afterPending)} ngày phép.`) : null,
    ));
  }

  root.append(h('div', { class: 'home-actions' },
    h('a', { href: '#/don/moi', class: 'btn btn-block' }, '+ Nộp đơn nghỉ phép'),
    h('a', { href: '#/don', class: 'btn btn-secondary btn-block' }, 'Xem đơn của tôi'),
  ));

  if (recent.length) {
    const people = await loadPeople(supabase);
    const list = h('div', { class: 'req-list' });
    for (const r of recent) {
      list.append(requestCard(r, { types, people, onOpen: (x) => requestDetail(ctx, x, { types, people }) }));
    }
    root.append(h('h3', { class: 'section-title' }, 'Đơn gần đây'), list);
  }

  root.append(h('section', { class: 'card' },
    h('h3', {}, 'Thông tin của bạn'),
    h('dl', { class: 'info-grid' },
      h('dt', {}, 'Mã NV'), h('dd', {}, me.code),
      h('dt', {}, 'Vị trí'), h('dd', {}, me.position || '—'),
      h('dt', {}, 'Người duyệt đơn'), h('dd', {}, approver ? approver.full_name : 'Đơn của bạn do HR xử lý'),
    ),
  ));
}

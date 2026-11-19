// Trang chủ: số phép năm còn lại của chính mình.
import { h, fmt, currentYear } from '../ui.js';

export async function renderHome(root, ctx) {
  const { supabase, state } = ctx;
  const me = state.me;
  const year = currentYear();

  const [{ data: bal, error: e1 }, approverRes] = await Promise.all([
    supabase.from('v_leave_balance').select('*').eq('employee_id', me.id).eq('year', year).maybeSingle(),
    me.approver_id
      ? supabase.from('employees').select('full_name, position').eq('id', me.approver_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (e1) throw e1;
  const approver = approverRes.data;

  root.append(h('h2', { class: 'page-title' }, `Xin chào, ${me.full_name}`));

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

  root.append(h('section', { class: 'card' },
    h('h3', {}, 'Thông tin của bạn'),
    h('dl', { class: 'info-grid' },
      h('dt', {}, 'Mã NV'), h('dd', {}, me.code),
      h('dt', {}, 'Vị trí'), h('dd', {}, me.position || '—'),
      h('dt', {}, 'Người duyệt đơn'), h('dd', {}, approver ? approver.full_name : 'Đơn của bạn do HR nhập hộ'),
    ),
  ));

  root.append(h('section', { class: 'card muted-card' },
    h('h3', {}, 'Nộp đơn nghỉ phép'),
    h('p', { class: 'muted' }, 'Chức năng nộp đơn, xem lịch sử và duyệt đơn sẽ có ở Giai đoạn 3.'),
  ));
}

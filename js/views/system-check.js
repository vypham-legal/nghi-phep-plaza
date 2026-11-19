// Trang kiểm tra hệ thống (không cần đăng nhập).
import { h } from '../ui.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';
import { supabase, configProblem } from '../supabase-client.js';

export async function renderSystemCheck(main) {
  const list = h('ul', { class: 'checks' });
  main.append(h('section', { class: 'card' },
    h('h2', {}, 'Kiểm tra hệ thống'),
    h('p', { class: 'muted' }, 'Kiểm tra cấu hình, kết nối và bảo vệ dữ liệu.'),
    list,
    h('p', { class: 'hint' }, h('a', { href: '#/' }, '← Về trang đăng nhập')),
  ));

  const addCheck = (label) => {
    const badge = h('span', { class: 'badge' }, 'Đang kiểm tra…');
    const detail = h('div', { class: 'detail' });
    const li = h('li', { class: 'check' }, badge, h('span', { class: 'label' }, label), detail);
    list.append(li);
    return (st, text = '') => {
      li.dataset.state = st;
      badge.textContent = { ok: 'Đạt', fail: 'Lỗi', warn: 'Chú ý' }[st];
      detail.textContent = text;
    };
  };

  const cfg = addCheck('Cấu hình (js/config.js)');
  if (configProblem) return cfg('fail', configProblem);
  cfg('ok', 'Đã có URL và Publishable key.');

  const conn = addCheck('Kết nối Supabase');
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    conn('ok', 'Supabase phản hồi bình thường.');
  } catch (e) {
    return conn('fail', `Không kết nối được: ${e.message}. Kiểm tra lại URL và key.`);
  }

  const guard = addCheck('Bảo vệ dữ liệu: khách chưa đăng nhập không đọc được dữ liệu');
  const { data: sess } = await supabase.auth.getSession();
  if (sess.session) {
    return guard('warn', 'Bạn đang đăng nhập nên không kiểm tra được mục này. Đăng xuất rồi mở lại trang.');
  }
  const { data, error } = await supabase.from('employees').select('id').limit(1);
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) guard('warn', 'Chưa thấy bảng dữ liệu — hãy chạy sql/01_schema.sql.');
    else guard('ok', `Bị từ chối đúng như mong đợi (${error.code || error.message}).`);
  } else if (data && data.length) {
    guard('fail', 'NGUY HIỂM: khách chưa đăng nhập đọc được bảng nhân viên. Kiểm tra lại RLS / quyền.');
  } else {
    guard('ok', 'Không trả về dữ liệu nào.');
  }
}

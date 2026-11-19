// Giai đoạn 1: trang kiểm tra hệ thống. Đăng nhập và các màn hình sẽ có từ Giai đoạn 2.
import { supabase, configProblem } from './supabase-client.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const list = document.getElementById('checks');

function addCheck(label) {
  const li = document.createElement('li');
  li.className = 'check';
  li.innerHTML = '<span class="badge">Đang kiểm tra…</span><span class="label"></span><div class="detail"></div>';
  li.querySelector('.label').textContent = label;
  list.appendChild(li);
  return (state, detail = '') => {
    const text = { ok: 'Đạt', fail: 'Lỗi', warn: 'Chú ý' }[state];
    li.dataset.state = state;
    li.querySelector('.badge').textContent = text;
    li.querySelector('.detail').textContent = detail;
  };
}

async function run() {
  const cfg = addCheck('Cấu hình (js/config.js)');
  if (configProblem) {
    cfg('fail', configProblem);
    return;
  }
  cfg('ok', 'Đã có URL và Publishable key.');

  const conn = addCheck('Kết nối Supabase');
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    conn('ok', 'Supabase phản hồi bình thường.');
  } catch (e) {
    conn('fail', `Không kết nối được: ${e.message}. Kiểm tra lại URL và key.`);
    return;
  }

  const guard = addCheck('Bảo vệ dữ liệu: khách chưa đăng nhập không đọc được dữ liệu');
  const { data, error } = await supabase.from('employees').select('id').limit(1);
  if (error) {
    const missing = ['42P01', 'PGRST205'].includes(error.code);
    if (missing) guard('warn', 'Chưa thấy bảng dữ liệu — hãy chạy sql/01_schema.sql.');
    else guard('ok', `Bị từ chối đúng như mong đợi (${error.code || error.message}).`);
  } else if (data && data.length) {
    guard('fail', 'NGUY HIỂM: khách chưa đăng nhập đọc được bảng nhân viên. Kiểm tra lại RLS / quyền.');
  } else {
    guard('ok', 'Không trả về dữ liệu nào.');
  }
}

run();

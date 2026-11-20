// HR: danh sách nhân viên, vai trò, người duyệt, tài khoản, đặt lại mật khẩu.
import { h, clear, field, openDialog, toast, errMsg } from '../ui.js';
import { passwordProblem } from './auth.js';
import { exportEmployees, importEmployees } from './hr-employees-excel.js';

const ROLE_LABEL = { employee: 'Nhân viên', hr: 'HR' };

export async function renderEmployees(root, ctx) {
  const { supabase } = ctx;
  let employees = [];
  let filter = { q: '', status: 'active' };

  async function load() {
    const { data, error } = await supabase.from('employees').select('*').order('code');
    if (error) throw error;
    employees = data;
  }

  const search = h('input', { type: 'search', placeholder: 'Tìm mã, tên, email…', 'aria-label': 'Tìm nhân viên' });
  const status = h('select', { 'aria-label': 'Lọc trạng thái' },
    h('option', { value: 'active' }, 'Đang làm việc'),
    h('option', { value: 'inactive' }, 'Đã nghỉ việc'),
    h('option', { value: 'all' }, 'Tất cả'),
  );
  const summary = h('p', { class: 'muted' });
  const tableBox = h('div', { class: 'table-wrap' });

  search.addEventListener('input', () => { filter.q = search.value.trim().toLowerCase(); draw(); });
  status.addEventListener('change', () => { filter.status = status.value; draw(); });

  const run = (fn) => async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try { await fn(); } catch (err) { toast(errMsg(err), 'error'); } finally { btn.disabled = false; }
  };

  root.append(
    h('div', { class: 'page-head' },
      h('h2', { class: 'page-title' }, 'Nhân viên'),
      h('div', { class: 'excel-actions' },
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: run(() => exportEmployees(employees, { template: true })) }, 'Tải file mẫu'),
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: run(() => importEmployees(ctx, employees, async () => { await load(); draw(); })) }, 'Nhập từ Excel'),
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: run(() => exportEmployees(employees)) }, 'Xuất Excel'),
        h('button', { type: 'button', class: 'btn', onclick: () => editDialog(null) }, '+ Thêm nhân viên'),
      ),
    ),
    h('div', { class: 'toolbar' }, search, status),
    summary,
    tableBox,
    h('p', { class: 'hint' },
      'Tài khoản đăng nhập: HR tạo trong Supabase (Authentication → Users → Add user, tích Auto Confirm User) với đúng email của nhân viên; app tự gắn. ',
      'Ô vàng là mục cần xử lý.'),
  );

  const byId = (id) => employees.find((e) => e.id === id);

  function draw() {
    const rows = employees.filter((e) => {
      if (filter.status === 'active' && !e.is_active) return false;
      if (filter.status === 'inactive' && e.is_active) return false;
      if (!filter.q) return true;
      return [e.code, e.full_name, e.email, e.position].some((v) => (v || '').toLowerCase().includes(filter.q));
    });

    const active = employees.filter((e) => e.is_active);
    const noAccount = active.filter((e) => !e.user_id).length;
    const noApprover = active.filter((e) => !e.approver_id).length;
    summary.textContent = `${active.length} nhân viên đang làm việc · ${noAccount} chưa có tài khoản · ${noApprover} chưa gán người duyệt.`;

    const tbody = h('tbody');
    for (const e of rows) {
      const approver = e.approver_id ? byId(e.approver_id) : null;
      tbody.append(h('tr', { class: e.is_active ? null : 'row-muted' },
        h('td', {}, e.code),
        h('td', {}, e.full_name),
        h('td', {}, e.position || ''),
        h('td', { class: 'nowrap' }, e.email || h('span', { class: 'tag tag-warn' }, 'Chưa có email')),
        h('td', {}, ROLE_LABEL[e.role] || e.role),
        h('td', {}, approver ? approver.full_name : (e.is_active ? h('span', { class: 'tag tag-warn' }, 'Chưa gán') : '')),
        h('td', {}, e.user_id
          ? h('span', { class: 'tag tag-ok' }, e.must_change_password ? 'Có (chờ đổi MK)' : 'Có')
          : (e.is_active ? h('span', { class: 'tag tag-warn' }, 'Chưa có') : '—')),
        h('td', {}, e.is_active ? 'Đang làm' : 'Đã nghỉ'),
        h('td', {}, h('button', { type: 'button', class: 'btn btn-small btn-secondary', onclick: () => editDialog(e) }, 'Sửa')),
      ));
    }
    if (!rows.length) {
      tbody.append(h('tr', {}, h('td', { colspan: '9', class: 'muted center' }, 'Không có nhân viên phù hợp.')));
    }

    clear(tableBox).append(h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        ['Mã NV', 'Họ và tên', 'Vị trí công việc', 'Email', 'Vai trò', 'Người duyệt', 'Tài khoản', 'Trạng thái', ''].map((t) => h('th', {}, t)))),
      tbody,
    ));
  }

  function editDialog(emp) {
    const isNew = !emp;
    const isSelf = emp && emp.id === ctx.state.me.id;
    const code = h('input', { type: 'text', required: true, value: emp?.code || '', autocapitalize: 'characters', maxlength: '20' });
    const name = h('input', { type: 'text', required: true, value: emp?.full_name || '', maxlength: '120' });
    const position = h('input', { type: 'text', value: emp?.position || '', maxlength: '120' });
    const email = h('input', { type: 'email', value: emp?.email || '', autocapitalize: 'off', spellcheck: 'false' });
    const role = h('select', {},
      h('option', { value: 'employee', selected: (emp?.role || 'employee') === 'employee' }, 'Nhân viên'),
      h('option', { value: 'hr', selected: emp?.role === 'hr' }, 'HR'),
    );
    const approver = h('select', {},
      h('option', { value: '' }, '— Không có (đơn do HR nhập hộ) —'),
      ...employees
        .filter((x) => x.is_active && x.id !== emp?.id)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'))
        .map((x) => h('option', { value: x.id, selected: x.id === emp?.approver_id }, `${x.full_name} (${x.code})`)),
    );
    role.value = emp?.role || 'employee';
    approver.value = emp?.approver_id || '';
    const active = h('input', { type: 'checkbox', checked: emp ? emp.is_active : true });

    const body = h('div', { class: 'form-grid' },
      field('Mã NV *', code),
      field('Họ và tên *', name),
      field('Vị trí công việc', position),
      field('Email đăng nhập', email, isNew ? 'Phải trùng với email tạo tài khoản trong Supabase.' : 'Lưu ý: đổi email ở đây không đổi email đăng nhập trong Supabase.'),
      field('Vai trò', role),
      field('Người duyệt đơn', approver),
      h('div', { class: 'check-row' }, active, h('label', { for: active.id = `act-${Math.random().toString(36).slice(2, 7)}` }, 'Đang làm việc')),
    );

    // Đặt lại mật khẩu (chỉ khi đã có tài khoản và không phải chính mình)
    const extra = [];
    if (emp && emp.user_id && !isSelf) {
      extra.push(h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => resetPasswordDialog(emp) }, 'Đặt lại mật khẩu…'));
    }

    openDialog({
      title: isNew ? 'Thêm nhân viên' : `Sửa nhân viên ${emp.code}`,
      body,
      extraActions: extra,
      onSubmit: async () => {
        const row = {
          code: code.value.trim().toUpperCase(),
          full_name: name.value.trim(),
          position: position.value.trim() || null,
          email: email.value.trim().toLowerCase() || null,
          role: role.value,
          approver_id: approver.value || null,
          is_active: active.checked,
        };
        if (!row.code || !row.full_name) throw new Error('Vui lòng nhập Mã NV và Họ và tên.');
        if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) throw new Error('Email không hợp lệ.');

        if (isSelf && row.role !== 'hr' && !confirm('Bạn sẽ mất quyền HR ngay sau khi lưu. Tiếp tục?')) return false;
        if (isSelf && !row.is_active && !confirm('Bạn đang đánh dấu chính mình đã nghỉ việc và sẽ không dùng được app. Tiếp tục?')) return false;
        if (emp && emp.is_active && !row.is_active) {
          const reports = employees.filter((x) => x.is_active && x.approver_id === emp.id);
          if (reports.length && !confirm(`${emp.full_name} đang là người duyệt của: ${reports.map((r) => r.full_name).join(', ')}.\nHãy gán người duyệt khác cho họ sau khi lưu. Tiếp tục?`)) return false;
        }

        const q = isNew
          ? supabase.from('employees').insert(row)
          : supabase.from('employees').update(row).eq('id', emp.id);
        const { error } = await q;
        if (error) throw error;
        toast(isNew ? 'Đã thêm nhân viên.' : 'Đã lưu thay đổi.');
        if (isSelf) { await ctx.reload(); return true; }
        await load();
        draw();
        return true;
      },
    });
  }

  function resetPasswordDialog(emp) {
    const pw = h('input', { type: 'text', autocomplete: 'off', required: true, spellcheck: 'false' });
    const gen = h('button', { type: 'button', class: 'btn btn-small btn-secondary', onclick: () => { pw.value = randomPassword(); } }, 'Tạo ngẫu nhiên');
    openDialog({
      title: `Đặt lại mật khẩu: ${emp.full_name}`,
      body: h('div', {},
        h('p', {}, `Email đăng nhập: ${emp.email}`),
        field('Mật khẩu tạm', pw, 'Ít nhất 8 ký tự, gồm chữ và số. Gửi trực tiếp cho nhân viên; nhân viên sẽ phải đổi ở lần đăng nhập tới.'),
        gen,
      ),
      submitText: 'Đặt lại',
      onSubmit: async () => {
        const problem = passwordProblem(pw.value);
        if (problem) throw new Error(problem);
        const { error } = await supabase.rpc('hr_reset_password', { p_employee: emp.id, p_password: pw.value });
        if (error) throw error;
        toast(`Đã đặt mật khẩu tạm cho ${emp.full_name}.`);
        await load();
        draw();
        return true;
      },
    });
  }

  await load();
  draw();
}

function randomPassword() {
  // Bỏ các ký tự dễ nhầm (0/O, 1/l/I)
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (s) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  let out = '';
  for (let i = 0; i < 6; i++) out += pick(letters);
  for (let i = 0; i < 4; i++) out += pick(digits);
  return out;
}


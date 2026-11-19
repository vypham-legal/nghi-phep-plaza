// Đăng nhập & đổi mật khẩu.
// Giai đoạn 1: email + mật khẩu. Sau này thêm nút "Đăng nhập bằng Microsoft" vào renderLogin
// (supabase.auth.signInWithOAuth({ provider: 'azure' })) — hồ sơ nhân viên vẫn khớp theo email.
import { h, field, errMsg, toast } from '../ui.js';

// Đường sóng trang trí (nội dung tĩnh, không chứa dữ liệu người dùng)
const WAVES_SVG = `
<svg class="auth-waves" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id="wv-a" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#c08a55" stop-opacity="0"/>
      <stop offset=".45" stop-color="#c08f5c" stop-opacity="1"/>
      <stop offset=".8" stop-color="#fff1dc" stop-opacity="1"/>
      <stop offset="1" stop-color="#e5c299" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="wv-b" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#e9a8bb" stop-opacity="0"/>
      <stop offset=".3" stop-color="#c996a4" stop-opacity="1"/>
      <stop offset=".7" stop-color="#c08f5c" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff4e6" stop-opacity="0"/>
    </linearGradient>
    <filter id="wv-glow" x="-10%" y="-50%" width="120%" height="200%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>
  <path class="glow" d="M760 330 C 1000 320, 1120 220, 1440 160" fill="none" stroke="url(#wv-a)" stroke-width="18" filter="url(#wv-glow)"/>
  <path d="M760 330 C 1000 320, 1120 220, 1440 160" fill="none" stroke="url(#wv-a)" stroke-width="3"/>
  <path class="glow" d="M0 800 C 300 840, 600 900, 900 850 S 1300 760, 1440 770" fill="none" stroke="url(#wv-b)" stroke-width="20" filter="url(#wv-glow)"/>
  <path d="M0 800 C 300 840, 600 900, 900 850 S 1300 760, 1440 770" fill="none" stroke="url(#wv-b)" stroke-width="3"/>
  <path d="M0 850 C 400 880, 800 910, 1100 860 S 1380 820, 1440 825" fill="none" stroke="url(#wv-b)" stroke-width="1.4" opacity=".7"/>
</svg>`;

const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`;

export function renderLogin(main, ctx) {
  document.body.classList.add('auth-mode');

  const email = h('input', { type: 'email', autocomplete: 'username', required: true, inputmode: 'email', autocapitalize: 'off', spellcheck: 'false', placeholder: 'ten@congty.com' });
  const password = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'btn' }, 'Đăng nhập');

  const form = h('form', { class: 'auth-glass', novalidate: true, 'aria-label': 'Đăng nhập' },
    field('Email', email),
    field('Mật khẩu', password),
    showPasswordToggle(password),
    error,
    submit,
    h('p', { class: 'auth-foot' }, 'Dùng email công ty và mật khẩu do HR cấp.', h('br'), 'Quên mật khẩu? Liên hệ HR để được cấp mật khẩu tạm.'),
  );

  const ghost = h('a', { href: '#/kiem-tra', class: 'auth-ghost' }, 'Kiểm tra hệ thống');
  ghost.insertAdjacentHTML('afterbegin', ICON_CHECK);

  const page = h('div', { class: 'auth-page' },
    h('header', { class: 'auth-top' },
      h('span', { class: 'auth-brand' }, 'JVC & Central Plaza'),
      h('span', { class: 'auth-app' }, 'Đăng ký nghỉ phép'),
    ),
    h('section', { class: 'auth-hero' },
      h('h2', { class: 'auth-title' },
        h('span', { class: 'l1' }, 'Nghỉ ngơi đúng lúc,'),
        h('span', { class: 'l2' }, 'làm việc trọn vẹn.'),
      ),
      h('p', { class: 'auth-lead' }, 'Nộp đơn nghỉ phép, theo dõi số phép còn lại và nhận phê duyệt — nhanh gọn ngay trên điện thoại của bạn.'),
      form,
      ghost,
    ),
  );
  page.insertAdjacentHTML('afterbegin', WAVES_SVG);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const em = email.value.trim().toLowerCase();
    if (!em || !password.value) {
      error.textContent = 'Vui lòng nhập email và mật khẩu.';
      error.hidden = false;
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Đang đăng nhập…';
    const { error: err } = await ctx.supabase.auth.signInWithPassword({ email: em, password: password.value });
    if (err) {
      error.textContent = errMsg(err);
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Đăng nhập';
      password.select();
      return;
    }
    history.replaceState(null, '', '#/'); // về trang chủ, không kích hoạt hashchange
    await ctx.reload();
  });

  main.append(page);
  // Không tự bật bàn phím trên điện thoại (che mất tiêu đề); chỉ tự đặt con trỏ trên máy tính
  if (window.matchMedia('(pointer: fine)').matches) email.focus();
}

/** Quy tắc mật khẩu: ≥ 8 ký tự, có chữ và số. Trả về thông báo lỗi hoặc null. */
export function passwordProblem(pw) {
  if (pw.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Mật khẩu phải có cả chữ và số.';
  return null;
}

export function renderChangePassword(main, ctx, { forced = false } = {}) {
  const pw1 = h('input', { type: 'password', autocomplete: 'new-password', required: true });
  const pw2 = h('input', { type: 'password', autocomplete: 'new-password', required: true });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'btn btn-block' }, 'Lưu mật khẩu mới');

  const form = h('form', { class: 'card auth-card', novalidate: true },
    h('h2', {}, forced ? 'Đổi mật khẩu lần đầu' : 'Đổi mật khẩu'),
    forced ? h('p', { class: 'notice attention' }, 'Bạn đang dùng mật khẩu tạm do HR cấp. Vui lòng đặt mật khẩu mới để tiếp tục.') : null,
    // ô ẩn giúp trình quản lý mật khẩu biết tài khoản nào
    h('input', { type: 'email', autocomplete: 'username', value: ctx.state.session.user.email, hidden: true, readOnly: true, tabindex: '-1' }),
    field('Mật khẩu mới', pw1, 'Ít nhất 8 ký tự, gồm cả chữ và số.'),
    field('Nhập lại mật khẩu mới', pw2),
    showPasswordToggle(pw1, pw2),
    error,
    submit,
    forced ? null : h('p', { class: 'hint center' }, h('a', { href: '#/' }, 'Quay lại trang chủ')),
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const problem = passwordProblem(pw1.value) || (pw1.value !== pw2.value ? 'Hai lần nhập mật khẩu không khớp.' : null);
    if (problem) {
      error.textContent = problem;
      error.hidden = false;
      return;
    }
    submit.disabled = true;
    try {
      const { error: e1 } = await ctx.supabase.auth.updateUser({ password: pw1.value });
      if (e1) throw e1;
      const { error: e2 } = await ctx.supabase.rpc('mark_password_changed');
      if (e2) throw e2;
      toast('Đã đổi mật khẩu.');
      history.replaceState(null, '', '#/'); // về trang chủ, không kích hoạt hashchange
      await ctx.reload();
    } catch (err) {
      error.textContent = errMsg(err);
      error.hidden = false;
      submit.disabled = false;
    }
  });

  main.append(form);
  pw1.focus();
}

function showPasswordToggle(...inputs) {
  const cb = h('input', { type: 'checkbox', id: `show-pw-${Math.random().toString(36).slice(2, 7)}` });
  cb.addEventListener('change', () => inputs.forEach((i) => { i.type = cb.checked ? 'text' : 'password'; }));
  return h('div', { class: 'check-row' }, cb, h('label', { for: cb.id }, 'Hiện mật khẩu'));
}

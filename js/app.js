// Khởi động app, điều hướng theo #/đường-dẫn, khung trang theo vai trò.
import { supabase, configProblem } from './supabase-client.js';
import { state, refreshSession } from './state.js';
import { h, clear, errMsg, loading } from './ui.js';
import { renderLogin, renderChangePassword } from './views/auth.js';
import { renderHome } from './views/home.js';
import { renderEmployees } from './views/hr-employees.js';
import { renderBalances } from './views/hr-balances.js';
import { renderLeaveTypes } from './views/hr-leave-types.js';
import { renderSystemCheck } from './views/system-check.js';

const main = document.getElementById('app');
const nav = document.getElementById('nav');
const userBox = document.getElementById('user-box');

// public: không cần đăng nhập; hr: chỉ HR
const routes = {
  '/':             { title: 'Trang chủ', render: renderHome, nav: true },
  '/hr/nhan-vien': { title: 'Nhân viên', render: renderEmployees, hr: true, nav: true },
  '/hr/quy-phep':  { title: 'Quỹ phép', render: renderBalances, hr: true, nav: true },
  '/hr/loai-phep': { title: 'Loại phép', render: renderLeaveTypes, hr: true, nav: true },
  '/doi-mat-khau': { title: 'Đổi mật khẩu', render: renderChangePassword },
  '/kiem-tra':     { title: 'Kiểm tra hệ thống', render: renderSystemCheck, public: true },
};

// ctx truyền cho các màn hình
const ctx = {
  state,
  supabase,
  go(path) { location.hash = '#' + path; },
  rerender: () => render(),
  async reload() { await refreshSession(); await render(); },
  leaveGuard: null, // màn hình có thay đổi chưa lưu gán hàm () => boolean
};

function currentPath() {
  const p = location.hash.replace(/^#/, '') || '/';
  return routes[p] ? p : '/';
}

function renderUserBox() {
  clear(userBox);
  if (!state.session) return;
  userBox.append(
    h('span', { class: 'user-name' }, state.me?.full_name || state.session.user.email),
    state.me && !state.me.must_change_password
      ? h('a', { href: '#/doi-mat-khau', class: 'topbar-link' }, 'Đổi mật khẩu')
      : null,
    h('button', { type: 'button', class: 'topbar-link', onclick: logout }, 'Đăng xuất'),
  );
}

function renderNav(path) {
  clear(nav);
  const show = state.me && !state.me.must_change_password;
  nav.hidden = !show;
  if (!show) return;
  for (const [p, r] of Object.entries(routes)) {
    if (!r.nav || (r.hr && !state.isHr)) continue;
    nav.append(h('a', { href: '#' + p, class: p === path ? 'active' : null, 'aria-current': p === path ? 'page' : null }, r.title));
  }
}

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const path = currentPath();
  const route = routes[path];
  lastHash = location.hash;
  ctx.leaveGuard = null;
  document.body.classList.remove('auth-mode'); // màn đăng nhập tự bật lại
  document.title = `${route.title} · Đăng ký nghỉ phép`;
  clear(main);

  if (configProblem || route.public) {
    renderUserBox();
    renderNav(path);
    return route.render(main, ctx);
  }

  renderUserBox();
  renderNav(path);

  if (!state.session) {
    document.title = 'Đăng nhập · Đăng ký nghỉ phép';
    return renderLogin(main, ctx);
  }

  if (!state.me) {
    main.append(h('section', { class: 'card attention' },
      h('h2', {}, 'Tài khoản chưa được gắn với hồ sơ nhân viên'),
      h('p', {}, `Bạn đã đăng nhập bằng ${state.session.user.email}, nhưng chưa có hồ sơ nhân viên đang làm việc với email này.`),
      h('p', {}, 'Vui lòng liên hệ HR để kiểm tra.'),
    ));
    return;
  }

  if (state.me.must_change_password) {
    document.title = 'Đổi mật khẩu · Đăng ký nghỉ phép';
    return renderChangePassword(main, ctx, { forced: true });
  }

  if (route.hr && !state.isHr) {
    ctx.go('/');
    return;
  }

  main.append(loading());
  try {
    const root = h('div', { class: 'view' });
    await route.render(root, ctx);
    if (seq !== renderSeq) return; // đã chuyển sang trang khác
    clear(main).append(root);
  } catch (err) {
    if (seq !== renderSeq) return;
    clear(main).append(h('section', { class: 'card attention' },
      h('h2', {}, 'Không tải được dữ liệu'),
      h('p', {}, errMsg(err)),
      h('button', { type: 'button', class: 'btn', onclick: () => render() }, 'Thử lại'),
    ));
  }
}

async function logout() {
  if (ctx.leaveGuard && !ctx.leaveGuard()) return;
  ctx.leaveGuard = null;
  await supabase.auth.signOut();
  await refreshSession();
  location.hash = '#/';
  render();
}

// Chặn rời trang khi còn thay đổi chưa lưu
let lastHash = location.hash;
let revertingHash = false;
window.addEventListener('hashchange', () => {
  if (revertingHash) { revertingHash = false; return; }
  if (ctx.leaveGuard && !ctx.leaveGuard()) {
    revertingHash = true;
    location.hash = lastHash;
    return;
  }
  lastHash = location.hash;
  render();
});
window.addEventListener('beforeunload', (e) => {
  if (ctx.leaveGuard && !ctx.leaveGuard(true)) { e.preventDefault(); e.returnValue = ''; }
});

async function boot() {
  if (configProblem) return render();
  try {
    await refreshSession();
  } catch (err) {
    console.error(err);
  }
  render();

  // Đăng nhập / đăng xuất ở tab khác, hoặc phiên hết hạn
  supabase.auth.onAuthStateChange((event, session) => {
    const before = state.session?.user?.id || null;
    const after = session?.user?.id || null;
    if (before === after) return; // bỏ qua làm mới token, focus lại tab…
    // Không gọi Supabase trực tiếp trong callback (tránh treo), dời sang lượt sau
    setTimeout(async () => {
      if ((state.session?.user?.id || null) === after) return; // màn hình đăng nhập đã tự xử lý
      await refreshSession().catch(console.error);
      render();
    }, 0);
  });
}

boot();

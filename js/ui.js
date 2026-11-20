// Tiện ích giao diện dùng chung. Mọi nội dung chữ đều gán qua textContent (chống chèn mã).

/** Tạo phần tử: h('div', {class: 'x', onclick: fn}, 'chữ', h('span')) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// ---------- Số & ngày ----------
const numFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

/** 12.5 → "12,5"; null → "" */
export function fmt(n) {
  if (n === null || n === undefined || n === '') return '';
  return numFmt.format(Number(n));
}

/** "12,5" / "12.5" → 12.5; chuỗi rỗng → null; sai → NaN */
export function parseNum(s) {
  const t = String(s ?? '').trim().replace(',', '.');
  if (t === '') return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** Số ≥ 0, bước 0,5 */
export function isHalfStep(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && Math.round(v * 2) === v * 2;
}

/** Năm hiện tại theo giờ Việt Nam */
export function currentYear() {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(new Date()));
}

// ---------- Thông báo lỗi ----------
const AUTH_MESSAGES = [
  [/invalid login credentials/i, 'Email hoặc mật khẩu không đúng.'],
  [/email not confirmed/i, 'Tài khoản chưa được kích hoạt. Liên hệ HR.'],
  [/should be different/i, 'Mật khẩu mới phải khác mật khẩu cũ.'],
  [/password should be at least|weak password|password is too weak/i, 'Mật khẩu quá yếu. Dùng ít nhất 8 ký tự, gồm cả chữ và số.'],
  [/rate limit|too many requests/i, 'Thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.'],
  [/failed to fetch|network/i, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'],
  [/jwt expired|invalid jwt|session/i, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'],
  [/employees_code_key/i, 'Mã NV đã tồn tại.'],
  [/employees_email_key/i, 'Email này đã dùng cho nhân viên khác.'],
  [/leave_types_name_key/i, 'Tên loại phép đã tồn tại.'],
  [/row-level security|permission denied/i, 'Bạn không có quyền thực hiện thao tác này.'],
];

export function errMsg(error) {
  const msg = error?.message || String(error || 'Lỗi không xác định');
  for (const [re, vi] of AUTH_MESSAGES) if (re.test(msg)) return vi;
  return msg;
}

// ---------- Toast ----------
let toastTimer;
export function toast(message, type = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), type === 'error' ? 6000 : 3000);
}

// ---------- Hộp thoại ----------
/**
 * openDialog({ title, body: Node, submitText, onSubmit: async () => true|false, extraActions: [Node] })
 * onSubmit trả về true để đóng hộp thoại.
 */
export function openDialog({ title, body, submitText = 'Lưu', onSubmit, extraActions = [], wide = false, cancelText = 'Đóng' }) {
  const errorBox = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submitBtn = h('button', { type: 'submit', class: 'btn' }, submitText);
  const cancelBtn = h('button', { type: 'button', class: 'btn btn-secondary' }, cancelText);
  const form = h('form', { class: 'dialog-form', novalidate: true },
    h('div', { class: 'dialog-head' }, h('h2', {}, title)),
    h('div', { class: 'dialog-body' }, body, errorBox),
    h('div', { class: 'dialog-actions' }, ...extraActions, h('span', { class: 'spacer' }), cancelBtn, onSubmit ? submitBtn : null),
  );
  const dlg = h('dialog', { class: wide ? 'dialog dialog-wide' : 'dialog' }, form);
  document.body.append(dlg);

  const close = () => { dlg.close(); dlg.remove(); };
  cancelBtn.addEventListener('click', close);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    errorBox.hidden = true;
    submitBtn.disabled = true;
    try {
      if (await onSubmit()) close();
    } catch (err) {
      errorBox.textContent = errMsg(err);
      errorBox.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  dlg.showModal();
  const first = form.querySelector('input:not([type=checkbox]), select, textarea');
  if (first) first.focus();
  return { close, submitBtn, showError: (m) => { errorBox.textContent = m; errorBox.hidden = false; } };
}

/** Ô nhập có nhãn */
export function field(label, control, hint) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;
  return h('div', { class: 'field' },
    h('label', { for: id }, label),
    control,
    hint ? h('p', { class: 'hint' }, hint) : null,
  );
}

export function loading(text = 'Đang tải…') {
  return h('p', { class: 'muted loading' }, text);
}

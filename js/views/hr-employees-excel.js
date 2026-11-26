// HR — Nhân viên: tải file mẫu, xuất Excel, nhập từ Excel (xem trước rồi mới ghi).
import { h, openDialog, toast, errMsg, TITLE_LABEL, APPROVER_TITLES } from '../ui.js';
import {
  loadExcelJS, newWorkbook, addDataSheet, addGuideSheet, downloadWorkbook, today,
  readSheet, cellText, pickFile, previewTable,
} from '../excel.js';

const TITLE_IN = {
  'nhân viên': 'employee', 'nhan vien': 'employee', employee: 'employee',
  'giám sát trực tiếp': 'supervisor', 'giám sát': 'supervisor', 'giam sat': 'supervisor', supervisor: 'supervisor',
  'quản lý': 'manager', 'quan ly': 'manager', manager: 'manager',
};
const YES = ['có', 'co', 'x', 'yes', 'hr', 'true', '1'];
const NO = ['không', 'khong', 'no', 'false', '0', 'nhân viên', 'nhan vien'];
const HR_OUT = (role) => (role === 'hr' ? 'Có' : 'Không');
const STATUS_OUT = (active) => (active ? 'Đang làm' : 'Đã nghỉ');
const STATUS_IN = { 'đang làm': true, 'đang làm việc': true, 'dang lam': true, 'đã nghỉ': false, 'đã nghỉ việc': false, 'nghỉ việc': false, 'da nghi': false };
const NONE = ['không có', 'không', 'khong co', '-'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TITLE_LIST = Object.values(TITLE_LABEL);

export const COLUMNS = [
  { header: 'Mã NV *', key: 'code', width: 12 },
  { header: 'Họ và tên *', key: 'full_name', width: 28 },
  { header: 'Vị trí công việc', key: 'position', width: 28 },
  { header: 'Email đăng nhập', key: 'email', width: 30, note: 'Phải trùng với email tạo tài khoản trong Supabase.' },
  { header: 'Chức danh', key: 'title', width: 18, list: TITLE_LIST, note: 'Chỉ Quản lý và Giám sát trực tiếp được làm người duyệt đơn.' },
  { header: 'Quyền HR', key: 'hr', width: 10, list: ['Có', 'Không'] },
  { header: 'Mã NV người duyệt', key: 'approver_code', width: 14, note: 'Mã NV của Quản lý / Giám sát trực tiếp duyệt đơn. Ghi "Không có" nếu đơn do HR nhập hộ (vd Tổng Giám đốc).' },
  { header: 'Trạng thái', key: 'status', width: 12, list: ['Đang làm', 'Đã nghỉ'] },
  { header: 'Người duyệt (tham khảo)', key: 'approver_name', width: 26, ref: true },
  { header: 'Tài khoản đăng nhập (tham khảo)', key: 'account', width: 16, ref: true },
];

export const GUIDE = [
  { text: 'Cách dùng', bold: true },
  '1. Điền sheet "Nhân viên": mỗi dòng một người. Cột có dấu * là bắt buộc.',
  '2. Lưu file (.xlsx), vào app → Nhân viên → Nhập từ Excel → chọn file → xem trước → bấm Nhập.',
  '3. App so khớp theo Mã NV: Mã NV đã có → cập nhật; Mã NV mới → thêm nhân viên. Nhân viên không có trong file giữ nguyên, không bị xóa.',
  '',
  { text: 'Quy tắc từng cột', bold: true },
  '• Mã NV: duy nhất, không trùng trong file. App tự viết hoa.',
  '• Email đăng nhập: email công ty, phải trùng với email tạo tài khoản trong Supabase (Authentication → Users). Mỗi email chỉ cho một nhân viên.',
  '• Chức danh: "Nhân viên", "Giám sát trực tiếp" hoặc "Quản lý". Chỉ Quản lý và Giám sát trực tiếp được làm người duyệt đơn.',
  '• Quyền HR: "Có" nếu người này được quản lý nhân viên, quỹ phép và duyệt thay. Một người có thể vừa là Quản lý vừa có quyền HR.',
  '• Mã NV người duyệt: Mã NV của Quản lý / Giám sát trực tiếp duyệt đơn cho người này (có thể là người mới thêm trong cùng file). Ghi "Không có" nếu không có người duyệt (đơn do HR nhập hộ, vd Tổng Giám đốc).',
  '• Trạng thái: "Đang làm" hoặc "Đã nghỉ". Không xóa nhân viên đã nghỉ, chỉ đổi trạng thái.',
  '• Cột màu xám ghi "(tham khảo)": chỉ để xem, app bỏ qua khi nhập.',
  '',
  { text: 'Ô để trống', bold: true },
  '• Nhân viên mới: Chức danh trống = Nhân viên; Quyền HR trống = Không; Trạng thái trống = Đang làm; Người duyệt trống = chưa gán.',
  '• Nhân viên đã có: ô trống = giữ nguyên giá trị hiện có trong app.',
  '',
  { text: 'Lưu ý', bold: true },
  '• File chỉ được đọc trên máy của bạn rồi ghi vào app; không gửi đi nơi khác.',
  '• Không đổi tên cột ở dòng 1. Có thể thêm dòng, sắp xếp lại dòng tùy ý.',
  '• Tài khoản đăng nhập vẫn phải tạo trong Supabase; app tự gắn theo email.',
];

// ---------------------------------------------------------------------
export async function exportEmployees(employees, { template = false } = {}) {
  const ExcelJS = await loadExcelJS();
  const wb = newWorkbook(ExcelJS);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const rows = template ? [] : [...employees]
    .sort((a, b) => a.code.localeCompare(b.code, 'vi', { numeric: true }))
    .map((e) => {
      const ap = e.approver_id ? byId.get(e.approver_id) : null;
      return {
        code: e.code,
        full_name: e.full_name,
        position: e.position || '',
        email: e.email || '',
        title: TITLE_LABEL[e.title] || TITLE_LABEL.employee,
        hr: HR_OUT(e.role),
        approver_code: ap ? ap.code : 'Không có',
        status: STATUS_OUT(e.is_active),
        approver_name: ap ? ap.full_name : '',
        account: e.user_id ? 'Có' : 'Chưa có',
      };
    });
  addDataSheet(wb, 'Nhân viên', COLUMNS, rows);
  addGuideSheet(wb, 'Mẫu nhập danh sách nhân viên', GUIDE);
  await downloadWorkbook(wb, template ? 'Mau_nhap_nhan_vien.xlsx' : `Nhan_vien_${today()}.xlsx`);
}

// ---------------------------------------------------------------------
const MATCHERS = {
  code: (x) => x === 'mã nv' || x === 'mã nhân viên',
  full_name: (x) => x === 'họ và tên' || x === 'họ tên',
  position: (x) => x.includes('vị trí'),
  email: (x) => x === 'email' || x === 'email đăng nhập',
  title: (x) => x === 'chức danh',
  hr: (x) => x === 'quyền hr',
  role: (x) => x === 'vai trò', // mẫu cũ: Nhân viên / HR
  approver_code: (x) => x.includes('mã') && x.includes('người duyệt'),
  approver_email: (x) => x === 'email quản lý' || x.includes('email người duyệt'),
  status: (x) => x === 'trạng thái',
};

/** Đọc file, đối chiếu, mở hộp thoại xem trước. onDone() gọi sau khi ghi xong. */
export async function importEmployees(ctx, employees, onDone) {
  const file = await pickFile();
  if (!file) return;
  let sheet;
  try {
    sheet = await readSheet(file, { matchers: MATCHERS, required: ['code', 'full_name'], prefer: ['Nhân viên'] });
  } catch (err) {
    toast(errMsg(err), 'error');
    return;
  }
  const items = analyze(sheet, employees, ctx.state.me);
  showPreview(ctx, file.name, sheet, items, onDone);
}

function analyze(sheet, employees, me) {
  const byCode = new Map(employees.map((e) => [e.code, e]));
  const byEmail = new Map(employees.filter((e) => e.email).map((e) => [e.email, e]));
  const byId = new Map(employees.map((e) => [e.id, e]));
  const seenCode = new Map();
  const seenEmail = new Map();
  const items = [];

  // Lượt 1: đọc & kiểm tra từng dòng
  for (const { rowNumber, values } of sheet.rows) {
    const t = (k) => cellText(values[k]);
    const code = t('code').toUpperCase();
    const ex = byCode.get(code);
    const errors = [];
    const v = { code, full_name: t('full_name').replace(/\s+/g, ' '), position: t('position'), email: t('email').toLowerCase() };

    if (!code) errors.push('Thiếu Mã NV.');
    else if (code.length > 20) errors.push('Mã NV quá dài (tối đa 20 ký tự).');
    else if (seenCode.has(code)) errors.push(`Trùng Mã NV với dòng ${seenCode.get(code)}.`);
    else seenCode.set(code, rowNumber);

    if (!v.full_name && !ex) errors.push('Thiếu Họ và tên.');

    if (v.email) {
      if (!EMAIL_RE.test(v.email)) errors.push(`Email không hợp lệ: ${v.email}`);
      else if (seenEmail.has(v.email)) errors.push(`Email trùng với dòng ${seenEmail.get(v.email)}.`);
      else {
        seenEmail.set(v.email, rowNumber);
        const owner = byEmail.get(v.email);
        if (owner && owner.code !== code) errors.push(`Email đã dùng cho nhân viên ${owner.code}.`);
      }
    }

    const titleRaw = t('title').toLowerCase().replace(/\s+/g, ' ');
    if (titleRaw) {
      v.title = TITLE_IN[titleRaw];
      if (!v.title) errors.push(`Chức danh "${t('title')}" không hợp lệ (chọn ${TITLE_LIST.join(' / ')}).`);
    }
    const hrRaw = (t('hr') || t('role')).toLowerCase();
    if (hrRaw) {
      if (YES.includes(hrRaw)) v.role = 'hr';
      else if (NO.includes(hrRaw)) v.role = 'employee';
      else errors.push(`Quyền HR "${t('hr') || t('role')}" không hợp lệ (ghi Có hoặc Không).`);
    }
    const statusRaw = t('status').toLowerCase();
    if (statusRaw) {
      v.is_active = STATUS_IN[statusRaw];
      if (v.is_active === undefined) errors.push(`Trạng thái "${t('status')}" không hợp lệ (chọn Đang làm hoặc Đã nghỉ).`);
    }

    items.push({ rowNumber, ex, v, errors, apCodeRaw: t('approver_code'), apEmailRaw: t('approver_email').toLowerCase() });
  }

  // Thông tin sau khi nhập của những người có trong file (để kiểm tra người duyệt là người mới / mới đổi chức danh)
  const fileItem = new Map(items.filter((i) => !i.errors.length && i.v.code).map((i) => [i.v.code, i]));
  const fileEmailToCode = new Map(items.filter((i) => !i.errors.length && i.v.email).map((i) => [i.v.email, i.v.code]));
  const titleAfter = (c) => {
    const it = fileItem.get(c);
    return it ? (it.v.title || it.ex?.title || 'employee') : byCode.get(c)?.title || 'employee';
  };
  const activeAfter = (c) => {
    const it = fileItem.get(c);
    return it ? (it.v.is_active ?? it.ex?.is_active ?? true) : !!byCode.get(c)?.is_active;
  };

  // Lượt 2: người duyệt, mặc định, so sánh thay đổi
  for (const it of items) {
    const { ex, v, errors } = it;

    // Người duyệt: undefined = giữ nguyên; null = không có; 'CODE' = gán
    let ap;
    if (it.apCodeRaw) {
      const raw = it.apCodeRaw.toLowerCase();
      ap = NONE.includes(raw) ? null : it.apCodeRaw.toUpperCase();
    } else if (it.apEmailRaw) {
      ap = byEmail.get(it.apEmailRaw)?.code || fileEmailToCode.get(it.apEmailRaw);
      if (!ap) errors.push(`Không tìm thấy người duyệt có email ${it.apEmailRaw}.`);
    }
    const curAp = ex?.approver_id ? byId.get(ex.approver_id)?.code || null : null;
    // Chỉ kiểm tra khi người duyệt thay đổi (giống database)
    if (ap && ap !== curAp) {
      if (ap === v.code) errors.push('Không thể tự làm người duyệt của chính mình.');
      else if (!byCode.has(ap) && !fileItem.has(ap)) errors.push(`Mã NV người duyệt "${ap}" không tồn tại.`);
      else if (!activeAfter(ap)) errors.push(`Người duyệt ${ap} đã nghỉ việc.`);
      else if (!APPROVER_TITLES.includes(titleAfter(ap))) errors.push(`Người duyệt ${ap} có chức danh ${TITLE_LABEL[titleAfter(ap)]} — chỉ Quản lý / Giám sát trực tiếp được duyệt đơn.`);
    }

    it.final = {
      code: v.code,
      full_name: v.full_name || ex?.full_name || '',
      position: v.position || ex?.position || null,
      email: v.email || ex?.email || null,
      title: v.title || ex?.title || 'employee',
      role: v.role || ex?.role || 'employee',
      is_active: v.is_active ?? ex?.is_active ?? true,
      approver_code: ap === undefined ? curAp : ap,
    };
    if (me && v.code === me.code) {
      if (it.final.role !== 'hr') errors.push('Không thể tự bỏ quyền HR của chính mình qua file.');
      if (!it.final.is_active) errors.push('Không thể tự đánh dấu chính mình đã nghỉ việc qua file.');
    }
  }

  // Lượt 3: người bị đổi chức danh thành Nhân viên mà vẫn còn người được họ duyệt sau khi nhập
  const approverAfter = new Map();
  for (const e of employees) if (e.is_active) approverAfter.set(e.code, e.approver_id ? byId.get(e.approver_id)?.code : null);
  for (const it of items) if (it.final && it.final.is_active) approverAfter.set(it.final.code, it.final.approver_code);
  for (const it of items) {
    if (!it.ex || it.final.title !== 'employee' || it.ex.title === 'employee') continue;
    const still = [...approverAfter].filter(([c, a]) => a === it.final.code && c !== it.final.code).map(([c]) => c);
    if (still.length) it.errors.push(`Đổi chức danh thành Nhân viên nhưng vẫn là người duyệt của: ${still.join(', ')}. Gán người duyệt khác cho họ (trong cùng file cũng được).`);
  }

  // Lượt 4: kết luận từng dòng
  for (const it of items) {
    const { ex, errors, final } = it;
    it.label = `${final.code}${final.full_name ? ' – ' + final.full_name : ''}`;
    if (errors.length) { it.status = 'error'; it.detail = errors.join(' '); continue; }
    if (!ex) {
      it.status = 'new';
      it.detail = [final.position, final.email, TITLE_LABEL[final.title], final.role === 'hr' ? 'Quyền HR' : null,
        final.approver_code ? `Người duyệt: ${final.approver_code}` : null, final.is_active ? null : 'Đã nghỉ']
        .filter(Boolean).join(' · ');
      continue;
    }
    const curAp = ex.approver_id ? byId.get(ex.approver_id)?.code || null : null;
    const changes = [];
    const cmp = (label, a, b, fmt = (x) => x || '(trống)') => { if ((a ?? null) !== (b ?? null)) changes.push(`${label}: ${fmt(a)} → ${fmt(b)}`); };
    cmp('Họ tên', ex.full_name, final.full_name);
    cmp('Vị trí', ex.position, final.position);
    cmp('Email', ex.email, final.email);
    cmp('Chức danh', ex.title || 'employee', final.title, (x) => TITLE_LABEL[x]);
    cmp('Quyền HR', ex.role, final.role, HR_OUT);
    cmp('Trạng thái', ex.is_active, final.is_active, STATUS_OUT);
    cmp('Người duyệt', curAp, final.approver_code, (x) => x || 'Không có');
    it.status = changes.length ? 'update' : 'same';
    it.detail = changes.join(' · ');
  }
  return items;
}

function showPreview(ctx, fileName, sheet, items, onDone) {
  const { node, counts } = previewTable(items);
  const writable = counts.new + counts.update;
  const body = h('div', {},
    h('p', { class: 'muted' }, `File: ${fileName} · Sheet: ${sheet.sheetName} · ${items.length} dòng có dữ liệu.`),
    counts.error ? h('p', { class: 'notice' }, `Có ${counts.error} dòng lỗi. Sửa các dòng này trong file rồi nhập lại; chưa có gì được ghi.`) : null,
    !counts.error && !writable ? h('p', { class: 'notice' }, 'File không có thay đổi nào so với dữ liệu hiện tại.') : null,
    node,
  );
  const dlg = openDialog({
    title: 'Xem trước dữ liệu nhập — Nhân viên',
    body,
    wide: true,
    cancelText: counts.error || !writable ? 'Đóng' : 'Hủy',
    submitText: `Nhập ${writable} dòng`,
    onSubmit: counts.error || !writable ? null : async () => {
      const failures = await write(ctx, items);
      const ok = writable - new Set(failures.map((f) => f.rowNumber)).size;
      if (failures.length) {
        openDialog({
          title: 'Kết quả nhập',
          body: h('div', {},
            h('p', {}, `Đã ghi ${ok}/${writable} dòng. Các dòng sau chưa ghi được:`),
            h('ul', {}, failures.map((f) => h('li', {}, `Dòng ${f.rowNumber} (${f.code}): ${f.message}`))),
          ),
        });
      } else {
        toast(`Đã nhập ${ok} dòng nhân viên.`);
      }
      await onDone();
      return true;
    },
  });
  if (!counts.error && writable) dlg.submitBtn.focus();
}

async function write(ctx, items) {
  const { supabase } = ctx;
  const failures = [];
  const todo = items.filter((i) => i.status === 'new' || i.status === 'update');
  const fail = (it, err) => { failures.push({ rowNumber: it.rowNumber, code: it.final.code, message: errMsg(err) }); it.failed = true; };

  // Bước 1: thêm mới / cập nhật thông tin. Chưa gán người duyệt; việc hạ chức danh xuống
  // Nhân viên để sau cùng (sau khi những người họ duyệt đã được chuyển cho người khác).
  for (const it of todo) {
    const f = it.final;
    const demote = it.ex && f.title === 'employee' && it.ex.title !== 'employee';
    const row = { code: f.code, full_name: f.full_name, position: f.position, email: f.email, role: f.role, title: demote ? it.ex.title : f.title, is_active: f.is_active };
    const { error } = it.status === 'new'
      ? await supabase.from('employees').insert(row)
      : await supabase.from('employees').update(row).eq('id', it.ex.id);
    if (error) fail(it, error);
    else if (demote) it.demote = true;
  }

  // Bước 2: gán người duyệt
  const { data: all, error: e2 } = await supabase.from('employees').select('id, code, approver_id');
  if (e2) { todo.forEach((it) => !it.failed && fail(it, e2)); return failures; }
  const idOf = new Map(all.map((e) => [e.code, e.id]));
  for (const it of todo) {
    if (it.failed) continue;
    const id = idOf.get(it.final.code);
    const want = it.final.approver_code ? idOf.get(it.final.approver_code) || null : null;
    const cur = all.find((e) => e.id === id)?.approver_id || null;
    if (!id || want === cur) continue;
    const { error } = await supabase.from('employees').update({ approver_id: want }).eq('id', id);
    if (error) fail(it, error);
  }

  // Bước 3: hạ chức danh
  for (const it of todo) {
    if (it.failed || !it.demote) continue;
    const { error } = await supabase.from('employees').update({ title: 'employee' }).eq('id', it.ex.id);
    if (error) fail(it, error);
  }
  return failures;
}

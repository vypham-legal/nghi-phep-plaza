// Dùng chung cho đơn nghỉ phép: nhãn, ngày, số ngày, đính kèm, hộp chi tiết.
import { h, clear, fmt, toast, errMsg, openDialog, field } from './ui.js';

export const STATUS = {
  pending: { label: 'Chờ duyệt', tag: 'tag-warn' },
  approved: { label: 'Đã duyệt', tag: 'tag-ok' },
  rejected: { label: 'Từ chối', tag: 'tag-err' },
  cancelled: { label: 'Đã hủy', tag: '' },
};
export const statusTag = (s) => h('span', { class: `tag ${STATUS[s]?.tag || ''}` }, STATUS[s]?.label || s);

// ---------- Ngày ----------
/** "2026-12-07" → "07/12/2026" */
export function fmtDate(d) {
  if (!d) return '';
  const [y, m, dd] = String(d).slice(0, 10).split('-');
  return `${dd}/${m}/${y}`;
}
/** "20/11/2026 09:00" theo giờ Việt Nam */
export function fmtDateTime(ts) {
  if (!ts) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
export function fmtRange(a, b) {
  return a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`;
}
/** Hôm nay theo giờ Việt Nam, dạng yyyy-mm-dd */
export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}
const toUTC = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
/** Số ngày lịch giữa 2 ngày (tính cả 2 đầu) */
export function calendarDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000) + 1;
}
export const sameMonth = (a, b) => a.slice(0, 7) === b.slice(0, 7);
export function lastDayOfMonth(s) {
  const [y, m] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function nextDay(s) {
  return new Date(toUTC(s) + 86400000).toISOString().slice(0, 10);
}

// ---------- Dữ liệu dùng chung ----------
let typeCache = null;
export async function loadLeaveTypes(supabase) {
  if (!typeCache) {
    const { data, error } = await supabase.from('leave_types').select('*').order('sort_order').order('name');
    if (error) throw error;
    typeCache = data;
  }
  return typeCache;
}
export function clearTypeCache() { typeCache = null; }

/** Map id → { full_name, code } cho người nộp/duyệt/hủy của các đơn mình được xem */
export async function loadPeople(supabase) {
  const { data, error } = await supabase.rpc('leave_request_people');
  if (error) throw error;
  return new Map((data || []).map((p) => [p.id, p]));
}

/** Số dư phép năm của 1 nhân viên trong 1 năm (null nếu chưa có quỹ) */
export async function loadBalance(supabase, employeeId, year) {
  const { data, error } = await supabase.from('v_leave_balance')
    .select('total_days, used_days, remaining_days, pending_days')
    .eq('employee_id', employeeId).eq('year', year).maybeSingle();
  if (error) throw error;
  return data;
}

/** Đơn khác (chờ duyệt / đã duyệt) của cùng người trùng khoảng ngày */
export async function findOverlaps(supabase, employeeId, from, to, exceptId = null) {
  let q = supabase.from('leave_requests')
    .select('id, code, start_date, end_date, days, status, leave_type_id')
    .eq('employee_id', employeeId)
    .in('status', ['pending', 'approved'])
    .lte('start_date', to)
    .gte('end_date', from);
  if (exceptId) q = q.neq('id', exceptId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ---------- File đính kèm (Storage bucket riêng tư "attachments") ----------
export const BUCKET = 'attachments';
export const MAX_FILE = 5 * 1024 * 1024;
export const ACCEPT = 'application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp';
const OK_TYPES = ACCEPT.split(',');

export function checkFiles(files) {
  for (const f of files) {
    if (f.size > MAX_FILE) return `File "${f.name}" lớn hơn 5 MB.`;
    if (f.type && !OK_TYPES.includes(f.type)) return `File "${f.name}" không đúng loại (chỉ PDF hoặc ảnh JPG, PNG, HEIC, WEBP).`;
  }
  if (files.length > 5) return 'Tối đa 5 file mỗi lần.';
  return null;
}

function safeName(name) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';
  return `${Date.now().toString(36)}-${base}${ext ? '.' + ext : ''}`;
}

/** Tải lên; trả về danh sách lỗi (rỗng = ổn) */
export async function uploadFiles(supabase, employeeId, requestId, files) {
  const errors = [];
  for (const f of files) {
    const path = `${employeeId}/${requestId}/${safeName(f.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false, contentType: f.type || undefined });
    if (error) errors.push(`${f.name}: ${errMsg(error)}`);
  }
  return errors;
}

export async function listFiles(supabase, employeeId, requestId) {
  const { data, error } = await supabase.storage.from(BUCKET).list(`${employeeId}/${requestId}`, { limit: 50, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw error;
  return (data || []).filter((f) => f.name && !f.name.startsWith('.'))
    .map((f) => ({ name: f.name, display: f.name.replace(/^[a-z0-9]+-/, ''), path: `${employeeId}/${requestId}/${f.name}`, size: f.metadata?.size }));
}

export async function openFile(supabase, path) {
  const w = window.open('', '_blank'); // mở tab trước (tránh bị chặn popup), gán link sau
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120);
  if (error) { if (w) w.close(); toast(errMsg(error), 'error'); return; }
  if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl;
}

export function fileInput() {
  return h('input', { type: 'file', multiple: true, accept: ACCEPT, class: 'file-input' });
}

// ---------- Hộp chi tiết đơn ----------
/**
 * opts: { people: Map, types: Map, actions: [{ label, kind, run: async () => boolean }], canAttach, onChanged }
 */
export function requestDetail(ctx, r, opts = {}) {
  const { supabase } = ctx;
  const people = opts.people || new Map();
  const type = opts.types?.get(r.leave_type_id);
  const person = (id) => (id ? people.get(id)?.full_name || '(không rõ)' : '');
  const filesBox = h('div', { class: 'file-list' }, h('p', { class: 'muted' }, 'Đang tải file…'));

  const rows = [
    ['Mã đơn', r.code],
    ['Nhân viên', person(r.employee_id) || (ctx.state.me.id === r.employee_id ? ctx.state.me.full_name : '')],
    ['Loại phép', type?.name || ''],
    ['Thời gian', fmtRange(r.start_date, r.end_date)],
    ['Số ngày', fmt(r.days)],
    ['Lý do', r.reason || '—'],
    ['Người nhận bàn giao', r.handover_to || '—'],
    ['Trạng thái', statusTag(r.status)],
    ['Ngày nộp', fmtDateTime(r.submitted_at) + (r.source === 'hr_entry' ? ' (HR nhập hộ)' : r.source === 'import' ? ' (số liệu cũ)' : '')],
  ];
  if (r.decided_at) rows.push([r.status === 'rejected' ? 'Người từ chối' : 'Người duyệt', `${person(r.decided_by) || '—'} · ${fmtDateTime(r.decided_at)}`]);
  if (r.decision_note) rows.push(['Ý kiến người duyệt', r.decision_note]);
  if (r.cancelled_at) rows.push(['Người hủy', `${person(r.cancelled_by) || '—'} · ${fmtDateTime(r.cancelled_at)}`]);
  if (r.cancel_reason) rows.push(['Lý do hủy', r.cancel_reason]);

  const body = h('div', {},
    h('dl', { class: 'detail-grid' }, rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    h('h3', { class: 'detail-sub' }, 'Giấy tờ đính kèm'),
    filesBox,
    opts.extra || null,
  );

  async function drawFiles() {
    try {
      const files = await listFiles(supabase, r.employee_id, r.id);
      clear(filesBox);
      if (!files.length) filesBox.append(h('p', { class: 'muted' }, 'Không có file.'));
      for (const f of files) {
        filesBox.append(h('div', { class: 'file-row' },
          h('button', { type: 'button', class: 'link-btn', onclick: () => openFile(supabase, f.path) }, f.display),
          f.size ? h('span', { class: 'muted small' }, ` ${Math.ceil(f.size / 1024)} KB`) : null,
          opts.canAttach ? h('button', { type: 'button', class: 'link-btn danger', onclick: async () => {
            if (!confirm(`Xóa file "${f.display}"?`)) return;
            const { error } = await supabase.storage.from(BUCKET).remove([f.path]);
            if (error) toast(errMsg(error), 'error'); else drawFiles();
          } }, 'Xóa') : null,
        ));
      }
      if (opts.canAttach) {
        const inp = fileInput();
        inp.addEventListener('change', async () => {
          const list = [...inp.files];
          const problem = checkFiles(list);
          if (problem) { toast(problem, 'error'); inp.value = ''; return; }
          const errs = await uploadFiles(supabase, r.employee_id, r.id, list);
          if (errs.length) toast(errs.join(' · '), 'error'); else toast('Đã thêm file.');
          drawFiles();
        });
        filesBox.append(h('label', { class: 'file-add' }, 'Thêm file (PDF/ảnh, ≤ 5 MB): ', inp));
      }
    } catch (err) {
      clear(filesBox).append(h('p', { class: 'muted' }, `Không tải được danh sách file: ${errMsg(err)}`));
    }
  }
  drawFiles();

  const dlg = openDialog({
    title: `Đơn ${r.code}`,
    body,
    extraActions: (opts.actions || []).map((a) => h('button', {
      type: 'button',
      class: `btn ${a.kind === 'primary' ? '' : 'btn-secondary'} ${a.kind === 'danger' ? 'btn-danger' : ''}`,
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          if (await a.run()) { dlg.close(); if (opts.onChanged) await opts.onChanged(); }
        } catch (err) { dlg.showError(errMsg(err)); }
        finally { btn.disabled = false; }
      },
    }, a.label)),
  });
  return dlg;
}

/** Hỏi lý do (bắt buộc hoặc không); trả về chuỗi hoặc null nếu bấm Hủy */
export function askReason({ title, label, required, submitText }) {
  return new Promise((resolve) => {
    const ta = h('textarea', { rows: '3', maxlength: '500' });
    let done = false;
    const dlg = openDialog({
      title,
      body: field(label + (required ? ' *' : ''), ta),
      submitText,
      onSubmit: async () => {
        const v = ta.value.trim();
        if (required && !v) throw new Error('Vui lòng nhập nội dung.');
        done = true;
        resolve(v);
        return true;
      },
    });
    // Đóng không xác nhận → null
    const obs = new MutationObserver(() => {
      if (!document.body.contains(ta)) { obs.disconnect(); if (!done) resolve(null); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return dlg;
  });
}

/** Thẻ đơn (dùng trên điện thoại) */
export function requestCard(r, { types, people, showEmployee, onOpen, warn }) {
  const type = types.get(r.leave_type_id);
  return h('button', { type: 'button', class: `req-card${warn ? ' attention' : ''}`, onclick: () => onOpen(r) },
    h('span', { class: 'req-card-top' },
      h('span', { class: 'req-type' }, type?.name || ''),
      statusTag(r.status),
    ),
    showEmployee ? h('span', { class: 'req-emp' }, people.get(r.employee_id)?.full_name || '') : null,
    h('span', { class: 'req-meta' }, `${fmtRange(r.start_date, r.end_date)} · ${fmt(r.days)} ngày`),
    r.reason ? h('span', { class: 'req-reason' }, r.reason) : null,
    warn ? h('span', { class: 'req-warn' }, warn) : null,
  );
}

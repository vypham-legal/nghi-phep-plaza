// Form nộp đơn — dùng cho nhân viên tự nộp (trang #/don/moi) và HR nhập hộ đơn giấy (hộp thoại).
import { h, clear, field, fmt, parseNum, isHalfStep, toast, errMsg, TITLE_LABEL } from '../ui.js';
import {
  loadLeaveTypes, loadBalance, findOverlaps, calendarDays, sameMonth, lastDayOfMonth, nextDay,
  todayISO, fmtDate, fmtRange, fileInput, checkFiles, uploadFiles,
} from '../requests.js';

/**
 * Dựng form vào `container`.
 * opts.hr = true: HR nhập hộ (chọn nhân viên, trạng thái, người duyệt trên đơn giấy)
 * opts.employees: danh sách nhân viên (bắt buộc khi hr)
 * opts.onDone(request): gọi sau khi lưu xong
 * Trả về { submit: async () => boolean } để hộp thoại gọi khi bấm Lưu (chế độ hr).
 */
export async function buildRequestForm(container, ctx, opts = {}) {
  const { supabase, state } = ctx;
  const hr = !!opts.hr;
  const types = (await loadLeaveTypes(supabase)).filter((t) => t.is_active);
  const annual = types.find((t) => t.deducts_balance);
  const employees = (opts.employees || []).filter((e) => e.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'));
  const today = todayISO();

  // ----- Ô nhập -----
  const empSel = hr ? h('select', { required: true },
    h('option', { value: '' }, '— Chọn nhân viên —'),
    ...employees.map((e) => h('option', { value: e.id }, `${e.full_name} (${e.code})`))) : null;
  const typeSel = h('select', { required: true }, ...types.map((t) => h('option', { value: String(t.id) }, t.name)));
  if (annual) typeSel.value = String(annual.id);
  const from = h('input', { type: 'date', required: true, value: today });
  const to = h('input', { type: 'date', required: true, value: today });
  const days = h('input', { type: 'text', inputmode: 'decimal', required: true, value: '1', class: 'days-input' });
  const halfBtns = h('div', { class: 'chip-row' },
    h('button', { type: 'button', class: 'chip', onclick: () => setDays(1) }, 'Cả ngày'),
    h('button', { type: 'button', class: 'chip', onclick: () => setDays(0.5) }, 'Nửa ngày'),
  );
  const reason = h('textarea', { rows: '3', maxlength: '500', placeholder: 'Ví dụ: việc gia đình' });
  const handover = h('input', { type: 'text', maxlength: '120', placeholder: 'Họ tên người nhận bàn giao công việc' });
  const files = fileInput();

  // HR nhập hộ: trạng thái + người duyệt trên đơn giấy
  const statusSel = hr ? h('select', {},
    h('option', { value: 'approved' }, 'Đã duyệt (đơn giấy đã có chữ ký)'),
    h('option', { value: 'pending' }, 'Chờ duyệt (người duyệt sẽ duyệt trên app)')) : null;
  const approverSel = hr ? h('select', {}) : null;
  const decidedAt = hr ? h('input', { type: 'date', value: today }) : null;
  const note = hr ? h('input', { type: 'text', maxlength: '300', placeholder: 'Không bắt buộc' }) : null;

  const info = h('div', { class: 'form-info' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });

  let daysTouched = false;
  function setDays(v) { days.value = fmt(v); daysTouched = true; refresh(); }
  days.addEventListener('input', () => { daysTouched = true; refresh(); });
  from.addEventListener('change', () => {
    if (!to.value || to.value < from.value) to.value = from.value;
    refresh();
  });
  to.addEventListener('change', refresh);
  typeSel.addEventListener('change', refresh);
  if (empSel) empSel.addEventListener('change', () => { fillApprovers(); refresh(); });
  if (statusSel) statusSel.addEventListener('change', () => { approverBox.hidden = statusSel.value !== 'approved'; });

  function fillApprovers() {
    if (!approverSel) return;
    const emp = employees.find((e) => e.id === empSel.value);
    const all = (opts.employees || []).filter((x) => x.is_active && ['supervisor', 'manager'].includes(x.title));
    clear(approverSel).append(
      h('option', { value: '' }, '— HR (người nhập) —'),
      ...all.map((x) => h('option', { value: x.id }, `${x.full_name} – ${TITLE_LABEL[x.title]}`)));
    approverSel.value = emp?.approver_id || '';
  }

  const approverBox = hr ? h('div', { class: 'form-grid' },
    field('Người duyệt trên đơn giấy', approverSel),
    field('Ngày duyệt', decidedAt),
    field('Ý kiến người duyệt', note)) : null;

  // ----- Bố cục ----- (bọc trong h() để bỏ qua các ô null)
  container.append(h('div', {},
    h('div', { class: 'form-grid' },
      hr ? field('Nhân viên *', empSel) : null,
      field('Loại phép *', typeSel),
    ),
    h('div', { class: 'form-grid' },
      field('Từ ngày *', from),
      field('Đến ngày *', to),
    ),
    field('Số ngày nghỉ *', h('div', { class: 'days-row' }, days, halfBtns), 'Theo bước 0,5. App gợi ý theo số ngày lịch — sửa lại nếu có ngày không phải nghỉ (vd ngày nghỉ hằng tuần).'),
    info,
    field('Lý do', reason),
    field('Người nhận bàn giao', handover),
    field('Giấy tờ đính kèm', files, 'Không bắt buộc. PDF hoặc ảnh, tối đa 5 MB/file. Chỉ bạn, người duyệt trực tiếp và HR xem được.'),
    hr ? h('hr', { class: 'sep' }) : null,
    hr ? field('Trạng thái đơn', statusSel) : null,
    approverBox,
    error,
  ));
  fillApprovers();

  // ----- Kiểm tra & thông tin -----
  let seq = 0;
  let lastCheck = { blocking: null };
  async function refresh() {
    const my = ++seq;
    const f = from.value, t = to.value;
    halfBtns.hidden = !(f && t && f === t);
    const empId = hr ? empSel.value : state.me.id;
    const blocks = [];
    const warns = [];
    let calDays = 0;

    if (f && t) {
      if (t < f) blocks.push('"Đến ngày" phải sau hoặc bằng "Từ ngày".');
      else if (!sameMonth(f, t)) {
        const end1 = lastDayOfMonth(f), start2 = nextDay(end1);
        blocks.push(`Đơn nghỉ qua 2 tháng phải tách thành 2 đơn: đơn 1 từ ${fmtDate(f)} đến ${fmtDate(end1)}, đơn 2 từ ${fmtDate(start2)} đến ${fmtDate(t)}.`);
      } else {
        calDays = calendarDays(f, t);
        if (!daysTouched) days.value = fmt(calDays);
      }
    }
    const d = parseNum(days.value);
    if (d === null || Number.isNaN(d) || !isHalfStep(d) || d <= 0) blocks.push('Số ngày phải lớn hơn 0, theo bước 0,5 (vd 1 hoặc 1,5).');
    else if (calDays && d > calDays) blocks.push(`Số ngày (${fmt(d)}) không được lớn hơn số ngày lịch (${calDays}).`);
    if (f && !hr && f < today) warns.push('Bạn đang xin nghỉ cho ngày đã qua.');

    clear(info);
    if (!empId) { lastCheck = { blocking: blocks[0] || null }; return; }

    try {
      const isAnnual = annual && typeSel.value === String(annual.id);
      const year = Number((f || today).slice(0, 4));
      const [bal, overlaps] = await Promise.all([
        isAnnual ? loadBalance(supabase, empId, year) : Promise.resolve(null),
        f && t && t >= f ? findOverlaps(supabase, empId, f, t) : Promise.resolve([]),
      ]);
      if (my !== seq) return;

      if (isAnnual) {
        if (!bal) warns.push(`Chưa có quỹ phép năm ${year} — HR cần nhập quỹ phép trước khi duyệt.`);
        else {
          const avail = Number(bal.remaining_days) - Number(bal.pending_days);
          info.append(h('p', { class: 'balance-line' },
            `Phép năm ${year}: còn `, h('strong', {}, fmt(bal.remaining_days)), ' ngày',
            Number(bal.pending_days) ? ` (đang chờ duyệt ${fmt(bal.pending_days)} ngày)` : '', '.'));
          if (d && d > avail) warns.push(`Số ngày xin (${fmt(d)}) vượt số phép năm còn có thể dùng (${fmt(avail)}). Đơn vẫn gửi được; người duyệt sẽ quyết định.`);
        }
      }
      if (overlaps.length) {
        warns.push(`Trùng ngày với ${overlaps.length} đơn khác: ` + overlaps.map((o) => `${o.code} (${fmtRange(o.start_date, o.end_date)}, ${o.status === 'approved' ? 'đã duyệt' : 'chờ duyệt'})`).join('; ') + '.');
      }
    } catch (err) {
      warns.push(`Không kiểm tra được số dư / trùng ngày: ${errMsg(err)}`);
    }

    for (const w of warns) info.append(h('p', { class: 'notice' }, w));
    for (const b of blocks) info.append(h('p', { class: 'form-error' }, b));
    lastCheck = { blocking: blocks[0] || null };
  }

  if (!hr && !state.me.approver_id) {
    container.prepend(h('p', { class: 'notice' }, 'Bạn chưa có người duyệt — đơn sẽ do HR xử lý.'));
  }
  if (approverBox) approverBox.hidden = statusSel.value !== 'approved';
  refresh();

  // ----- Gửi -----
  async function submit() {
    error.hidden = true;
    await refresh();
    const empId = hr ? empSel.value : state.me.id;
    if (!empId) throw new Error('Vui lòng chọn nhân viên.');
    if (!from.value || !to.value) throw new Error('Vui lòng chọn Từ ngày và Đến ngày.');
    if (lastCheck.blocking) throw new Error(lastCheck.blocking);
    const list = [...files.files];
    const fileProblem = checkFiles(list);
    if (fileProblem) throw new Error(fileProblem);

    const row = {
      employee_id: empId,
      leave_type_id: Number(typeSel.value),
      start_date: from.value,
      end_date: to.value,
      days: parseNum(days.value),
      reason: reason.value.trim() || null,
      handover_to: handover.value.trim() || null,
      status: 'pending',
    };
    if (hr) {
      row.source = 'hr_entry';
      row.status = statusSel.value;
      if (row.status === 'approved') {
        row.decided_by = approverSel.value || null;
        row.decided_at = decidedAt.value ? `${decidedAt.value}T12:00:00+07:00` : null;
        row.decision_note = note.value.trim() || null;
      }
    }
    const { data, error: e1 } = await supabase.from('leave_requests').insert(row).select('*').single();
    if (e1) throw e1;
    if (list.length) {
      const errs = await uploadFiles(supabase, data.employee_id, data.id, list);
      if (errs.length) toast(`Đơn đã lưu nhưng chưa tải được file: ${errs.join(' · ')}. Mở đơn để thêm lại file.`, 'error');
    }
    if (opts.onDone) await opts.onDone(data);
    return true;
  }

  return { submit, showError: (m) => { error.textContent = m; error.hidden = false; } };
}

/** Trang #/don/moi — nhân viên tự nộp đơn */
export async function renderNewRequest(root, ctx) {
  const card = h('section', { class: 'card form-card' });
  const submitBtn = h('button', { type: 'submit', class: 'btn btn-block' }, 'Gửi đơn');
  const form = h('form', { novalidate: true }, card, h('div', { class: 'form-actions' },
    h('a', { href: '#/don', class: 'btn btn-secondary' }, 'Hủy'), submitBtn));

  root.append(h('h2', { class: 'page-title' }, 'Nộp đơn nghỉ phép'), form);
  const api = await buildRequestForm(card, ctx, {
    onDone: async (r) => {
      toast(`Đã gửi đơn ${r.code} — đang chờ duyệt.`);
      ctx.go('/don');
    },
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang gửi…';
    try {
      await api.submit();
    } catch (err) {
      api.showError(errMsg(err));
      submitBtn.disabled = false;
      submitBtn.textContent = 'Gửi đơn';
    }
  });
}

// HR: danh mục loại phép.
import { h, clear, field, openDialog, toast } from '../ui.js';

export async function renderLeaveTypes(root, ctx) {
  const { supabase } = ctx;
  let types = [];
  const tableBox = h('div', { class: 'table-wrap' });

  root.append(
    h('div', { class: 'page-head' },
      h('h2', { class: 'page-title' }, 'Loại phép'),
      h('button', { type: 'button', class: 'btn', onclick: () => editDialog(null) }, '+ Thêm loại phép'),
    ),
    tableBox,
    h('p', { class: 'hint' },
      'Chỉ loại phép có "Trừ quỹ phép năm" mới trừ vào số phép còn lại. ',
      'Tên loại phép phải khớp với cột "Loại phép" trong file Excel khi nhập dữ liệu. ',
      'Loại phép ngừng dùng sẽ không hiện khi nộp đơn mới, nhưng các đơn cũ vẫn giữ nguyên.'),
  );

  async function load() {
    const { data, error } = await supabase.from('leave_types').select('*').order('sort_order').order('name');
    if (error) throw error;
    types = data;
  }

  function draw() {
    clear(tableBox).append(h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, ['Thứ tự', 'Tên loại phép', 'Trừ quỹ phép năm', 'Trạng thái', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, types.map((t) => h('tr', { class: t.is_active ? null : 'row-muted' },
        h('td', { class: 'num' }, String(t.sort_order)),
        h('td', {}, t.name),
        h('td', {}, t.deducts_balance ? h('span', { class: 'tag tag-ok' }, 'Có') : 'Không'),
        h('td', {}, t.is_active ? 'Đang dùng' : 'Ngừng dùng'),
        h('td', {}, h('button', { type: 'button', class: 'btn btn-small btn-secondary', onclick: () => editDialog(t) }, 'Sửa')),
      ))),
    ));
  }

  function editDialog(t) {
    const isNew = !t;
    const name = h('input', { type: 'text', required: true, value: t?.name || '', maxlength: '80' });
    const order = h('input', { type: 'number', min: '0', step: '1', value: String(t?.sort_order ?? (Math.max(0, ...types.map((x) => x.sort_order)) + 1)) });
    const deducts = h('input', { type: 'checkbox', checked: !!t?.deducts_balance, id: 'lt-deducts' });
    const active = h('input', { type: 'checkbox', checked: t ? t.is_active : true, id: 'lt-active' });

    openDialog({
      title: isNew ? 'Thêm loại phép' : `Sửa loại phép`,
      body: h('div', { class: 'form-grid' },
        field('Tên loại phép *', name),
        field('Thứ tự hiển thị', order),
        h('div', { class: 'check-row' }, deducts, h('label', { for: 'lt-deducts' }, 'Trừ quỹ phép năm')),
        h('div', { class: 'check-row' }, active, h('label', { for: 'lt-active' }, 'Đang dùng')),
      ),
      onSubmit: async () => {
        const row = {
          name: name.value.trim().replace(/\s+/g, ' '),
          sort_order: Number.parseInt(order.value, 10) || 0,
          deducts_balance: deducts.checked,
          is_active: active.checked,
        };
        if (!row.name) throw new Error('Vui lòng nhập tên loại phép.');
        if (!isNew && row.deducts_balance !== t.deducts_balance &&
            !confirm('Đổi "Trừ quỹ phép năm" sẽ tính lại số phép còn lại của mọi nhân viên, kể cả các đơn đã duyệt trước đây. Tiếp tục?')) return false;
        if (!isNew && row.name !== t.name &&
            !confirm(`Đổi tên "${t.name}" thành "${row.name}"? Các đơn cũ sẽ hiển thị theo tên mới.`)) return false;
        const { error } = isNew
          ? await supabase.from('leave_types').insert(row)
          : await supabase.from('leave_types').update(row).eq('id', t.id);
        if (error) throw error;
        toast('Đã lưu loại phép.');
        await load();
        draw();
        return true;
      },
    });
  }

  await load();
  draw();
}

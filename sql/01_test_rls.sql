-- =====================================================================
-- 01_test_rls.sql — Tự kiểm thử phân quyền & quy tắc Giai đoạn 1.
-- Chạy SAU 01_schema.sql, trong Supabase > SQL Editor (vai trò postgres).
-- Script tạo tài khoản/nhân viên/đơn ẢO, chạy thử, rồi TỰ HOÀN TÁC toàn bộ:
-- không để lại dữ liệu nào. Kết quả: bảng ĐẠT / KHÔNG ĐẠT ở cuối.
-- =====================================================================

-- Hàm tạm (chỉ tồn tại trong phiên chạy này)
create or replace function pg_temp.np_as(p_uid uuid) returns void language plpgsql as $$
begin
  if p_uid is null then                              -- quay về quản trị
    perform set_config('request.jwt.claims', '', true);
    execute 'reset role';
  else                                               -- đóng vai người dùng đã đăng nhập
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
end $$;

create or replace function pg_temp.np_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

-- Chạy 1 câu lệnh: trả 'OK:<số dòng>' hoặc 'LOI:<thông báo>'
create or replace function pg_temp.np_try(p_sql text) returns text language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return 'OK:' || n;
exception when others then
  return 'LOI:' || sqlerrm;
end $$;

create or replace function pg_temp.np_val(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, '(trống)');
exception when others then
  return 'LOI:' || sqlerrm;
end $$;

create or replace function pg_temp.np_kq(p_ten text, p_mong_doi text, p_thuc_te text, p_dat boolean)
returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'ten', p_ten, 'mong_doi', p_mong_doi, 'thuc_te', p_thuc_te, 'dat', coalesce(p_dat, false)))
$$;

create temp table if not exists np_ket_qua (stt int, tinh_huong text, mong_doi text, thuc_te text, dat boolean);
truncate np_ket_qua;

do $$
declare
  kq    jsonb := '[]';
  u_hr  uuid := gen_random_uuid();  u_qa  uuid := gen_random_uuid();
  u_qb  uuid := gen_random_uuid();  u_nv1 uuid := gen_random_uuid();
  u_nv2 uuid := gen_random_uuid();  u_x   uuid := gen_random_uuid();   -- u_x: có tài khoản, không có hồ sơ NV
  e_hr uuid; e_qa uuid; e_qb uuid; e_nv1 uuid; e_nv2 uuid;
  t_pn int; t_om int;
  r1 uuid; r2 uuid; rc uuid;
  v text;
begin
  begin
    -- ================= CHUẨN BỊ (quyền quản trị) =================
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    select '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email, '',
           now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
    from (values (u_hr,  'np.test.hr@test.invalid'),  (u_qa,  'np.test.qa@test.invalid'),
                 (u_qb,  'np.test.qb@test.invalid'),  (u_nv1, 'np.test.nv1@test.invalid'),
                 (u_nv2, 'np.test.nv2@test.invalid'), (u_x,   'np.test.x@test.invalid')) as x(id, email);

    insert into public.employees (code, full_name, email, role) values ('zztest-hr', 'TEST HR', 'NP.Test.HR@test.invalid', 'hr') returning id into e_hr;
    insert into public.employees (code, full_name, email) values ('zztest-qa', 'TEST QUẢN LÝ A', 'np.test.qa@test.invalid') returning id into e_qa;
    insert into public.employees (code, full_name, email) values ('zztest-qb', 'TEST QUẢN LÝ B', 'np.test.qb@test.invalid') returning id into e_qb;
    insert into public.employees (code, full_name, email, approver_id) values ('zztest-nv1', 'TEST NV1', 'np.test.nv1@test.invalid', e_qa) returning id into e_nv1;
    insert into public.employees (code, full_name, email, approver_id) values ('zztest-nv2', 'TEST NV2', 'np.test.nv2@test.invalid', e_qb) returning id into e_nv2;
    update public.employees set approver_id = e_qa where id = e_hr;

    insert into public.leave_balances (employee_id, year, current_year_days, carried_over_days)
    values (e_nv1, 2026, 12, 2), (e_nv2, 2026, 12, 2);

    select id into t_pn from public.leave_types where name = 'Phép năm';
    select id into t_om from public.leave_types where name = 'Nghỉ ốm';

    insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days)
    values (e_nv2, t_pn, '2026-12-01', '2026-12-01', 1) returning id into r2;

    v := pg_temp.np_val(format('select count(*) from public.employees where id in (%L,%L,%L) and user_id is not null', e_hr, e_nv1, e_nv2));
    kq := kq || pg_temp.np_kq('Tự gắn tài khoản với nhân viên theo email (không phân biệt hoa thường)', '3', v, v = '3');

    v := pg_temp.np_val(format('select code from public.employees where id = %L', e_nv1));
    kq := kq || pg_temp.np_kq('Mã NV tự chuyển chữ hoa', 'ZZTEST-NV1', v, v = 'ZZTEST-NV1');

    -- ================= NHÂN VIÊN 1 =================
    perform pg_temp.np_as(u_nv1);

    v := pg_temp.np_val('select count(*) from public.employees');
    kq := kq || pg_temp.np_kq('NV1 chỉ thấy hồ sơ của mình + người duyệt của mình', '2', v, v = '2');

    v := pg_temp.np_val(format('select count(*) from public.leave_requests where employee_id = %L', e_nv2));
    kq := kq || pg_temp.np_kq('NV1 không thấy đơn của NV2', '0', v, v = '0');

    v := pg_temp.np_val(format('select count(*) from public.leave_balances where employee_id = %L', e_nv2));
    kq := kq || pg_temp.np_kq('NV1 không thấy quỹ phép của NV2', '0', v, v = '0');

    v := pg_temp.np_val(format('select count(*) from public.v_leave_balance where employee_id = %L', e_nv2));
    kq := kq || pg_temp.np_kq('NV1 không thấy số dư của NV2 qua view', '0', v, v = '0');

    v := pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days, reason) values (%L, %s, %L, %L, 2, %L)',
                               e_nv1, t_pn, '2026-12-07', '2026-12-08', 'test'));
    kq := kq || pg_temp.np_kq('NV1 nộp đơn Phép năm 2 ngày cho mình', 'OK:1', v, v = 'OK:1');
    select id into r1 from public.leave_requests where employee_id = e_nv1 order by submitted_at desc limit 1;

    v := pg_temp.np_val(format('select status || ''/'' || source from public.leave_requests where id = %L', r1));
    kq := kq || pg_temp.np_kq('Đơn mới ở trạng thái Chờ duyệt, nguồn app', 'pending/app', v, v = 'pending/app');

    v := pg_temp.np_val(format('select (code ~ ''^NP-[0-9]{6}$'')::text from public.leave_requests where id = %L', r1));
    kq := kq || pg_temp.np_kq('Mã đơn tự sinh dạng NP-000001', 'true', v, v = 'true');

    v := pg_temp.np_try(format('insert into public.leave_requests (code, employee_id, leave_type_id, start_date, end_date, days) values (''NP-999999'', %L, %s, %L, %L, 1)',
                               e_nv1, t_pn, '2026-12-21', '2026-12-21'));
    v := pg_temp.np_val('select count(*) from public.leave_requests where code = ''NP-999999''');
    kq := kq || pg_temp.np_kq('NV1 tự đặt mã đơn → hệ thống bỏ qua, tự sinh mã', '0', v, v = '0');

    v := pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days) values (%L, %s, %L, %L, 1)',
                               e_nv2, t_pn, '2026-12-09', '2026-12-09'));
    kq := kq || pg_temp.np_kq('NV1 nộp đơn hộ NV2', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days, status) values (%L, %s, %L, %L, 1, ''approved'')',
                               e_nv1, t_pn, '2026-12-10', '2026-12-10'));
    kq := kq || pg_temp.np_kq('NV1 tạo đơn ở sẵn trạng thái Đã duyệt', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days) values (%L, %s, %L, %L, 3)',
                               e_nv1, t_pn, '2026-12-30', '2027-01-02'));
    kq := kq || pg_temp.np_kq('Đơn nghỉ qua 2 tháng', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days) values (%L, %s, %L, %L, 0.3)',
                               e_nv1, t_pn, '2026-12-11', '2026-12-11'));
    kq := kq || pg_temp.np_kq('Số ngày 0,3 (không phải bước 0,5)', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days) values (%L, %s, %L, %L, 2)',
                               e_nv1, t_pn, '2026-12-11', '2026-12-11'));
    kq := kq || pg_temp.np_kq('Số ngày lớn hơn số ngày lịch (2 ngày trong 1 ngày)', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days) values (%L, %s, %L, %L, 0.5)',
                               e_nv1, t_pn, '2026-12-14', '2026-12-14'));
    kq := kq || pg_temp.np_kq('NV1 nộp đơn nửa ngày (0,5)', 'OK:1', v, v = 'OK:1');
    select id into rc from public.leave_requests where employee_id = e_nv1 and days = 0.5 limit 1;

    v := pg_temp.np_try(format('update public.leave_requests set status = ''approved'' where id = %L', r1));
    kq := kq || pg_temp.np_kq('NV1 tự duyệt đơn của mình', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('update public.leave_requests set days = 1 where id = %L', r1));
    kq := kq || pg_temp.np_kq('NV1 sửa số ngày của đơn đã nộp', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('update public.leave_requests set status = ''cancelled'' where id = %L', rc));
    kq := kq || pg_temp.np_kq('NV1 hủy đơn đang Chờ duyệt của mình', 'OK:1', v, v = 'OK:1');

    v := pg_temp.np_try(format('update public.leave_requests set status = ''pending'' where id = %L', rc));
    kq := kq || pg_temp.np_kq('NV1 mở lại đơn đã hủy', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('update public.employees set role = ''hr'' where id = %L', e_nv1));
    kq := kq || pg_temp.np_kq('NV1 tự nâng quyền thành HR', 'không đổi được (0 dòng)', v, v = 'OK:0' or v like 'LOI:%');

    v := pg_temp.np_try(format('update public.leave_balances set current_year_days = 99 where employee_id = %L', e_nv1));
    kq := kq || pg_temp.np_kq('NV1 tự sửa quỹ phép của mình', 'không đổi được (0 dòng)', v, v = 'OK:0' or v like 'LOI:%');

    v := pg_temp.np_try(format('delete from public.leave_requests where id = %L', r1));
    kq := kq || pg_temp.np_kq('NV1 xóa đơn', 'bị chặn', v, v = 'OK:0' or v like 'LOI:%');

    v := pg_temp.np_val('select count(*) from public.audit_log');
    kq := kq || pg_temp.np_kq('NV1 xem nhật ký', '0', v, v = '0' or v like 'LOI:%');

    v := pg_temp.np_try('insert into public.audit_log (table_name, action) values (''x'', ''x'')');
    kq := kq || pg_temp.np_kq('NV1 ghi giả nhật ký', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try('select public.mark_password_changed()');
    kq := kq || pg_temp.np_kq('NV1 đánh dấu đã đổi mật khẩu', 'OK:1', v, v = 'OK:1');

    -- ================= QUẢN LÝ B (không quản lý NV1) =================
    perform pg_temp.np_as(u_qb);

    v := pg_temp.np_val(format('select count(*) from public.leave_requests where employee_id = %L', e_nv1));
    kq := kq || pg_temp.np_kq('QL B không thấy đơn của NV1', '0', v, v = '0');

    v := pg_temp.np_try(format('update public.leave_requests set status = ''approved'' where id = %L', r1));
    kq := kq || pg_temp.np_kq('QL B duyệt đơn của NV1', 'không duyệt được', v, v = 'OK:0' or v like 'LOI:%');

    v := pg_temp.np_val(format('select remaining_days from public.v_leave_balance where employee_id = %L and year = 2026', e_nv2));
    kq := kq || pg_temp.np_kq('QL B xem được số dư của NV2 (người mình duyệt)', '14.0', v, v = '14.0');

    -- ================= QUẢN LÝ A (người duyệt của NV1) =================
    perform pg_temp.np_as(u_qa);

    v := pg_temp.np_val(format('select count(*) from public.leave_requests where employee_id = %L', e_nv1));
    kq := kq || pg_temp.np_kq('QL A thấy đơn của NV1', '3', v, v = '3');

    v := pg_temp.np_val(format('select count(*) from public.leave_requests where employee_id = %L', e_nv2));
    kq := kq || pg_temp.np_kq('QL A không thấy đơn của NV2', '0', v, v = '0');

    v := pg_temp.np_try(format('update public.leave_requests set status = ''rejected'' where id = %L', r1));
    kq := kq || pg_temp.np_kq('QL A từ chối không ghi ý kiến', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('update public.leave_requests set status = ''approved'', decision_note = ''Đồng ý'' where id = %L', r1));
    kq := kq || pg_temp.np_kq('QL A duyệt đơn của NV1', 'OK:1', v, v = 'OK:1');

    v := pg_temp.np_val(format('select (decided_by = %L and decided_at is not null)::text from public.leave_requests where id = %L', e_qa, r1));
    kq := kq || pg_temp.np_kq('Hệ thống tự ghi người duyệt và ngày duyệt', 'true', v, v = 'true');

    v := pg_temp.np_try(format('update public.leave_requests set status = ''cancelled'', cancel_reason = ''x'' where id = %L', r1));
    kq := kq || pg_temp.np_kq('QL A hủy đơn đã duyệt', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('update public.leave_requests set decision_note = ''sửa'' where id = %L', r1));
    kq := kq || pg_temp.np_kq('QL A sửa ý kiến sau khi đã duyệt', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_val(format('select used_days || ''/'' || remaining_days from public.v_leave_balance where employee_id = %L and year = 2026', e_nv1));
    kq := kq || pg_temp.np_kq('Sau khi duyệt: NV1 đã dùng 2, còn lại 14 − 2 = 12', '2.0/12.0', v, v = '2.0/12.0');

    -- ================= NHÂN VIÊN 1 (sau khi duyệt) =================
    perform pg_temp.np_as(u_nv1);

    v := pg_temp.np_try(format('update public.leave_requests set status = ''cancelled'', cancel_reason = ''x'' where id = %L', r1));
    kq := kq || pg_temp.np_kq('NV1 hủy đơn đã duyệt', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_val(format('select remaining_days from public.v_leave_balance where employee_id = %L and year = 2026', e_nv1));
    kq := kq || pg_temp.np_kq('NV1 xem số phép còn lại của mình', '12.0', v, v = '12.0');

    -- ================= HR =================
    perform pg_temp.np_as(u_hr);

    v := pg_temp.np_val(format('select count(*) from public.employees where id in (%L,%L,%L,%L,%L)', e_hr, e_qa, e_qb, e_nv1, e_nv2));
    kq := kq || pg_temp.np_kq('HR thấy tất cả nhân viên', '5', v, v = '5');

    v := pg_temp.np_try(format('update public.leave_requests set status = ''cancelled'' where id = %L', r1));
    kq := kq || pg_temp.np_kq('HR hủy đơn đã duyệt mà không ghi lý do', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('update public.leave_requests set status = ''cancelled'', cancel_reason = ''NV đi làm lại'' where id = %L', r1));
    kq := kq || pg_temp.np_kq('HR hủy đơn đã duyệt có ghi lý do', 'OK:1', v, v = 'OK:1');

    v := pg_temp.np_val(format('select remaining_days from public.v_leave_balance where employee_id = %L and year = 2026', e_nv1));
    kq := kq || pg_temp.np_kq('Sau khi HR hủy: phép được hoàn lại', '14.0', v, v = '14.0');

    v := pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days, status, reason) values (%L, %s, %L, %L, 2, ''approved'', ''Đơn giấy'')',
                               e_nv2, t_om, '2026-12-03', '2026-12-04'));
    kq := kq || pg_temp.np_kq('HR nhập hộ đơn giấy Nghỉ ốm (Đã duyệt) cho NV2', 'OK:1', v, v = 'OK:1');

    v := pg_temp.np_val(format('select source from public.leave_requests where employee_id = %L and leave_type_id = %s', e_nv2, t_om));
    kq := kq || pg_temp.np_kq('Đơn nhập hộ được đánh dấu nguồn hr_entry', 'hr_entry', v, v = 'hr_entry');

    v := pg_temp.np_val(format('select remaining_days || ''/'' || pending_days from public.v_leave_balance where employee_id = %L and year = 2026', e_nv2));
    kq := kq || pg_temp.np_kq('Nghỉ ốm không trừ phép năm; đơn chờ duyệt chưa trừ (còn 14, chờ 1)', '14.0/1.0', v, v = '14.0/1.0');

    v := pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days, status) values (%L, %s, %L, %L, 1, ''approved'')',
                               e_hr, t_pn, '2026-12-15', '2026-12-15'));
    kq := kq || pg_temp.np_kq('HR tự nhập đơn Đã duyệt cho chính mình', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('update public.employees set user_id = %L where id = %L', u_nv2, e_nv1));
    v := pg_temp.np_val(format('select (user_id = %L)::text from public.employees where id = %L', u_nv1, e_nv1));
    kq := kq || pg_temp.np_kq('HR không gán tay được tài khoản khác cho nhân viên (user_id luôn theo email)', 'true', v, v = 'true');

    v := pg_temp.np_try(format('update public.employees set approver_id = %L where id = %L', e_nv1, e_qa));
    kq := kq || pg_temp.np_kq('Gán người duyệt tạo vòng lặp (QL A ↔ NV1)', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('delete from public.leave_requests where id = %L', r2));
    kq := kq || pg_temp.np_kq('HR xóa đơn (phải hủy, không xóa)', 'bị chặn', v, v = 'OK:0' or v like 'LOI:%');

    v := pg_temp.np_val(format('select (count(*) > 0)::text from public.audit_log where record_id = %L', r1::text));
    kq := kq || pg_temp.np_kq('HR xem nhật ký thao tác của đơn', 'true', v, v = 'true');

    -- ================= TÀI KHOẢN KHÔNG CÓ HỒ SƠ NHÂN VIÊN =================
    perform pg_temp.np_as(u_x);

    v := pg_temp.np_val('select count(*) from public.employees');
    kq := kq || pg_temp.np_kq('Tài khoản lạ (không có hồ sơ NV) không thấy nhân viên nào', '0', v, v = '0');

    v := pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days) values (%L, %s, %L, %L, 1)',
                               e_nv1, t_pn, '2026-12-16', '2026-12-16'));
    kq := kq || pg_temp.np_kq('Tài khoản lạ nộp đơn', 'bị chặn', v, v like 'LOI:%');

    -- ================= KHÁCH CHƯA ĐĂNG NHẬP (anon) =================
    perform pg_temp.np_as(null);
    perform pg_temp.np_as_anon();

    v := pg_temp.np_val('select count(*) from public.employees');
    kq := kq || pg_temp.np_kq('Chưa đăng nhập: đọc bảng nhân viên', 'bị chặn', v, v like 'LOI:%' or v = '0');

    v := pg_temp.np_val('select count(*) from public.leave_types');
    kq := kq || pg_temp.np_kq('Chưa đăng nhập: đọc danh mục loại phép', 'bị chặn', v, v like 'LOI:%' or v = '0');

    -- ================= KIỂM TRA LẠI (quản trị) =================
    perform pg_temp.np_as(null);

    v := pg_temp.np_val(format('select role || ''/'' || must_change_password from public.employees where id = %L', e_nv1));
    kq := kq || pg_temp.np_kq('NV1 vẫn là employee; cờ đổi mật khẩu đã tắt', 'employee/false', v, v = 'employee/false');

    v := pg_temp.np_val(format('select current_year_days from public.leave_balances where employee_id = %L and year = 2026', e_nv1));
    kq := kq || pg_temp.np_kq('Quỹ phép NV1 không bị sửa', '12.0', v, v = '12.0');

    v := pg_temp.np_val(format('select count(*) from public.leave_requests where id in (%L,%L)', r1, r2));
    kq := kq || pg_temp.np_kq('Không đơn nào bị xóa', '2', v, v = '2');

    raise exception 'NP_ROLLBACK';
  exception when others then
    if sqlerrm <> 'NP_ROLLBACK' then
      kq := kq || pg_temp.np_kq('LỖI KỊCH BẢN (dừng giữa chừng)', '-', sqlerrm, false);
    end if;
  end;
  -- Mọi dữ liệu ảo đã được hoàn tác ở đây; chỉ còn lại kết quả trong biến kq.

  insert into np_ket_qua (stt, tinh_huong, mong_doi, thuc_te, dat)
  select ord, x ->> 'ten', x ->> 'mong_doi', x ->> 'thuc_te', (x ->> 'dat')::boolean
  from jsonb_array_elements(kq) with ordinality as t(x, ord);
end $$;

select stt, tinh_huong, mong_doi, thuc_te,
       case when dat then 'ĐẠT' else '>>> KHÔNG ĐẠT' end as ket_qua
from np_ket_qua
union all
select 999, 'TỔNG KẾT', count(*)::text || ' tình huống',
       count(*) filter (where dat)::text || ' đạt',
       case when bool_and(dat) then 'TẤT CẢ ĐẠT' else '>>> CÓ LỖI' end
from np_ket_qua
order by 1;

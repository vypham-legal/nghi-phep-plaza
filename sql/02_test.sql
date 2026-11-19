-- =====================================================================
-- 02_test.sql — Kiểm thử Giai đoạn 2 (đặt lại mật khẩu, quyền HR quản lý dữ liệu gốc).
-- Chạy SAU 02_dat_lai_mat_khau.sql. Tự hoàn tác toàn bộ dữ liệu thử.
-- =====================================================================

create or replace function pg_temp.np_as(p_uid uuid) returns void language plpgsql as $$
begin
  if p_uid is null then
    perform set_config('request.jwt.claims', '', true);
    execute 'reset role';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
end $$;

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
  u_hr  uuid := gen_random_uuid();
  u_nv1 uuid := gen_random_uuid();
  e_hr uuid; e_nv1 uuid; e_nv2 uuid;
  v text;
  v_hash_old text;
begin
  begin
    -- ================= CHUẨN BỊ =================
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    select '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email,
           extensions.crypt('MatKhauCu123', extensions.gen_salt('bf')),
           now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
    from (values (u_hr, 'np.test2.hr@test.invalid'), (u_nv1, 'np.test2.nv1@test.invalid')) as x(id, email);

    insert into public.employees (code, full_name, email, role) values ('zzt2-hr', 'TEST HR', 'np.test2.hr@test.invalid', 'hr') returning id into e_hr;
    insert into public.employees (code, full_name, email, approver_id) values ('zzt2-nv1', 'TEST NV1', 'np.test2.nv1@test.invalid', e_hr) returning id into e_nv1;
    insert into public.employees (code, full_name, email) values ('zzt2-nv2', 'TEST NV2 (chưa có tài khoản)', 'np.test2.nv2@test.invalid') returning id into e_nv2;
    update public.employees set must_change_password = false where id = e_nv1;
    select encrypted_password into v_hash_old from auth.users where id = u_nv1;

    -- ================= NHÂN VIÊN =================
    perform pg_temp.np_as(u_nv1);

    v := pg_temp.np_try(format('select public.hr_reset_password(%L, %L)', e_hr, 'MatKhauMoi123'));
    kq := kq || pg_temp.np_kq('NV đặt lại mật khẩu của HR', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('insert into public.employees (code, full_name) values (%L, %L)', 'ZZT2-X', 'X'));
    kq := kq || pg_temp.np_kq('NV thêm nhân viên', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('insert into public.leave_balances (employee_id, year, current_year_days) values (%L, 2026, 99)', e_nv1));
    kq := kq || pg_temp.np_kq('NV tự tạo quỹ phép cho mình', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try('insert into public.leave_types (name) values (''Loại phép giả'')');
    kq := kq || pg_temp.np_kq('NV thêm loại phép', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_val('select count(*) from public.leave_types');
    kq := kq || pg_temp.np_kq('NV xem được danh mục loại phép (để chọn khi nộp đơn)', '≥ 9', v, v ~ '^[0-9]+$' and v::int >= 9);

    -- ================= HR =================
    perform pg_temp.np_as(u_hr);

    v := pg_temp.np_try(format('select public.hr_reset_password(%L, %L)', e_nv1, 'ngan1'));
    kq := kq || pg_temp.np_kq('HR đặt mật khẩu tạm quá ngắn', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('select public.hr_reset_password(%L, %L)', e_nv1, 'chikhongcoso'));
    kq := kq || pg_temp.np_kq('HR đặt mật khẩu tạm không có số', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('select public.hr_reset_password(%L, %L)', e_hr, 'MatKhauMoi123'));
    kq := kq || pg_temp.np_kq('HR dùng chức năng đặt lại cho chính mình', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('select public.hr_reset_password(%L, %L)', e_nv2, 'MatKhauMoi123'));
    kq := kq || pg_temp.np_kq('HR đặt lại cho NV chưa có tài khoản', 'báo lỗi rõ ràng', v, v like 'LOI:%chưa có tài khoản%');

    v := pg_temp.np_try(format('select public.hr_reset_password(%L, %L)', e_nv1, 'MatKhauMoi123'));
    kq := kq || pg_temp.np_kq('HR đặt lại mật khẩu tạm cho NV1', 'OK:1', v, v = 'OK:1');

    v := pg_temp.np_val(format('select must_change_password::text from public.employees where id = %L', e_nv1));
    kq := kq || pg_temp.np_kq('Sau khi đặt lại: NV1 bắt buộc đổi mật khẩu', 'true', v, v = 'true');

    v := pg_temp.np_val(format('select count(*) from public.audit_log where action = ''RESET_PASSWORD'' and record_id = %L', e_nv1::text));
    kq := kq || pg_temp.np_kq('Có ghi nhật ký đặt lại mật khẩu', '1', v, v = '1');

    v := pg_temp.np_try(format('insert into public.employees (code, full_name, email) values (%L, %L, %L)', 'zzt2-nv3', 'TEST NV3', 'np.test2.nv3@test.invalid'));
    kq := kq || pg_temp.np_kq('HR thêm nhân viên', 'OK:1', v, v = 'OK:1');

    v := pg_temp.np_try(format('insert into public.employees (code, full_name) values (%L, %L)', 'ZZT2-NV1', 'Trùng mã'));
    kq := kq || pg_temp.np_kq('HR thêm nhân viên trùng Mã NV', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('insert into public.leave_balances (employee_id, year, standard_days, current_year_days, carried_over_days) values (%L, 2026, 12, 12, 1.5) on conflict (employee_id, year) do update set carried_over_days = excluded.carried_over_days', e_nv1));
    kq := kq || pg_temp.np_kq('HR tạo / cập nhật quỹ phép (upsert)', 'OK:1', v, v = 'OK:1');

    v := pg_temp.np_try(format('update public.leave_balances set bonus_days = 0.3 where employee_id = %L and year = 2026', e_nv1));
    kq := kq || pg_temp.np_kq('Quỹ phép 0,3 ngày (không phải bước 0,5)', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_try(format('update public.leave_balances set seniority_days = -1 where employee_id = %L and year = 2026', e_nv1));
    kq := kq || pg_temp.np_kq('Quỹ phép số âm', 'bị chặn', v, v like 'LOI:%');

    v := pg_temp.np_val(format('select total_days || ''/'' || remaining_days from public.v_leave_balance where employee_id = %L and year = 2026', e_nv1));
    kq := kq || pg_temp.np_kq('(7) = 12 + 1,5 = 13,5; (9) = 13,5', '13.5/13.5', v, v = '13.5/13.5');

    v := pg_temp.np_try('update public.leave_types set sort_order = sort_order where name = ''Phép năm''');
    kq := kq || pg_temp.np_kq('HR sửa loại phép', 'OK:1', v, v = 'OK:1');

    -- ================= KIỂM TRA LẠI =================
    perform pg_temp.np_as(null);

    v := pg_temp.np_val(format('select (encrypted_password <> %L and encrypted_password = extensions.crypt(%L, encrypted_password))::text from auth.users where id = %L',
                               v_hash_old, 'MatKhauMoi123', u_nv1));
    kq := kq || pg_temp.np_kq('Mật khẩu NV1 đã đổi thành mật khẩu tạm mới', 'true', v, v = 'true');

    raise exception 'NP_ROLLBACK';
  exception when others then
    if sqlerrm <> 'NP_ROLLBACK' then
      kq := kq || pg_temp.np_kq('LỖI KỊCH BẢN (dừng giữa chừng)', '-', sqlerrm, false);
    end if;
  end;

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

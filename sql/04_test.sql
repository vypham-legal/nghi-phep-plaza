-- =====================================================================
-- 04_test.sql — Kiểm thử Giai đoạn 3: tên người liên quan, quyền file đính kèm.
-- Chạy SAU 04_don_nghi_phep.sql. Tự hoàn tác toàn bộ dữ liệu thử.
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

create or replace function pg_temp.np_val(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, '(trống)');
exception when others then
  return 'LOI:' || sqlerrm;
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

create or replace function pg_temp.np_kq(p_ten text, p_mong_doi text, p_thuc_te text, p_dat boolean)
returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'ten', p_ten, 'mong_doi', p_mong_doi, 'thuc_te', p_thuc_te, 'dat', coalesce(p_dat, false)))
$$;

create temp table if not exists np_ket_qua (stt int, tinh_huong text, mong_doi text, thuc_te text, dat boolean);
truncate np_ket_qua;

do $$
declare
  kq jsonb := '[]';
  u_hr uuid := gen_random_uuid(); u_gs uuid := gen_random_uuid();
  u_n1 uuid := gen_random_uuid(); u_n2 uuid := gen_random_uuid();
  e_hr uuid; e_gs uuid; e_n1 uuid; e_n2 uuid;
  t_pn int; r1 uuid; r2 uuid;
  v text;
begin
  begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    select '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email, '',
           now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
    from (values (u_hr, 'np.t4.hr@test.invalid'), (u_gs, 'np.t4.gs@test.invalid'),
                 (u_n1, 'np.t4.n1@test.invalid'), (u_n2, 'np.t4.n2@test.invalid')) as x(id, email);

    insert into public.employees (code, full_name, email, role) values ('zzt4-hr', 'TEST4 HR', 'np.t4.hr@test.invalid', 'hr') returning id into e_hr;
    insert into public.employees (code, full_name, email, title) values ('zzt4-gs', 'TEST4 GIÁM SÁT', 'np.t4.gs@test.invalid', 'supervisor') returning id into e_gs;
    insert into public.employees (code, full_name, email, approver_id) values ('zzt4-n1', 'TEST4 NV1', 'np.t4.n1@test.invalid', e_gs) returning id into e_n1;
    insert into public.employees (code, full_name, email) values ('zzt4-n2', 'TEST4 NV2', 'np.t4.n2@test.invalid') returning id into e_n2;
    select id into t_pn from public.leave_types where name = 'Phép năm';

    -- NV1 nộp, GS duyệt; NV2 nộp, HR hủy
    perform pg_temp.np_as(u_n1);
    perform pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days) values (%L, %s, %L, %L, 1)', e_n1, t_pn, '2026-12-07', '2026-12-07'));
    select id into r1 from public.leave_requests where employee_id = e_n1 limit 1;
    perform pg_temp.np_as(u_gs);
    perform pg_temp.np_try(format('update public.leave_requests set status = ''approved'' where id = %L', r1));
    perform pg_temp.np_as(u_n2);
    perform pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days) values (%L, %s, %L, %L, 1)', e_n2, t_pn, '2026-12-08', '2026-12-08'));
    select id into r2 from public.leave_requests where employee_id = e_n2 limit 1;

    -- ===== Tên người liên quan =====
    perform pg_temp.np_as(u_n1);
    v := pg_temp.np_val(format('select (count(*) filter (where id = %L))::text || ''/'' || (count(*) filter (where id = %L))::text from public.leave_request_people()', e_gs, e_n2));
    kq := kq || pg_temp.np_kq('NV1 thấy tên Giám sát đã duyệt đơn mình, không thấy NV2', '1/0', v, v = '1/0');

    v := pg_temp.np_val(format('select count(*) from public.employees where id = %L', e_gs));
    kq := kq || pg_temp.np_kq('NV1 vẫn xem được hồ sơ người duyệt của mình (như trước)', '1', v, v = '1');

    perform pg_temp.np_as(u_n2);
    v := pg_temp.np_val(format('select count(*) from public.leave_request_people() where id in (%L, %L)', e_n1, e_gs));
    kq := kq || pg_temp.np_kq('NV2 không thấy tên NV1 / Giám sát (không liên quan đơn của NV2)', '0', v, v = '0');

    perform pg_temp.np_as(u_hr);
    v := pg_temp.np_try(format('update public.leave_requests set status = ''cancelled'', cancel_reason = ''test'' where id = %L', r2));
    perform pg_temp.np_as(u_n2);
    v := pg_temp.np_val(format('select count(*) from public.leave_request_people() where id = %L', e_hr));
    kq := kq || pg_temp.np_kq('NV2 thấy tên HR đã hủy đơn của mình', '1', v, v = '1');

    -- ===== Quyền file đính kèm (hàm dùng trong chính sách Storage) =====
    perform pg_temp.np_as(u_n1);
    v := pg_temp.np_val(format('select public.can_manage_attachment(%L)::text', e_n1 || '/' || r1 || '/a.pdf'));
    kq := kq || pg_temp.np_kq('NV1 thêm file vào đơn ĐÃ DUYỆT của mình', 'false', v, v = 'false');

    perform pg_temp.np_as(u_n2);
    v := pg_temp.np_val(format('select public.can_manage_attachment(%L)::text', e_n1 || '/' || r1 || '/a.pdf'));
    kq := kq || pg_temp.np_kq('NV2 thêm file vào đơn của NV1', 'false', v, v = 'false');
    v := pg_temp.np_val(format('select public.can_view_employee(%L)::text', e_n1));
    kq := kq || pg_temp.np_kq('NV2 xem file đính kèm của NV1', 'false', v, v = 'false');

    perform pg_temp.np_as(u_gs);
    v := pg_temp.np_val(format('select public.can_view_employee(%L)::text', e_n1));
    kq := kq || pg_temp.np_kq('Giám sát (người duyệt) xem được file của NV1', 'true', v, v = 'true');

    perform pg_temp.np_as(u_hr);
    v := pg_temp.np_val(format('select public.can_manage_attachment(%L)::text', e_n1 || '/' || r1 || '/a.pdf'));
    kq := kq || pg_temp.np_kq('HR thêm file vào đơn đã duyệt (bổ sung giấy tờ)', 'true', v, v = 'true');

    -- NV1 nộp đơn mới (chờ duyệt) → được thêm file
    perform pg_temp.np_as(u_n1);
    perform pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days) values (%L, %s, %L, %L, 0.5)', e_n1, t_pn, '2026-12-14', '2026-12-14'));
    select id into r2 from public.leave_requests where employee_id = e_n1 and status = 'pending' limit 1;
    v := pg_temp.np_val(format('select public.can_manage_attachment(%L)::text', e_n1 || '/' || r2 || '/giay.jpg'));
    kq := kq || pg_temp.np_kq('NV1 thêm file vào đơn đang chờ duyệt của mình', 'true', v, v = 'true');
    v := pg_temp.np_val(format('select public.can_manage_attachment(%L)::text', e_n2 || '/' || r2 || '/giay.jpg'));
    kq := kq || pg_temp.np_kq('Đường dẫn file giả mạo (sai thư mục nhân viên)', 'false', v, v = 'false');

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

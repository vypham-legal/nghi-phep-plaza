-- =====================================================================
-- 03_test.sql — Kiểm thử chức danh & quyền duyệt. Chạy SAU 03_chuc_danh.sql.
-- Tự hoàn tác toàn bộ dữ liệu thử.
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
  kq jsonb := '[]';
  u_hr uuid := gen_random_uuid(); u_gs uuid := gen_random_uuid(); u_ql uuid := gen_random_uuid();
  u_hq uuid := gen_random_uuid(); u_n1 uuid := gen_random_uuid(); u_n2 uuid := gen_random_uuid(); u_n3 uuid := gen_random_uuid();
  e_hr uuid; e_gs uuid; e_ql uuid; e_hq uuid; e_n1 uuid; e_n2 uuid; e_n3 uuid;
  t_pn int; r1 uuid; r2 uuid; r3 uuid;
  v text;
begin
  begin
    -- ================= CHUẨN BỊ =================
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    select '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email, '',
           now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
    from (values (u_hr, 'np.t3.hr@test.invalid'), (u_gs, 'np.t3.gs@test.invalid'), (u_ql, 'np.t3.ql@test.invalid'),
                 (u_hq, 'np.t3.hq@test.invalid'), (u_n1, 'np.t3.n1@test.invalid'), (u_n2, 'np.t3.n2@test.invalid'),
                 (u_n3, 'np.t3.n3@test.invalid')) as x(id, email);

    insert into public.employees (code, full_name, email, role) values ('zzt3-hr', 'TEST HR (chức danh Nhân viên)', 'np.t3.hr@test.invalid', 'hr') returning id into e_hr;
    insert into public.employees (code, full_name, email, title) values ('zzt3-gs', 'TEST GIÁM SÁT', 'np.t3.gs@test.invalid', 'supervisor') returning id into e_gs;
    insert into public.employees (code, full_name, email, title) values ('zzt3-ql', 'TEST QUẢN LÝ', 'np.t3.ql@test.invalid', 'manager') returning id into e_ql;
    insert into public.employees (code, full_name, email, role, title) values ('zzt3-hq', 'TEST HR KIÊM QUẢN LÝ', 'np.t3.hq@test.invalid', 'hr', 'manager') returning id into e_hq;
    insert into public.employees (code, full_name, email, approver_id) values ('zzt3-n1', 'TEST NV1', 'np.t3.n1@test.invalid', e_gs) returning id into e_n1;
    insert into public.employees (code, full_name, email, approver_id) values ('zzt3-n2', 'TEST NV2', 'np.t3.n2@test.invalid', e_hq) returning id into e_n2;
    insert into public.employees (code, full_name, email) values ('zzt3-n3', 'TEST NV3', 'np.t3.n3@test.invalid') returning id into e_n3;
    update public.employees set approver_id = e_ql where id in (e_gs, e_hr);
    select id into t_pn from public.leave_types where name = 'Phép năm';

    v := pg_temp.np_try(format('insert into public.employees (code, full_name, title) values (%L, %L, %L)', 'ZZT3-X', 'X', 'boss'));
    kq := kq || pg_temp.np_kq('Chức danh không hợp lệ ("boss")', 'bị chặn', v, v like 'LOI:%');

    -- ================= HR gán người duyệt =================
    perform pg_temp.np_as(u_hr);

    v := pg_temp.np_try(format('update public.employees set approver_id = %L where id = %L', e_n1, e_n3));
    kq := kq || pg_temp.np_kq('Gán người duyệt là Nhân viên thường', 'bị chặn', v, v like 'LOI:%chức danh%');

    v := pg_temp.np_try(format('update public.employees set approver_id = %L where id = %L', e_gs, e_n3));
    kq := kq || pg_temp.np_kq('Gán người duyệt là Giám sát trực tiếp', 'OK:1', v, v = 'OK:1');
    perform pg_temp.np_try(format('update public.employees set approver_id = null where id = %L', e_n3));

    v := pg_temp.np_try(format('update public.employees set title = ''employee'' where id = %L', e_gs));
    kq := kq || pg_temp.np_kq('Hạ Giám sát (đang duyệt cho NV1) xuống Nhân viên', 'bị chặn', v, v like 'LOI:%người duyệt của%');

    v := pg_temp.np_try(format('insert into public.employees (code, full_name, title) values (%L, %L, %L)', 'ZZT3-Y', 'Y', 'supervisor'));
    kq := kq || pg_temp.np_kq('HR thêm người có chức danh Giám sát', 'OK:1', v, v = 'OK:1');

    v := pg_temp.np_try(format('update public.employees set title = ''employee'' where code = %L', 'ZZT3-Y'));
    kq := kq || pg_temp.np_kq('Hạ Giám sát không duyệt cho ai xuống Nhân viên', 'OK:1', v, v = 'OK:1');

    v := pg_temp.np_try(format('update public.employees set is_active = false where id = %L', e_ql));
    v := pg_temp.np_try(format('update public.employees set approver_id = %L where id = %L', e_ql, e_n3));
    kq := kq || pg_temp.np_kq('Gán người duyệt đã nghỉ việc', 'bị chặn', v, v like 'LOI:%');
    perform pg_temp.np_try(format('update public.employees set is_active = true where id = %L', e_ql));

    -- ================= Nộp đơn =================
    perform pg_temp.np_as(u_n1);
    perform pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days) values (%L, %s, %L, %L, 1)', e_n1, t_pn, '2026-12-07', '2026-12-07'));
    select id into r1 from public.leave_requests where employee_id = e_n1 limit 1;
    perform pg_temp.np_as(u_n2);
    perform pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days) values (%L, %s, %L, %L, 1)', e_n2, t_pn, '2026-12-08', '2026-12-08'));
    select id into r2 from public.leave_requests where employee_id = e_n2 limit 1;
    perform pg_temp.np_as(u_n3);
    perform pg_temp.np_try(format('insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days) values (%L, %s, %L, %L, 1)', e_n3, t_pn, '2026-12-09', '2026-12-09'));
    select id into r3 from public.leave_requests where employee_id = e_n3 limit 1;
    kq := kq || pg_temp.np_kq('Chuẩn bị: 3 nhân viên nộp đơn', '3 đơn', (r1 is not null)::text || '/' || (r2 is not null)::text || '/' || (r3 is not null)::text,
                              r1 is not null and r2 is not null and r3 is not null);

    -- ================= Duyệt =================
    perform pg_temp.np_as(u_ql);
    v := pg_temp.np_val(format('select count(*) from public.leave_requests where id = %L', r1));
    kq := kq || pg_temp.np_kq('Quản lý khác không thấy đơn của NV1', '0', v, v = '0');
    v := pg_temp.np_try(format('update public.leave_requests set status = ''approved'' where id = %L', r1));
    kq := kq || pg_temp.np_kq('Quản lý khác (không được gán) duyệt đơn NV1', 'không duyệt được', v, v = 'OK:0' or v like 'LOI:%');

    perform pg_temp.np_as(u_gs);
    v := pg_temp.np_try(format('update public.leave_requests set status = ''approved'' where id = %L', r1));
    kq := kq || pg_temp.np_kq('Giám sát trực tiếp duyệt đơn NV1', 'OK:1', v, v = 'OK:1');

    perform pg_temp.np_as(u_hq);
    v := pg_temp.np_try(format('update public.leave_requests set status = ''approved'' where id = %L', r2));
    kq := kq || pg_temp.np_kq('HR kiêm Quản lý duyệt đơn NV2 (người mình duyệt)', 'OK:1', v, v = 'OK:1');

    perform pg_temp.np_as(u_hr);
    v := pg_temp.np_try(format('update public.leave_requests set status = ''approved'' where id = %L', r3));
    kq := kq || pg_temp.np_kq('HR (chức danh Nhân viên) duyệt thay đơn NV3', 'OK:1', v, v = 'OK:1');

    -- ================= Dữ liệu thật (quản trị) =================
    perform pg_temp.np_as(null);
    v := pg_temp.np_val('select count(*) from public.employees e join public.employees a on a.id = e.approver_id where a.title not in (''supervisor'',''manager'') and e.code not like ''ZZT%''');
    kq := kq || pg_temp.np_kq('Dữ liệu thật: không ai có người duyệt mang chức danh Nhân viên', '0', v, v = '0');

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

-- =====================================================================
-- 03_chuc_danh.sql — Chức danh & quyền duyệt đơn. Chạy SAU 01, 01b, 02.
-- Chạy lại nhiều lần vẫn an toàn.
--   • Chức danh (title): employee = Nhân viên, supervisor = Giám sát trực tiếp, manager = Quản lý.
--   • Quyền HR vẫn là cột role ('hr'), độc lập với chức danh (cho phép kiêm nhiệm).
--   • Người duyệt của một nhân viên phải có chức danh Quản lý hoặc Giám sát trực tiếp.
--   • Chỉ Quản lý / Giám sát trực tiếp (được gán) và HR (duyệt thay) mới duyệt được đơn.
-- =====================================================================

-- 1. Cột chức danh
alter table public.employees
  add column if not exists title text not null default 'employee';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_title_check') then
    alter table public.employees
      add constraint employees_title_check check (title in ('employee', 'supervisor', 'manager'));
  end if;
end $$;

comment on column public.employees.title is 'Chức danh: employee = Nhân viên, supervisor = Giám sát trực tiếp, manager = Quản lý.';

-- 2. Ai đang là người duyệt của người khác → tạm đặt chức danh Quản lý (HR chỉnh lại Giám sát nếu cần)
update public.employees e
   set title = 'manager'
 where e.title = 'employee'
   and exists (select 1 from public.employees x where x.approver_id = e.id);

-- 3. Người đang đăng nhập có phải người duyệt (QL/GS) của nhân viên p_employee?
create or replace function public.is_approver_of(p_employee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.employees e
    join public.employees me on me.id = e.approver_id
    where e.id = p_employee
      and me.user_id = auth.uid()
      and me.is_active
      and me.title in ('supervisor', 'manager'))
$$;

-- 4. Trigger employees: thêm kiểm tra chức danh người duyệt
create or replace function public.trg_employees_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_cur uuid;
  v_i   int := 0;
  v_n   int;
begin
  new.code  := upper(trim(new.code));
  new.email := nullif(lower(trim(new.email)), '');
  new.full_name := trim(new.full_name);

  if new.email is null then
    new.user_id := null;
  else
    select u.id into new.user_id
    from auth.users u
    where lower(u.email) = new.email
    order by u.created_at
    limit 1;
  end if;

  -- Người duyệt phải là Quản lý / Giám sát trực tiếp đang làm việc
  if new.approver_id is not null
     and (tg_op = 'INSERT' or new.approver_id is distinct from old.approver_id) then
    if not exists (select 1 from public.employees a
                   where a.id = new.approver_id and a.is_active and a.title in ('supervisor', 'manager')) then
      raise exception 'Người duyệt phải có chức danh Quản lý hoặc Giám sát trực tiếp và đang làm việc.';
    end if;
  end if;

  -- Không hạ chức danh xuống Nhân viên khi còn đang là người duyệt của người khác
  if tg_op = 'UPDATE' and new.title = 'employee' and old.title <> 'employee' then
    select count(*) into v_n from public.employees x
    where x.approver_id = new.id and x.id <> new.id and x.is_active;
    if v_n > 0 then
      raise exception 'Người này đang là người duyệt của % nhân viên. Hãy gán người duyệt khác cho họ trước khi đổi chức danh.', v_n;
    end if;
  end if;

  -- Chặn vòng lặp người duyệt
  v_cur := new.approver_id;
  while v_cur is not null and v_i < 50 loop
    if v_cur = new.id then
      raise exception 'Người duyệt bị vòng lặp (A duyệt B, B lại duyệt A).';
    end if;
    select e.approver_id into v_cur from public.employees e where e.id = v_cur;
    v_i := v_i + 1;
  end loop;

  new.updated_at := now();
  return new;
end $$;

-- (trigger employees_before đã trỏ tới hàm này từ 01_schema.sql; tạo lại cho chắc)
drop trigger if exists employees_before on public.employees;
create trigger employees_before
  before insert or update on public.employees
  for each row execute function public.trg_employees_before();

revoke execute on function public.trg_employees_before() from public, anon, authenticated;

select 'OK: đã thêm chức danh và ràng buộc người duyệt' as ket_qua,
       (select count(*) from public.employees where title = 'manager') as so_nguoi_dat_quan_ly;

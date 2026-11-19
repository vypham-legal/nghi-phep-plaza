-- =====================================================================
-- 01_schema.sql — Giai đoạn 1: bảng, hàm phân quyền, trigger, RLS,
-- Storage, view số dư phép, danh mục loại phép.
-- Chạy trong Supabase > SQL Editor. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. BẢNG
-- ---------------------------------------------------------------------

-- Nhân viên (cũng là danh sách tài khoản, vai trò, người duyệt)
create table if not exists public.employees (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,                 -- Mã NV
  full_name             text not null,                        -- Họ và tên
  position              text,                                 -- Vị trí công việc
  email                 text unique,                          -- email đăng nhập (chữ thường)
  role                  text not null default 'employee'
                        check (role in ('employee', 'hr')),   -- "quản lý" = người được gán làm người duyệt
  approver_id           uuid references public.employees(id) on delete set null,
  is_active             boolean not null default true,        -- false = đã nghỉ việc
  user_id               uuid unique references auth.users(id) on delete set null, -- tự gắn theo email
  must_change_password  boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint employees_not_self_approver check (approver_id is null or approver_id <> id)
);
comment on column public.employees.user_id is 'Tự gắn với auth.users theo email; không nhập tay.';

-- Danh mục loại phép
create table if not exists public.leave_types (
  id               int generated always as identity primary key,
  name             text not null unique,
  sort_order       int  not null default 100,
  deducts_balance  boolean not null default false,   -- true: trừ quỹ phép năm (chỉ "Phép năm")
  is_active        boolean not null default true
);

-- Quỹ phép theo năm (HR nhập); (7), (8), (9) tính trong view, không lưu
create table if not exists public.leave_balances (
  employee_id        uuid not null references public.employees(id) on delete cascade,
  year               int  not null check (year between 2000 and 2100),
  standard_days      numeric(5,1) not null default 12 check (standard_days >= 0 and standard_days * 2 = trunc(standard_days * 2)),        -- (1)
  current_year_days  numeric(5,1) not null default 0  check (current_year_days >= 0 and current_year_days * 2 = trunc(current_year_days * 2)), -- (2)
  carried_over_days  numeric(5,1) not null default 0  check (carried_over_days >= 0 and carried_over_days * 2 = trunc(carried_over_days * 2)), -- (3)
  seniority_days     numeric(5,1) not null default 0  check (seniority_days >= 0 and seniority_days * 2 = trunc(seniority_days * 2)),       -- (4)
  bonus_days         numeric(5,1) not null default 0  check (bonus_days >= 0 and bonus_days * 2 = trunc(bonus_days * 2)),                   -- (5)
  cancelled_days     numeric(5,1) not null default 0  check (cancelled_days >= 0 and cancelled_days * 2 = trunc(cancelled_days * 2)),       -- (6)
  updated_at         timestamptz not null default now(),
  primary key (employee_id, year)
);

-- Đơn nghỉ phép
create sequence if not exists public.leave_request_code_seq;

create table if not exists public.leave_requests (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,                -- Mã đơn (trigger tự sinh NP-000001)
  employee_id    uuid not null references public.employees(id),
  leave_type_id  int  not null references public.leave_types(id),
  start_date     date not null,                       -- Từ ngày (quyết định tháng/năm tính phép)
  end_date       date not null,                       -- Đến ngày
  days           numeric(4,1) not null,               -- Số ngày (bước 0,5)
  reason         text,
  handover_to    text,                                -- Người nhận bàn giao
  status         text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  source         text not null default 'app'
                 check (source in ('app', 'hr_entry', 'import')),
  submitted_at   timestamptz not null default now(),  -- Ngày nộp
  created_by     uuid references public.employees(id),
  decided_by     uuid references public.employees(id),-- Người duyệt
  decided_at     timestamptz,                         -- Ngày duyệt
  decision_note  text,                                -- Ý kiến người duyệt
  cancelled_by   uuid references public.employees(id),
  cancelled_at   timestamptz,
  cancel_reason  text,
  constraint leave_requests_dates_order check (end_date >= start_date),
  constraint leave_requests_same_month check (
    extract(year from start_date) = extract(year from end_date)
    and extract(month from start_date) = extract(month from end_date)),
  constraint leave_requests_days_step check (days > 0 and days * 2 = trunc(days * 2)),
  constraint leave_requests_days_max check (days <= (end_date - start_date + 1))
);
create index if not exists leave_requests_employee_idx on public.leave_requests (employee_id, start_date);
create index if not exists leave_requests_status_idx   on public.leave_requests (status);

-- Nhật ký thao tác
create table if not exists public.audit_log (
  id                 bigint generated always as identity primary key,
  at                 timestamptz not null default now(),
  actor_user_id      uuid,
  actor_employee_id  uuid,
  table_name         text not null,
  record_id          text,
  action             text not null,
  old_data           jsonb,
  new_data           jsonb
);
create index if not exists audit_log_record_idx on public.audit_log (table_name, record_id);

-- ---------------------------------------------------------------------
-- 2. HÀM PHÂN QUYỀN (security definer: đọc employees không bị RLS chặn)
-- ---------------------------------------------------------------------

create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select e.id from public.employees e
  where e.user_id = auth.uid() and e.is_active
  limit 1
$$;

create or replace function public.is_hr()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.user_id = auth.uid() and e.is_active and e.role = 'hr')
$$;

-- Người đang đăng nhập có phải người duyệt của nhân viên p_employee?
create or replace function public.is_approver_of(p_employee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee
      and e.approver_id is not null
      and e.approver_id = public.current_employee_id())
$$;

create or replace function public.my_approver_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select e.approver_id from public.employees e
  where e.id = public.current_employee_id()
$$;

-- Được xem dữ liệu của nhân viên p_employee: chính mình, người duyệt trực tiếp, HR
create or replace function public.can_view_employee(p_employee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_employee is not null and (
    p_employee = public.current_employee_id()
    or public.is_hr()
    or public.is_approver_of(p_employee))
$$;

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- Ngữ cảnh quản trị (SQL Editor), không phải yêu cầu từ web.
-- Yêu cầu từ web luôn mang JWT có "role" (anon/authenticated) nên không lọt vào đây.
create or replace function public.is_admin_context()
returns boolean language sql stable set search_path = '' as $$
  select auth.uid() is null
     and (coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role') is null
$$;

-- Nhân viên tự đánh dấu đã đổi mật khẩu lần đầu
create or replace function public.mark_password_changed()
returns void language sql volatile security definer set search_path = '' as $$
  update public.employees set must_change_password = false
  where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 3. TRIGGER
-- ---------------------------------------------------------------------

-- employees: chuẩn hóa, tự gắn user_id theo email, chặn vòng lặp người duyệt
create or replace function public.trg_employees_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_cur uuid;
  v_i   int := 0;
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

drop trigger if exists employees_before on public.employees;
create trigger employees_before
  before insert or update on public.employees
  for each row execute function public.trg_employees_before();

-- auth.users: khi HR tạo tài khoản, tự gắn vào nhân viên có cùng email
create or replace function public.trg_auth_user_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.employees
     set user_id = new.id
   where email = lower(new.email) and user_id is null;
  return new;
end $$;

drop trigger if exists np_on_auth_user_created on auth.users;
create trigger np_on_auth_user_created
  after insert on auth.users
  for each row execute function public.trg_auth_user_link();

-- leave_balances: cập nhật thời điểm sửa
create or replace function public.trg_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists leave_balances_touch on public.leave_balances;
create trigger leave_balances_touch
  before update on public.leave_balances
  for each row execute function public.trg_touch_updated_at();

-- leave_requests: quy tắc nộp / duyệt / hủy (chặn ở DB, không phụ thuộc giao diện)
create or replace function public.trg_leave_requests_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid    := public.current_employee_id();
  v_hr boolean := public.is_hr();
begin
  -- Mã đơn: hệ thống tự sinh; chỉ HR / SQL Editor được giữ mã có sẵn (vd CU-2026-01-NV02)
  if tg_op = 'INSERT' and (nullif(trim(new.code), '') is null or not (v_hr or public.is_admin_context())) then
    new.code := 'NP-' || to_char(nextval('public.leave_request_code_seq'), 'FM000000');
  end if;

  if public.is_admin_context() then
    return new;                                   -- SQL Editor: không kiểm tra
  end if;

  if v_me is null then
    raise exception 'Tài khoản chưa được gắn với nhân viên đang làm việc.';
  end if;

  -- ---------- NỘP ĐƠN ----------
  if tg_op = 'INSERT' then
    new.created_by   := v_me;
    new.submitted_at := now();
    new.cancelled_by := null; new.cancelled_at := null; new.cancel_reason := null;

    if not exists (select 1 from public.leave_types t where t.id = new.leave_type_id and t.is_active) then
      raise exception 'Loại phép không hợp lệ hoặc đã ngừng sử dụng.';
    end if;

    if not v_hr then
      if new.employee_id is distinct from v_me then
        raise exception 'Chỉ được nộp đơn cho chính mình.';
      end if;
      if new.status <> 'pending' then
        raise exception 'Đơn mới phải ở trạng thái Chờ duyệt.';
      end if;
      new.source := 'app';
      new.decided_by := null; new.decided_at := null; new.decision_note := null;
    else
      if not exists (select 1 from public.employees e where e.id = new.employee_id and e.is_active) then
        raise exception 'Nhân viên không tồn tại hoặc đã nghỉ việc.';
      end if;
      if new.status not in ('pending', 'approved') then
        raise exception 'HR chỉ nhập đơn ở trạng thái Chờ duyệt hoặc Đã duyệt.';
      end if;
      if new.employee_id <> v_me and new.source = 'app' then
        new.source := 'hr_entry';
      end if;
      if new.status = 'approved' then
        if new.employee_id = v_me then
          raise exception 'Không được tự nhập đơn Đã duyệt cho chính mình.';
        end if;
        new.decided_by := coalesce(new.decided_by, v_me);
        new.decided_at := coalesce(new.decided_at, now());
      else
        new.decided_by := null; new.decided_at := null; new.decision_note := null;
      end if;
    end if;
    return new;
  end if;

  -- ---------- CẬP NHẬT ----------
  if new.id <> old.id or new.code <> old.code or new.created_by is distinct from old.created_by
     or new.submitted_at <> old.submitted_at or new.source <> old.source then
    raise exception 'Không được sửa mã đơn, người tạo, ngày nộp, nguồn đơn.';
  end if;

  if (new.employee_id, new.leave_type_id, new.start_date, new.end_date, new.days, new.reason, new.handover_to)
     is distinct from
     (old.employee_id, old.leave_type_id, old.start_date, old.end_date, old.days, old.reason, old.handover_to) then
    if not (v_hr and old.status = 'pending' and new.status = 'pending') then
      raise exception 'Không được sửa nội dung đơn (chỉ HR sửa được khi đơn còn Chờ duyệt).';
    end if;
  end if;

  if new.status = old.status then
    if (new.decided_by, new.decided_at, new.decision_note, new.cancelled_by, new.cancelled_at, new.cancel_reason)
       is distinct from
       (old.decided_by, old.decided_at, old.decision_note, old.cancelled_by, old.cancelled_at, old.cancel_reason) then
      raise exception 'Không được sửa thông tin duyệt/hủy.';
    end if;
    return new;
  end if;

  if old.status = 'pending' and new.status = 'cancelled' then
    if not (new.employee_id = v_me or v_hr) then
      raise exception 'Chỉ người nộp hoặc HR được hủy đơn đang chờ duyệt.';
    end if;
    new.decided_by := old.decided_by; new.decided_at := old.decided_at; new.decision_note := old.decision_note;
    new.cancelled_by := v_me; new.cancelled_at := now();
    new.cancel_reason := nullif(trim(new.cancel_reason), '');

  elsif old.status = 'pending' and new.status in ('approved', 'rejected') then
    if new.employee_id = v_me then
      raise exception 'Không được tự duyệt đơn của chính mình.';
    end if;
    if not (public.is_approver_of(new.employee_id) or v_hr) then
      raise exception 'Bạn không phải người duyệt của nhân viên này.';
    end if;
    if new.status = 'rejected' and coalesce(trim(new.decision_note), '') = '' then
      raise exception 'Từ chối đơn phải ghi ý kiến.';
    end if;
    new.decided_by := v_me; new.decided_at := now();
    new.decision_note := nullif(trim(new.decision_note), '');
    new.cancelled_by := null; new.cancelled_at := null; new.cancel_reason := null;

  elsif old.status = 'approved' and new.status = 'cancelled' then
    if not v_hr then
      raise exception 'Chỉ HR được hủy đơn đã duyệt.';
    end if;
    if coalesce(trim(new.cancel_reason), '') = '' then
      raise exception 'Hủy đơn đã duyệt phải ghi lý do.';
    end if;
    new.decided_by := old.decided_by; new.decided_at := old.decided_at; new.decision_note := old.decision_note;
    new.cancelled_by := v_me; new.cancelled_at := now();
    new.cancel_reason := trim(new.cancel_reason);

  else
    raise exception 'Không được chuyển trạng thái đơn từ "%" sang "%".', old.status, new.status;
  end if;

  return new;
end $$;

drop trigger if exists leave_requests_guard on public.leave_requests;
create trigger leave_requests_guard
  before insert or update on public.leave_requests
  for each row execute function public.trg_leave_requests_guard();

-- Nhật ký: ghi mọi thêm/sửa/xóa trên các bảng chính
create or replace function public.trg_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_rec jsonb := coalesce(v_new, v_old);
begin
  insert into public.audit_log (actor_user_id, actor_employee_id, table_name, record_id, action, old_data, new_data)
  values (auth.uid(), public.current_employee_id(), tg_table_name,
          coalesce(v_rec ->> 'id', (v_rec ->> 'employee_id') || ':' || (v_rec ->> 'year')),
          tg_op, v_old, v_new);
  return null;
end $$;

drop trigger if exists audit_employees on public.employees;
create trigger audit_employees after insert or update or delete on public.employees
  for each row execute function public.trg_audit();
drop trigger if exists audit_leave_balances on public.leave_balances;
create trigger audit_leave_balances after insert or update or delete on public.leave_balances
  for each row execute function public.trg_audit();
drop trigger if exists audit_leave_requests on public.leave_requests;
create trigger audit_leave_requests after insert or update or delete on public.leave_requests
  for each row execute function public.trg_audit();
drop trigger if exists audit_leave_types on public.leave_types;
create trigger audit_leave_types after insert or update or delete on public.leave_types
  for each row execute function public.trg_audit();

-- ---------------------------------------------------------------------
-- 4. VIEW SỐ DƯ PHÉP NĂM (theo mẫu Bảng tổng hợp; RLS của bảng gốc áp dụng)
-- ---------------------------------------------------------------------
create or replace view public.v_leave_balance
with (security_invoker = true) as
select
  b.employee_id, e.code, e.full_name, e.position, e.approver_id, e.is_active, b.year,
  b.standard_days,                                                    -- (1)
  b.current_year_days,                                                -- (2)
  b.carried_over_days,                                                -- (3)
  b.seniority_days,                                                   -- (4)
  b.bonus_days,                                                       -- (5)
  b.cancelled_days,                                                   -- (6)
  (b.current_year_days + b.carried_over_days + b.seniority_days
   + b.bonus_days - b.cancelled_days)                     as total_days,     -- (7)
  coalesce(u.used, 0)                                     as used_days,      -- (8)
  (b.current_year_days + b.carried_over_days + b.seniority_days
   + b.bonus_days - b.cancelled_days) - coalesce(u.used, 0) as remaining_days, -- (9)
  coalesce(u.pending, 0)                                  as pending_days,   -- đang chờ duyệt (chưa trừ)
  coalesce(u.m1, 0) as m1,  coalesce(u.m2, 0) as m2,  coalesce(u.m3, 0) as m3,
  coalesce(u.m4, 0) as m4,  coalesce(u.m5, 0) as m5,  coalesce(u.m6, 0) as m6,
  coalesce(u.m7, 0) as m7,  coalesce(u.m8, 0) as m8,  coalesce(u.m9, 0) as m9,
  coalesce(u.m10, 0) as m10, coalesce(u.m11, 0) as m11, coalesce(u.m12, 0) as m12
from public.leave_balances b
join public.employees e on e.id = b.employee_id
left join lateral (
  select
    sum(r.days) filter (where r.status = 'approved')                                         as used,
    sum(r.days) filter (where r.status = 'pending')                                          as pending,
    sum(r.days) filter (where r.status = 'approved' and extract(month from r.start_date) = 1)  as m1,
    sum(r.days) filter (where r.status = 'approved' and extract(month from r.start_date) = 2)  as m2,
    sum(r.days) filter (where r.status = 'approved' and extract(month from r.start_date) = 3)  as m3,
    sum(r.days) filter (where r.status = 'approved' and extract(month from r.start_date) = 4)  as m4,
    sum(r.days) filter (where r.status = 'approved' and extract(month from r.start_date) = 5)  as m5,
    sum(r.days) filter (where r.status = 'approved' and extract(month from r.start_date) = 6)  as m6,
    sum(r.days) filter (where r.status = 'approved' and extract(month from r.start_date) = 7)  as m7,
    sum(r.days) filter (where r.status = 'approved' and extract(month from r.start_date) = 8)  as m8,
    sum(r.days) filter (where r.status = 'approved' and extract(month from r.start_date) = 9)  as m9,
    sum(r.days) filter (where r.status = 'approved' and extract(month from r.start_date) = 10) as m10,
    sum(r.days) filter (where r.status = 'approved' and extract(month from r.start_date) = 11) as m11,
    sum(r.days) filter (where r.status = 'approved' and extract(month from r.start_date) = 12) as m12
  from public.leave_requests r
  join public.leave_types t on t.id = r.leave_type_id and t.deducts_balance
  where r.employee_id = b.employee_id
    and extract(year from r.start_date) = b.year
) u on true;

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.employees      enable row level security;
alter table public.leave_types    enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;
alter table public.audit_log      enable row level security;

-- employees: xem mình, người duyệt của mình, người mình duyệt; HR xem/sửa tất cả
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select to authenticated
  using (public.can_view_employee(id) or id = public.my_approver_id());
drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees for insert to authenticated
  with check (public.is_hr());
drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees for update to authenticated
  using (public.is_hr()) with check (public.is_hr());
drop policy if exists employees_delete on public.employees;
create policy employees_delete on public.employees for delete to authenticated
  using (public.is_hr());

-- leave_types: ai đăng nhập cũng xem được; chỉ HR sửa
drop policy if exists leave_types_select on public.leave_types;
create policy leave_types_select on public.leave_types for select to authenticated
  using (true);
drop policy if exists leave_types_write on public.leave_types;
create policy leave_types_write on public.leave_types for all to authenticated
  using (public.is_hr()) with check (public.is_hr());

-- leave_balances: xem theo can_view_employee; chỉ HR sửa
drop policy if exists leave_balances_select on public.leave_balances;
create policy leave_balances_select on public.leave_balances for select to authenticated
  using (public.can_view_employee(employee_id));
drop policy if exists leave_balances_write on public.leave_balances;
create policy leave_balances_write on public.leave_balances for all to authenticated
  using (public.is_hr()) with check (public.is_hr());

-- leave_requests: xem theo can_view_employee; thêm/sửa chi tiết do trigger kiểm tra; không ai xóa
drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select on public.leave_requests for select to authenticated
  using (public.can_view_employee(employee_id));
drop policy if exists leave_requests_insert on public.leave_requests;
create policy leave_requests_insert on public.leave_requests for insert to authenticated
  with check (employee_id = public.current_employee_id() or public.is_hr());
drop policy if exists leave_requests_update on public.leave_requests;
create policy leave_requests_update on public.leave_requests for update to authenticated
  using (public.can_view_employee(employee_id))
  with check (public.can_view_employee(employee_id));

-- audit_log: chỉ HR xem; chỉ trigger ghi
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_hr());

-- ---------------------------------------------------------------------
-- 6. QUYỀN TRUY CẬP (anon không được gì; authenticated đi qua RLS)
-- ---------------------------------------------------------------------
revoke all on public.employees, public.leave_types, public.leave_balances,
              public.leave_requests, public.audit_log, public.v_leave_balance from anon, public;
revoke all on sequence public.leave_request_code_seq from anon, public;

grant select, insert, update, delete on public.employees, public.leave_types, public.leave_balances to authenticated;
grant select, insert, update on public.leave_requests to authenticated;
grant select on public.audit_log, public.v_leave_balance to authenticated;
grant usage on sequence public.leave_request_code_seq to authenticated;

revoke execute on function public.current_employee_id(), public.is_hr(), public.is_approver_of(uuid),
  public.my_approver_id(), public.can_view_employee(uuid), public.try_uuid(text),
  public.is_admin_context(), public.mark_password_changed() from public, anon;
grant execute on function public.current_employee_id(), public.is_hr(), public.is_approver_of(uuid),
  public.my_approver_id(), public.can_view_employee(uuid), public.try_uuid(text),
  public.is_admin_context(), public.mark_password_changed() to authenticated;

revoke execute on function public.trg_employees_before(), public.trg_auth_user_link(),
  public.trg_touch_updated_at(), public.trg_leave_requests_guard(), public.trg_audit() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. STORAGE: bucket riêng tư cho file đính kèm
--    Đường dẫn file: {employee_id}/{request_id}/{tên file}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Được tải lên / xóa file: chủ đơn khi đơn còn Chờ duyệt, hoặc HR
create or replace function public.can_manage_attachment(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.leave_requests r
    where r.employee_id = public.try_uuid(split_part(p_path, '/', 1))
      and r.id          = public.try_uuid(split_part(p_path, '/', 2))
      and ( public.is_hr()
            or (r.employee_id = public.current_employee_id() and r.status = 'pending') ))
$$;
revoke execute on function public.can_manage_attachment(text) from public, anon;
grant execute on function public.can_manage_attachment(text) to authenticated;

drop policy if exists np_attachments_select on storage.objects;
create policy np_attachments_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments'
         and public.can_view_employee(public.try_uuid(split_part(name, '/', 1))));
drop policy if exists np_attachments_insert on storage.objects;
create policy np_attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_manage_attachment(name));
drop policy if exists np_attachments_delete on storage.objects;
create policy np_attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.can_manage_attachment(name));

-- ---------------------------------------------------------------------
-- 8. DANH MỤC LOẠI PHÉP (theo sheet "Danh mục")
-- ---------------------------------------------------------------------
insert into public.leave_types (name, sort_order, deducts_balance) values
  ('Phép năm',                          1, true),
  ('Việc riêng có lương',               2, false),
  ('Việc riêng không lương',            3, false),
  ('Nghỉ không lương theo thỏa thuận',  4, false),
  ('Nghỉ ốm',                           5, false),
  ('Nghỉ chăm con ốm',                  6, false),
  ('Khám thai / thai sản',              7, false),
  ('Nghỉ khi vợ sinh con',              8, false),
  ('Nghỉ bù',                           9, false)
on conflict (name) do nothing;

select 'OK: đã tạo xong cấu trúc Giai đoạn 1' as ket_qua;

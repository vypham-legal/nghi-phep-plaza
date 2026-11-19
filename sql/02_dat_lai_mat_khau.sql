-- =====================================================================
-- 02_dat_lai_mat_khau.sql — Giai đoạn 2. Chạy SAU 01_schema.sql và 01b.
-- Chạy lại nhiều lần vẫn an toàn.
-- Vì chưa cấu hình gửi email, HR đặt lại mật khẩu tạm cho nhân viên ngay trong app;
-- nhân viên bắt buộc đổi mật khẩu ở lần đăng nhập tiếp theo.
-- =====================================================================

create or replace function public.hr_reset_password(p_employee uuid, p_password text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_code text;
begin
  if not public.is_hr() then
    raise exception 'Chỉ HR được đặt lại mật khẩu.';
  end if;
  if p_employee = public.current_employee_id() then
    raise exception 'Không dùng chức năng này cho chính mình; hãy dùng "Đổi mật khẩu".';
  end if;
  if p_password is null or length(p_password) < 8
     or p_password !~ '[A-Za-z]' or p_password !~ '[0-9]' then
    raise exception 'Mật khẩu tạm phải có ít nhất 8 ký tự, gồm cả chữ và số.';
  end if;

  select e.user_id, e.code into v_user, v_code
  from public.employees e where e.id = p_employee;

  if not found then
    raise exception 'Không tìm thấy nhân viên.';
  end if;
  if v_user is null then
    raise exception 'Nhân viên % chưa có tài khoản đăng nhập. Tạo tài khoản trong Supabase (Authentication → Users) với đúng email.', v_code;
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_user;

  update public.employees
     set must_change_password = true
   where id = p_employee;

  -- Ghi nhật ký (không lưu mật khẩu)
  insert into public.audit_log (actor_user_id, actor_employee_id, table_name, record_id, action)
  values (auth.uid(), public.current_employee_id(), 'auth.users', p_employee::text, 'RESET_PASSWORD');
end $$;

revoke execute on function public.hr_reset_password(uuid, text) from public, anon;
grant  execute on function public.hr_reset_password(uuid, text) to authenticated;

select 'OK: đã tạo chức năng HR đặt lại mật khẩu' as ket_qua;

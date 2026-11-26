-- =====================================================================
-- 04_don_nghi_phep.sql — Giai đoạn 3. Chạy SAU 01, 01b, 02, 03. Chạy lại an toàn.
-- Tên những người liên quan tới các đơn mà người đang đăng nhập được xem
-- (người nộp, người tạo, người duyệt, người hủy) — để nhân viên thấy "ai đã duyệt/hủy đơn của mình"
-- mà không cần mở quyền xem hồ sơ của người đó.
-- =====================================================================

create or replace function public.leave_request_people()
returns table (id uuid, full_name text, code text)
language sql stable security definer set search_path = '' as $$
  select distinct e.id, e.full_name, e.code
  from public.leave_requests r
  join public.employees e
    on e.id in (r.employee_id, r.created_by, r.decided_by, r.cancelled_by)
  where public.can_view_employee(r.employee_id)
$$;

revoke execute on function public.leave_request_people() from public, anon;
grant execute on function public.leave_request_people() to authenticated;

-- Tìm đơn theo người duyệt / trạng thái nhanh hơn
create index if not exists leave_requests_pending_idx on public.leave_requests (employee_id) where status = 'pending';

select 'OK: Giai đoạn 3 — đã tạo hàm leave_request_people' as ket_qua;

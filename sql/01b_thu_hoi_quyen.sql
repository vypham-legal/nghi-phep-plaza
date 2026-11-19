-- =====================================================================
-- 01b_thu_hoi_quyen.sql — Chạy SAU 01_schema.sql. Chạy lại nhiều lần vẫn an toàn.
-- Supabase tự cấp sẵn mọi quyền cho vai trò authenticated trên bảng mới.
-- RLS đã chặn các thao tác này; file này thu hồi luôn quyền ở mức bảng
-- (lớp bảo vệ thứ 2) để thao tác bị từ chối ngay thay vì "0 dòng".
-- =====================================================================

-- Đơn nghỉ phép: không ai được xóa (chỉ hủy)
revoke delete, truncate, references, trigger on public.leave_requests from authenticated;

-- Nhật ký và view: chỉ được đọc
revoke insert, update, delete, truncate, references, trigger on public.audit_log, public.v_leave_balance from authenticated;

-- Các bảng còn lại: bỏ quyền không dùng tới
revoke truncate, references, trigger on public.employees, public.leave_types, public.leave_balances from authenticated;

-- Kiểm tra: liệt kê quyền còn lại của authenticated
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as quyen_con_lai
from information_schema.role_table_grants
where grantee = 'authenticated' and table_schema = 'public'
group by table_name
order by table_name;

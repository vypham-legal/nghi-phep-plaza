# Mô hình dữ liệu

| Bảng | Nội dung | Ai xem | Ai sửa |
|---|---|---|---|
| `employees` | Nhân viên: Mã NV, họ tên, vị trí, email, **chức danh** (`title`: `employee` Nhân viên / `supervisor` Giám sát trực tiếp / `manager` Quản lý), **quyền HR** (`role`: `employee`/`hr`, kiêm nhiệm được), người duyệt, đang làm/nghỉ việc, cờ đổi mật khẩu | Chính mình, người duyệt của mình, người mình duyệt, HR | HR |
| `leave_types` | 9 loại phép; chỉ "Phép năm" có `deducts_balance = true` | Mọi người đã đăng nhập | HR |
| `leave_balances` | Quỹ phép theo (nhân viên, năm): cột (1)–(6) | Như `employees` | HR |
| `leave_requests` | Đơn nghỉ phép và trạng thái | Như `employees` | Theo quy tắc bên dưới; không ai xóa |
| `audit_log` | Nhật ký: ai, lúc nào, thêm/sửa gì | HR | Chỉ hệ thống tự ghi |
| `v_leave_balance` (view) | (1)–(9), Tháng 1–12, số ngày đang chờ duyệt | Theo quyền của bảng gốc | — |
| Storage `attachments` | File đính kèm: `{employee_id}/{request_id}/{file}`, PDF/ảnh ≤ 5 MB, riêng tư | Người nộp, người duyệt trực tiếp, HR | Người nộp (khi đơn Chờ duyệt), HR |

## Đối chiếu với file Excel

| Excel – sheet Nhân viên | Database |
|---|---|
| Mã NV, Họ và tên, Vị trí công việc, Email | `employees.code`, `full_name`, `position`, `email` |
| Email quản lý | `employees.approver_id` (HR chọn người duyệt trong app) |
| (1) NP tiêu chuẩn … (6) NP đã hủy | `leave_balances.standard_days`, `current_year_days`, `carried_over_days`, `seniority_days`, `bonus_days`, `cancelled_days` |
| (7) Tổng, (8) Đã dùng, (9) Còn lại | Tính trong `v_leave_balance` (không lưu) |

| Excel – sheet Đơn nghỉ phép | Database (`leave_requests`) |
|---|---|
| Mã đơn | `code` (đơn mới tự sinh `NP-000001`; đơn nhập từ Excel giữ mã cũ, vd `CU-2026-01-NV02`) |
| Ngày nộp, Mã NV, Loại phép | `submitted_at`, `employee_id`, `leave_type_id` |
| Từ ngày, Đến ngày, Số ngày | `start_date`, `end_date`, `days` |
| Lý do, Người nhận bàn giao | `reason`, `handover_to` |
| Người duyệt, Ngày duyệt, Ý kiến | `decided_by`, `decided_at`, `decision_note` |
| Kết quả: Approve / Reject / Đã hủy | `status`: `approved` / `rejected` / `cancelled` (thêm `pending` = Chờ duyệt) |

## Quy tắc trạng thái (chặn trong database)

| Chuyển trạng thái | Ai được làm |
|---|---|
| Tạo đơn → Chờ duyệt | Nhân viên (cho chính mình), HR (cho bất kỳ ai) |
| Tạo đơn → Đã duyệt (đơn giấy) | HR, trừ đơn của chính HR đó |
| Chờ duyệt → Đã hủy | Người nộp, HR |
| Chờ duyệt → Đã duyệt / Từ chối | Người duyệt được gán (phải là Quản lý / Giám sát trực tiếp), HR (duyệt thay); không ai tự duyệt đơn của mình; Từ chối phải ghi ý kiến |
| Đã duyệt → Đã hủy | Chỉ HR, phải ghi lý do |
| Mọi chuyển khác (vd mở lại đơn đã hủy) | Không ai |

- Nội dung đơn (loại, ngày, số ngày, lý do…) không sửa được sau khi nộp; chỉ HR sửa được khi đơn còn Chờ duyệt.
- Người duyệt, ngày duyệt, người hủy, ngày hủy do hệ thống tự ghi.
- Chỉ người có chức danh **Quản lý** hoặc **Giám sát trực tiếp** (đang làm việc) mới được chọn làm người duyệt; database chặn gán người duyệt khác và chặn hạ chức danh người đang duyệt cho ai đó.
- Quyền HR độc lập với chức danh: một người có thể vừa là Quản lý vừa có quyền HR.
- Tài khoản đăng nhập tự gắn với nhân viên theo email. Sau này khi chuyển sang đăng nhập bằng tài khoản Microsoft, chỉ cần cùng email.

# Giai đoạn 2 — Hướng dẫn cài đặt

## 1. Chạy SQL (Supabase → SQL Editor)
1. Dán toàn bộ `sql/02_dat_lai_mat_khau.sql` → **Run** → thấy `OK: đã tạo chức năng HR đặt lại mật khẩu`.
2. Dán toàn bộ `sql/02_test.sql` → **Run** → dòng cuối phải là **TẤT CẢ ĐẠT**.
3. Chạy lại `sql/01_test_rls.sql` → vẫn **TẤT CẢ ĐẠT**.

## 2. Tải code lên GitHub
Mở https://github.com/vypham-legal/nghi-phep-plaza/upload/main, **kéo thả** (không dùng nút chọn file):
- `index.html`, `README.md`
- thư mục `css`, `js`, `sql`, `docs`

Thư mục `js` mới có thêm `ui.js`, `state.js` và thư mục con `views`. Kéo cả thư mục `js` để giữ đúng cấu trúc.
Kiểm tra không có file `.xlsx` hay `~$…`, rồi bấm **Commit changes**. Chờ 1–2 phút, mở trang và nhấn **Ctrl+F5**.

## 3. Tạo tài khoản để thử
Để thử đủ các vai trò, nên có ít nhất 3 tài khoản: **HR** (đã có), **1 quản lý**, **1 nhân viên do quản lý đó duyệt**.

Cách thêm một người (HR làm):
1. Đăng nhập app bằng tài khoản HR → **Nhân viên** → **+ Thêm nhân viên** → nhập Mã NV, họ tên, email, người duyệt → **Lưu**.
2. Supabase → **Authentication → Users → Add user → Create new user**: cùng email, mật khẩu tạm (≥ 8 ký tự, có chữ và số), tích **Auto Confirm User**.
3. Quay lại app, tải lại trang Nhân viên: cột **Tài khoản** chuyển thành **Có (chờ đổi MK)**.
4. Gửi email + mật khẩu tạm cho người đó (trực tiếp, không gửi qua nhóm chat chung).

Quên mật khẩu: HR mở **Nhân viên → Sửa → Đặt lại mật khẩu…** → bấm **Tạo ngẫu nhiên** → **Đặt lại**, rồi gửi mật khẩu tạm cho nhân viên.

## 4. Nhập quỹ phép
**Quỹ phép** → chọn năm → nhập cột (1)–(6) (hoặc bấm **Điền mặc định cho người chưa có quỹ**) → **Lưu thay đổi**.
Số liệu tháng 1–10/2026 từ file Excel sẽ được nhập tự động ở Giai đoạn 5. Hiện tại chỉ cần nhập vài người để thử.

Làm xong, đánh dấu các mục trong `docs/GD2-kiem-thu.md` và báo kết quả.

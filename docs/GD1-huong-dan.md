# Giai đoạn 1 — Hướng dẫn cài đặt

Làm lần lượt từ bước 1 đến bước 8. Mất khoảng 20–30 phút.

## 1. Tạo project Supabase
1. Vào https://supabase.com/dashboard → **New project**.
2. Đặt tên (vd `nghi-phep-plaza`), **Region: Southeast Asia (Singapore)**.
3. Đặt mật khẩu database và lưu vào nơi an toàn (không dán vào code hay gửi qua chat).

## 2. Khóa đăng ký tự do
Vào **Authentication → Sign In / Providers**:
- Tắt **Allow new users to sign up** (chỉ HR tạo tài khoản).
- Giữ **Email** bật.

Vào **Authentication → URL Configuration**:
- **Site URL**: `https://vypham-legal.github.io/nghi-phep-plaza/`

## 3. Chạy SQL tạo cấu trúc
1. Vào **SQL Editor → New query**.
2. Mở file `sql/01_schema.sql`, chép toàn bộ, dán vào, bấm **Run**.
3. Kết quả mong đợi: `OK: đã tạo xong cấu trúc Giai đoạn 1`.

Nếu Supabase hỏi xác nhận vì câu lệnh "có thể phá hủy" (do có `drop policy` / `drop trigger`), bấm chạy tiếp. Các lệnh này chỉ tạo lại chính sách và trigger của app.

## 4. Chạy kiểm thử phân quyền tự động
1. **New query** → dán toàn bộ `sql/01_test_rls.sql` → **Run**.
2. Kết quả là một bảng kết quả. Dòng cuối phải là **TỔNG KẾT … TẤT CẢ ĐẠT**.
3. Script tự xóa sạch dữ liệu thử, kể cả khi có lỗi. Nếu có dòng **KHÔNG ĐẠT** hoặc **LỖI KỊCH BẢN**, chụp màn hình gửi lại cho mình.

## 5. Tạo tài khoản HR đầu tiên
HR đầu tiên phải tạo bằng SQL (vì chưa có HR nào để thêm trong app).

**a) Tạo hồ sơ nhân viên.** Vào SQL Editor, sửa thông tin rồi chạy (đừng lưu thông tin thật vào file trong repo):
```sql
insert into public.employees (code, full_name, position, email, role)
values ('NV11', 'HỌ TÊN HR', 'Nhân viên Hành chính - Pháp lý', 'email.hr@congty.com', 'hr');
```

**b) Tạo tài khoản đăng nhập.** Vào **Authentication → Users → Add user → Create new user**:
- Email: đúng email ở bước a.
- Password: mật khẩu tạm.
- Tích **Auto Confirm User**.

**c) Kiểm tra đã gắn tài khoản:**
```sql
select code, full_name, email, role, user_id is not null as da_gan_tai_khoan
from public.employees;
```
Cột `da_gan_tai_khoan` phải là `true`.

## 6. Lấy URL và Publishable key
1. Vào **Project Settings → API Keys**, chép **Publishable key** (bắt đầu bằng `sb_publishable_`).
2. Lấy **Project URL** (dạng `https://xxxx.supabase.co`) ở **Project Settings → Data API**, hoặc ở nút **Connect** trên đầu trang.
3. Mở `js/config.js`, thay hai giá trị mẫu.

> ⚠️ Không bao giờ dán **Secret key** (`sb_secret_…`) hay **service_role**. Trang web sẽ tự từ chối chạy nếu thấy key loại này.

## 7. Đưa code lên GitHub (không cần cài git)
1. Mở https://github.com/vypham-legal/nghi-phep-plaza → **Add file → Upload files**.
2. Mở thư mục `nghi-phep-plaza` trên máy. Chọn **toàn bộ nội dung bên trong** (`index.html`, `css`, `js`, `sql`, `docs`, `README.md`, `.gitignore`) rồi kéo thả vào trang. Kéo nội dung bên trong, không kéo cả thư mục.
3. Kiểm tra danh sách file sắp tải lên **không có file Excel** hoặc dữ liệu thật nào, rồi bấm **Commit changes**.

## 8. Bật GitHub Pages
1. Trong repo: **Settings → Pages**.
2. **Source: Deploy from a branch** → Branch **main**, thư mục **/(root)** → **Save**.
3. Chờ 1–2 phút rồi mở `https://vypham-legal.github.io/nghi-phep-plaza/`.
4. Trang "Kiểm tra hệ thống" phải có **3 dòng "Đạt"**.

Xong bước 8, làm các mục trong `docs/GD1-kiem-thu.md` rồi báo kết quả cho mình.

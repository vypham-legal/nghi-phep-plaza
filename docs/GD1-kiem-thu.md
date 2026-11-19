# Giai đoạn 1 — Danh sách kiểm thử

Đánh dấu ✅ / ❌ từng mục. Mục nào ❌ thì chụp màn hình gửi lại.

## A. Tự động — `sql/01_test_rls.sql` (≈ 58 tình huống)
Script đóng vai 6 loại người dùng và tự hoàn tác dữ liệu thử:

| Nhóm | Nội dung chính |
|---|---|
| Gắn tài khoản | Tài khoản tự gắn với nhân viên theo email (không phân biệt hoa thường); Mã NV tự viết hoa |
| Nhân viên 1 | Chỉ thấy dữ liệu của mình; không xem được đơn, quỹ phép, số dư của người khác; nộp đơn cho mình được, nộp hộ người khác bị chặn; không tự duyệt; không sửa đơn đã nộp; hủy được đơn chờ duyệt; không mở lại đơn đã hủy; không tự nâng quyền HR; không sửa quỹ phép; không xóa đơn; không xem / ghi giả nhật ký |
| Quy tắc đơn | Chặn đơn qua 2 tháng; chặn số ngày không theo bước 0,5; chặn số ngày lớn hơn số ngày lịch; cho phép 0,5 ngày |
| Quản lý B (khác nhóm) | Không thấy và không duyệt được đơn của NV1; xem được số dư của nhân viên mình |
| Quản lý A (đúng người duyệt) | Thấy đơn NV1, không thấy đơn NV2; Từ chối phải ghi ý kiến; duyệt được; hệ thống tự ghi người duyệt / ngày duyệt; không hủy đơn đã duyệt; không sửa ý kiến sau khi duyệt; số dư trừ đúng |
| Nhân viên 1 (sau khi duyệt) | Không hủy được đơn đã duyệt; xem đúng số phép còn lại |
| HR | Thấy tất cả; hủy đơn đã duyệt phải ghi lý do; phép được hoàn lại sau khi hủy; nhập hộ đơn giấy (đánh dấu `hr_entry`); Nghỉ ốm không trừ phép năm; đơn chờ duyệt chưa trừ; không tự nhập đơn Đã duyệt cho chính mình; không gán tay tài khoản khác cho nhân viên; chặn vòng lặp người duyệt; không xóa đơn; xem được nhật ký |
| Tài khoản lạ | Có tài khoản nhưng không có hồ sơ nhân viên: không thấy gì, không nộp được đơn |
| Chưa đăng nhập | Không đọc được bảng nhân viên và danh mục loại phép |

- [ ] A1. Dòng cuối của kết quả là **TẤT CẢ ĐẠT**.
- [ ] A2. Chạy lại script lần 2 vẫn **TẤT CẢ ĐẠT**. Bảng `employees` không còn nhân viên `ZZTEST-…` nào.

## B. Kiểm tra trên Supabase Dashboard
- [ ] B1. **Table Editor**: 5 bảng `employees`, `leave_types`, `leave_balances`, `leave_requests`, `audit_log` đều hiện trạng thái RLS bật (không có nhãn "RLS disabled" / "Unrestricted").
- [ ] B2. Bảng `leave_types` có đúng 9 loại phép, đúng chính tả như sheet Danh mục.
- [ ] B3. **Storage**: bucket `attachments` ở chế độ **Private**.
- [ ] B4. **Authentication → Sign In / Providers**: "Allow new users to sign up" đang **tắt**.
- [ ] B5. **Advisors → Security Advisor**: không có mục mức **ERROR**. Chụp gửi lại nếu có WARN, mình sẽ xem.
- [ ] B6. Chạy lại `01_schema.sql` lần 2: không lỗi, `leave_types` vẫn 9 dòng (không nhân đôi).
- [ ] B7. HR đầu tiên có `da_gan_tai_khoan = true` (bước 5c trong hướng dẫn).

## C. Kiểm tra trang web
- [ ] C1. Mở `https://vypham-legal.github.io/nghi-phep-plaza/`: 3 dòng **Đạt** (Cấu hình, Kết nối Supabase, Bảo vệ dữ liệu).
- [ ] C2. Mở trên điện thoại: hiển thị gọn, không phải cuộn ngang.
- [ ] C3. Trên GitHub, mở `js/config.js`: chỉ có `sb_publishable_…`, không có `sb_secret_` hay `service_role`.
- [ ] C4. Trên GitHub, repo không có file `.xlsx` / `.csv` nào.

## Chưa kiểm thử ở giai đoạn này
- Phân quyền Storage (tải lên / xem / xóa file đính kèm): kiểm thử ở Giai đoạn 3, khi đã có màn hình nộp đơn.
- Đăng nhập, đổi mật khẩu lần đầu: Giai đoạn 2.

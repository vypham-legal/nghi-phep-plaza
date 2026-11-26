# Giai đoạn 3 — Hướng dẫn cài đặt

## 1. Chạy SQL (Supabase → SQL Editor, mở file bằng Notepad rồi chép)
1. `sql/04_don_nghi_phep.sql` → **Run** → `OK: Giai đoạn 3 …`
2. `sql/04_test.sql` → **Run** → dòng cuối **TẤT CẢ ĐẠT** (11 tình huống).

## 2. Tải code lên GitHub
Kéo thả `index.html`, `README.md` và các thư mục **css**, **js**, **sql**, **docs** vào
https://github.com/vypham-legal/nghi-phep-plaza/upload/main → **Commit changes**.
Không cần xóa cache: trang tự lấy bản mới (tối đa ~10 phút sau khi GitHub cập nhật).

## 3. Chức năng mới
| Ai | Menu | Làm gì |
|---|---|---|
| Mọi người | **Trang chủ** | Nút **Nộp đơn nghỉ phép**, 3 đơn gần đây, việc cần duyệt (nếu có) |
| Mọi người | **Đơn của tôi** | Xem đơn theo năm / trạng thái; mở chi tiết; **hủy đơn đang chờ**; thêm / xóa giấy tờ khi đơn còn chờ |
| Quản lý / Giám sát có người được duyệt, HR | **Duyệt đơn** (số đỏ = số đơn chờ) | Đơn chờ mình duyệt, kèm số phép còn lại; đơn vượt phép tô vàng; **Duyệt** (ý kiến tùy chọn) / **Từ chối** (bắt buộc lý do). HR thấy thêm "Chờ người khác duyệt" để **duyệt thay** |
| HR | **Tất cả đơn** | Lọc theo năm, tháng, trạng thái, loại phép, tìm theo tên / mã; mở đơn để duyệt thay, hủy đơn chờ, **hủy đơn đã duyệt** (bắt buộc lý do — phép tự hoàn lại); **+ Nhập đơn giấy** |

Form nộp đơn:
- Số ngày tự gợi ý theo số ngày lịch; sửa được, theo bước 0,5 (nút **Nửa ngày** khi nghỉ 1 ngày).
- Hiện số **Phép năm còn lại**; xin vượt → cảnh báo vàng nhưng vẫn gửi được (người duyệt quyết định).
- Trùng ngày với đơn khác → cảnh báo. Nghỉ qua 2 tháng → không gửi được, app ghi sẵn cách tách 2 đơn.
- Đính kèm: PDF / ảnh, ≤ 5 MB/file, tối đa 5 file. Chỉ người nộp, người duyệt trực tiếp và HR xem được.

## 4. Chuyển sang dùng chính thức
- Số liệu cũ (tháng 1–11) đã nạp bằng `nap_so_ngay_da_nghi_2026.sql` (đơn mã `CU-2026-…`, nguồn "Số liệu cũ").
- Bảng tổng hợp cũ có số liệu đến **19/11/2026**. Các ngày nghỉ **từ 20/11** đến khi bắt đầu dùng app (đơn giấy): HR vào **Tất cả đơn → + Nhập đơn giấy**, chọn "Đã duyệt", người duyệt trên đơn giấy, ngày duyệt.
- Từ ngày chính thức: mọi người nộp đơn trên app; đơn Phép năm được duyệt tự trừ vào số phép còn lại.

Làm xong, đánh dấu `docs/GD3-kiem-thu.md` và báo kết quả.

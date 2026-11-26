# Giai đoạn 3 — Danh sách kiểm thử

Cần 3 tài khoản: **NV** (nhân viên, có người duyệt là QL), **QL** (Quản lý hoặc Giám sát trực tiếp, là người duyệt của NV), **HR**. Thêm 1 tài khoản **NV khác nhóm** (người duyệt không phải QL) nếu có. Đánh dấu ✅ / ❌; ❌ thì chụp màn hình gửi lại.

## A. Tự động
- [ ] A1. `04_test.sql`: **TẤT CẢ ĐẠT**.
- [ ] A2. Chạy lại `01_test_rls.sql`, `02_test.sql`, `03_test.sql`: vẫn **TẤT CẢ ĐẠT**.

## B. Nhân viên nộp đơn (thử trên điện thoại)
- [ ] B1. Trang chủ có nút **Nộp đơn nghỉ phép**; menu có **Đơn của tôi**; NV thường **không** có menu Duyệt đơn.
- [ ] B2. Form: chọn 1 ngày → số ngày = 1, có nút **Nửa ngày**; chọn 3 ngày → số ngày tự = 3.
- [ ] B3. Hiện "Phép năm 2026: còn … ngày" đúng với Trang chủ.
- [ ] B4. Xin nhiều hơn số còn lại → khung vàng cảnh báo, vẫn **Gửi đơn** được.
- [ ] B5. Chọn 30/12 → 02/01 → báo phải tách 2 đơn (ghi sẵn ngày), không gửi được.
- [ ] B6. Số ngày 0,3 hoặc lớn hơn số ngày lịch → báo lỗi, không gửi được.
- [ ] B7. Chọn trùng ngày với đơn đang chờ / đã duyệt → cảnh báo trùng.
- [ ] B8. Đính kèm 1 file PDF/ảnh → gửi → mở đơn thấy file, bấm vào mở được. File > 5 MB hoặc file .docx → bị từ chối.
- [ ] B9. Sau khi gửi: chuyển sang Đơn của tôi, đơn **Chờ duyệt**; Trang chủ "Đang chờ duyệt" tăng.
- [ ] B10. Mở đơn chờ → **Hủy đơn** → trạng thái Đã hủy; đơn đã duyệt / từ chối **không** có nút Hủy.

## C. Người duyệt (QL)
- [ ] C1. Menu **Duyệt đơn** có số đơn chờ; Trang chủ có khung "… đơn đang chờ duyệt".
- [ ] C2. Thấy đơn của NV mình duyệt, **không** thấy đơn của nhân viên khác nhóm.
- [ ] C3. Mở đơn: thấy số phép còn lại, file đính kèm (mở được).
- [ ] C4. **Từ chối** không ghi lý do → bị chặn; có lý do → đơn Từ chối, NV thấy lý do + tên người từ chối.
- [ ] C5. **Duyệt** → đơn Đã duyệt; NV thấy tên người duyệt, ngày duyệt; số phép còn lại của NV giảm đúng số ngày (chỉ với Phép năm).
- [ ] C6. Duyệt đơn **Nghỉ ốm** → số Phép năm **không** đổi.
- [ ] C7. Đơn xin vượt phép hiện tô vàng "Vượt phép …".
- [ ] C8. QL nộp đơn cho chính mình → không tự duyệt được (đơn không hiện trong Duyệt đơn của chính mình).

## D. HR
- [ ] D1. **Tất cả đơn**: lọc năm / tháng / trạng thái / loại phép; tìm theo mã đơn, mã NV, tên; dòng tổng ngày đã duyệt đúng.
- [ ] D2. Thấy các đơn `CU-2026-…` nguồn "Số liệu cũ".
- [ ] D3. **Duyệt đơn** → mục "Chờ người khác duyệt" → duyệt thay được.
- [ ] D4. Hủy đơn đã duyệt: không ghi lý do → bị chặn; có lý do → Đã hủy, số phép của NV được hoàn lại.
- [ ] D5. **+ Nhập đơn giấy**: chọn NV → người duyệt trên đơn giấy tự điền đúng người duyệt của NV; lưu "Đã duyệt" → đơn nguồn "HR nhập hộ", trừ phép ngay.
- [ ] D6. Nhập đơn giấy "Chờ duyệt" → QL thấy trong Duyệt đơn.
- [ ] D7. HR nhập đơn Đã duyệt cho **chính mình** → bị chặn.
- [ ] D8. HR thêm file vào đơn đã duyệt (bổ sung giấy tờ) được.

## E. Phân quyền file (thử bằng tài khoản thật)
- [ ] E1. NV khác nhóm không mở được file của NV (không thấy đơn).
- [ ] E2. NV không thêm / xóa file được khi đơn đã duyệt.

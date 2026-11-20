# Giai đoạn 2 — Danh sách kiểm thử

Đánh dấu ✅ / ❌. Mục nào ❌ thì chụp màn hình gửi lại.

## A. Tự động (SQL Editor)
- [ ] A1. `02_test.sql`: **TẤT CẢ ĐẠT** (20 tình huống: NV không đặt lại mật khẩu / thêm nhân viên / sửa quỹ phép / thêm loại phép được; HR đặt lại mật khẩu đúng quy tắc, có ghi nhật ký; chặn trùng Mã NV; chặn quỹ phép âm hoặc lẻ 0,3; (7), (9) tính đúng).
- [ ] A2. `01_test_rls.sql` chạy lại vẫn **TẤT CẢ ĐẠT**.

## B. Đăng nhập (thử trên điện thoại)
- [ ] B1. Mở trang: hiện màn **Đăng nhập**, không cuộn ngang.
- [ ] B2. Bấm Đăng nhập khi để trống → báo "Vui lòng nhập email và mật khẩu."
- [ ] B3. Sai mật khẩu → báo "Email hoặc mật khẩu không đúng."
- [ ] B4. Email viết hoa (vd `NV01@...`) vẫn đăng nhập được.
- [ ] B5. Tài khoản mới (mật khẩu tạm): sau khi đăng nhập **bắt buộc** đổi mật khẩu, không vào được trang khác (gõ thẳng `#/hr/nhan-vien` cũng bị đưa về màn đổi mật khẩu).
- [ ] B6. Đổi mật khẩu: mật khẩu < 8 ký tự / không có số / hai lần nhập khác nhau → báo lỗi rõ ràng.
- [ ] B7. Đổi thành công → vào trang chủ; đăng xuất rồi đăng nhập bằng mật khẩu mới được, mật khẩu tạm cũ không dùng được nữa.
- [ ] B8. **Đổi mật khẩu** trên thanh tiêu đề dùng được cho lần đổi sau.
- [ ] B9. **Đăng xuất** → về màn đăng nhập; bấm nút Back của trình duyệt không xem lại được dữ liệu.
- [ ] B10. Đăng nhập bằng tài khoản Supabase **không có** hồ sơ nhân viên (hoặc nhân viên đã đánh dấu nghỉ việc) → báo "Tài khoản chưa được gắn với hồ sơ nhân viên", không thấy dữ liệu.

## C. Trang chủ nhân viên
- [ ] C1. Hiện đúng **Phép năm còn lại**, (7), (8), số đang chờ duyệt — so với số trên màn Quỹ phép của HR.
- [ ] C2. Người chưa có quỹ phép năm nay → khung vàng "HR chưa nhập quỹ phép…".
- [ ] C3. Hiện đúng Mã NV, vị trí, **Người duyệt đơn**.
- [ ] C4. Tài khoản nhân viên thường **không thấy** menu Nhân viên / Quỹ phép / Loại phép; gõ thẳng `#/hr/quy-phep` bị đưa về trang chủ.

## D. HR — Nhân viên
- [ ] D1. Danh sách đủ người; dòng tóm tắt đếm đúng số chưa có tài khoản / chưa gán người duyệt; ô vàng ở các mục đó.
- [ ] D2. Tìm theo mã / tên / email; lọc Đang làm / Đã nghỉ / Tất cả.
- [ ] D3. Thêm nhân viên mới; thêm trùng Mã NV → báo "Mã NV đã tồn tại."; trùng email → báo "Email này đã dùng cho nhân viên khác."
- [ ] D4. Sửa người duyệt; gán vòng lặp (A duyệt B, B duyệt A) → bị chặn với thông báo rõ ràng.
- [ ] D5. Đánh dấu nghỉ việc một người đang là người duyệt → app cảnh báo danh sách người bị ảnh hưởng.
- [ ] D6. Tạo tài khoản trong Supabase với đúng email → cột Tài khoản tự chuyển thành **Có**.
- [ ] D7. **Đặt lại mật khẩu**: mật khẩu tạm yếu bị từ chối; **Tạo ngẫu nhiên** → **Đặt lại** → nhân viên đăng nhập bằng mật khẩu tạm và bị buộc đổi mật khẩu.
- [ ] D8. Không có nút Đặt lại mật khẩu trên hồ sơ của chính mình.

## E. HR — Quỹ phép
- [ ] E1. Chọn năm; người chưa có quỹ tô vàng "Chưa có quỹ".
- [ ] E2. Sửa số → dòng tô vàng "Chưa lưu", (7) và (9) tự tính lại ngay; nút **Lưu thay đổi (n)** đếm đúng.
- [ ] E3. Nhập `12,5` và `12.5` đều được; nhập `0,3`, `-1`, `abc` → ô đỏ, không lưu được.
- [ ] E4. **Điền mặc định cho người chưa có quỹ** → điền 12 / 12 / 0…; **Lưu** → hết dòng "Chưa có quỹ".
- [ ] E5. Có thay đổi chưa lưu mà bấm sang menu khác / đổi năm / đóng tab → app hỏi lại.
- [ ] E6. **Hủy thay đổi** → trả về số đã lưu.
- [ ] E7. Trên điện thoại: chỉ bảng cuộn ngang, cột Mã NV đứng yên.

## F. HR — Loại phép
- [ ] F1. Đủ 9 loại; chỉ "Phép năm" có **Trừ quỹ phép năm = Có**.
- [ ] F2. Thêm loại phép mới; trùng tên → báo "Tên loại phép đã tồn tại."
- [ ] F3. Đổi "Trừ quỹ phép năm" hoặc đổi tên → app hỏi xác nhận.

## H. Nhập / xuất Excel
- [ ] H1. Nhân viên → **Tải file mẫu**: mở được bằng Excel; có sheet Nhân viên + Hướng dẫn; cột Vai trò / Trạng thái có danh sách chọn.
- [ ] H2. **Xuất Excel**: đủ nhân viên, đúng người duyệt (Mã NV), cột xám "(tham khảo)".
- [ ] H3. Sửa vị trí 1 người + thêm 2 người mới (người thứ nhất có người duyệt là người thứ hai, cùng trong file) → **Nhập từ Excel**: xem trước đúng "Cập nhật" / "Thêm mới"; nhập xong danh sách cập nhật, người duyệt gán đúng.
- [ ] H4. File có lỗi (trùng Mã NV, email sai, email của người khác, vai trò lạ, Mã NV người duyệt không tồn tại) → báo **Lỗi** từng dòng, không có nút Nhập, dữ liệu không đổi.
- [ ] H5. Nhập lại đúng file vừa xuất (không sửa gì) → toàn bộ "Không đổi".
- [ ] H6. Ghi `Không có` ở cột người duyệt → bỏ người duyệt; để trống → giữ nguyên.
- [ ] H7. Tự bỏ quyền HR / tự đánh dấu nghỉ việc của chính mình qua file → bị chặn.
- [ ] H8. Quỹ phép → **Tải file mẫu** có sẵn Mã NV + họ tên; điền số → nhập → bảng cập nhật đúng; (7), (9) trong file Excel tự tính bằng công thức.
- [ ] H9. Quỹ phép: số `0,3` / `-1` / `abc`, Mã NV chưa có, trùng Năm + Mã NV → báo lỗi từng dòng.
- [ ] H10. Nhập file Excel cũ `Mau nghi phep.xlsx` ở cả 2 màn: Nhân viên nhận đủ 15 người (thông tin khớp); Quỹ phép nhận số (1)–(6) năm 2026 khớp file.
- [ ] H11. Bấm Nhập từ Excel rồi đóng hộp chọn file → không có gì xảy ra, nút dùng lại được.

## G. Phân quyền qua giao diện
- [ ] G1. Quản lý (không phải HR): chỉ thấy Trang chủ, không thấy menu HR.
- [ ] G2. Nhân viên không có cách nào xem được thông tin người khác ngoài tên người duyệt của mình.

# Đăng ký nghỉ phép

JVC & Central Plaza

Web app quản lý đơn nghỉ phép: nhân viên nộp đơn, người duyệt duyệt, hệ thống tự trừ phép năm và lập bảng tổng hợp.

- Giao diện: HTML/CSS/JavaScript tĩnh, chạy trên GitHub Pages, không cần build.
- Dữ liệu: Supabase (Auth, Postgres có Row Level Security, Storage riêng tư).
- Trong code chỉ có Publishable key. Mọi quyền hạn do database kiểm soát.
- Repo này **không chứa dữ liệu thật**.

## Cấu trúc
```
index.html              Trang chính
css/style.css           Giao diện (hồng pastel + vàng đồng, vàng nhạt cho mục cần chú ý)
js/config.js            URL + Publishable key của Supabase
js/supabase-client.js   Khởi tạo kết nối (tự chặn secret key)
js/app.js               Khởi động, điều hướng (#/...), menu theo vai trò
js/state.js             Phiên đăng nhập + hồ sơ nhân viên
js/ui.js                Tiện ích giao diện (hộp thoại, thông báo, định dạng số)
js/views/               Các màn hình: đăng nhập, đổi mật khẩu, trang chủ, HR (nhân viên, quỹ phép, loại phép), kiểm tra hệ thống
sql/01_schema.sql       Bảng, hàm phân quyền, trigger, RLS, Storage, view, danh mục
sql/01b_thu_hoi_quyen.sql  Thu hồi quyền thừa ở mức bảng
sql/01_test_rls.sql     Tự kiểm thử phân quyền (tự hoàn tác dữ liệu thử)
sql/02_dat_lai_mat_khau.sql  HR đặt lại mật khẩu tạm
sql/02_test.sql         Kiểm thử Giai đoạn 2
docs/                   Mô hình dữ liệu, hướng dẫn cài đặt, danh sách kiểm thử
```

Chạy SQL theo thứ tự số trong tên file.

## Tiến độ
| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 1 | Nền móng: database, phân quyền, Storage, khung web | Xong |
| 2 | Đăng nhập, đổi mật khẩu, HR quản lý nhân viên / người duyệt / quỹ phép | Chờ kiểm tra |
| 3 | Nộp / duyệt / hủy đơn, đính kèm, HR nhập hộ | — |
| 4 | Bảng tổng hợp, xuất Excel | — |
| 5 | Nhập Excel, chuyển số liệu tháng 1–10/2026 | — |
| 6 | Kết chuyển năm, rà soát bảo mật, hướng dẫn vận hành | — |

Hướng dẫn: [Giai đoạn 1](docs/GD1-huong-dan.md) · [Giai đoạn 2](docs/GD2-huong-dan.md).

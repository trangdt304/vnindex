# Deploy Render Free + SQLite

Render chạy ứng dụng Node.js và lưu cache giá, watchlist vào SQLite. Cách này đơn giản và không cần dịch vụ database bên ngoài.

> Render Free dùng filesystem tạm thời. File SQLite có thể mất khi service redeploy, restart hoặc được chuyển sang máy khác. Dữ liệu giá sẽ tải lại từ VNDirect; watchlist của người dùng có thể bị mất.

## 1. Đẩy project lên GitHub

Tạo repository rồi push toàn bộ project. File `.env`, `data/*.json` và các file SQLite đã được `.gitignore` loại trừ.

## 2. Tạo Render Web Service

1. Đăng nhập Render, chọn **New → Blueprint**.
2. Kết nối repository; Render sẽ đọc `render.yaml`.
3. Deploy và đợi healthcheck `/api/health` thành công.

Ứng dụng tự tạo file `data/stock.db` cùng các bảng `stock_cache` và `watchlists` ở lần khởi động đầu tiên.

## 3. Biến môi trường

Blueprint đã cấu hình:

```text
SQLITE_PATH=/opt/render/project/src/data/stock.db
```

Giữ nguyên `WATCHLIST_IP_SALT` do Render tự tạo để việc nhận diện watchlist theo IP nhất quán trong cùng service.

## 4. Nhập dữ liệu JSON hiện có (tùy chọn)

Chạy trên máy local:

```powershell
npm run db:migrate
```

Lệnh nhập các file giá trong `data/` và `watchlists.json` vào `data/stock.db`. Không commit file database lên GitHub.

## 5. Đồng bộ thủ công

Scheduler tự động đã tắt. Dữ liệu tự cập nhật khi người dùng mở một mã chưa có cache của ngày hiện tại. Endpoint `/api/cron/sync` và workflow GitHub Actions chỉ chạy thủ công khi cần.

Nếu dùng workflow, tạo hai GitHub Actions secrets:

- `APP_URL`: URL Render, ví dụ `https://vn-stock-lab.onrender.com`.
- `CRON_SECRET`: cùng giá trị đặt trên Render.

## Kiểm tra

Mở:

```text
https://YOUR_RENDER_URL/api/health
```

Kết quả cần có:

```json
{"ok":true,"storage":"sqlite","scheduler":"disabled"}
```

Render Free ngủ sau một thời gian không có request, vì vậy lần mở tiếp theo có thể khởi động chậm.

# VN Stock Lab

Dashboard React lấy dữ liệu giá cuối ngày từ VNDirect, lưu cache cục bộ và trực quan hóa:

- Nến OHLC, khối lượng và MA khối lượng 20 phiên
- MA20, MA50, MA200 và Bollinger Bands
- RSI(14), MACD(12, 26, 9), Accumulation/Distribution Line (A/D)
- MCDX tính cục bộ từ giá đóng cửa VNDirect: nhóm lớn, đầu cơ và nhỏ lẻ
- Watchlist có thể thêm/xóa và được lưu phía server theo HMAC của địa chỉ IP
- Điểm xu hướng, hỗ trợ/kháng cự gần và diễn giải từng tín hiệu
- 5 tin doanh nghiệp mới nhất theo từng mã từ KBS/Vietstock
- Lưu cache giá và watchlist trong SQLite

## Chạy dự án

Yêu cầu Node.js `20.19+` hoặc `22.12+`.

```bash
npm install
npm run dev
```

Vite phục vụ React tại `http://localhost:5173` và chuyển tiếp `/api` đến Express tại cổng `3000`.
Dữ liệu được lưu trong `data/stock.db`; lần mở đầu tiên sẽ gọi VNDirect, các lần sau
trong ngày dùng cache. Nút **Cập nhật VNDirect** buộc đồng bộ lại.

Chạy bản production:

```bash
npm run build
npm start
```

Express phục vụ bundle trong `dist/` tại cổng `5173` hoặc giá trị của biến `PORT`.

## Cấu hình

Sao chép `.env.example` thành `.env` nếu dùng trình quản lý biến môi trường, hoặc đặt biến trực tiếp trước khi chạy:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `5173` | Cổng web |
| `WATCHLIST` | `GEX,FPT,HPG,VNM,VND` | Watchlist mặc định |
| `SQLITE_PATH` | `./data/stock.db` | Đường dẫn file SQLite |
| `VNDIRECT_API_BASE` | `https://api-finfo.vndirect.com.vn/v4` | API nguồn |
| `KBS_NEWS_API_BASE` | API KBS mặc định | API nguồn tin doanh nghiệp |
| `GEMINI_API_KEY` | — | API key Gemini, chỉ lưu ở backend |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Model dùng để diễn giải tín hiệu kỹ thuật |
| `AI_RATE_LIMIT` | `5` | Số lần tạo phân tích mới/IP trong 10 phút |

Endpoint chính: `GET /api/stocks/GEX`; thêm `?refresh=1` để bỏ qua cache.
Tin doanh nghiệp: `GET /api/stocks/GEX/news`; endpoint trả tối đa 5 tin gần nhất.
Nhấn **Phân tích bằng AI** hoặc gọi `POST /api/stocks/GEX/ai-analysis` để Gemini
tổng hợp dữ liệu kỹ thuật. Kết quả được cache theo mã, ngày giá, model và phiên bản prompt.

## Public trên Oracle Cloud

Dự án có Docker image đa kiến trúc và Compose dành cho Oracle Always Free. Xem [hướng dẫn triển khai](deploy/oracle-cloud.md). Đặt cố định `WATCHLIST_IP_SALT` để nhận diện watchlist mà không lưu IP thô.

Lưu ý: IP không phải định danh thiết bị ổn định. Các thiết bị chung NAT/Wi-Fi có thể dùng chung danh sách; đổi mạng, VPN hoặc IPv6 privacy address có thể tạo một danh sách mới.

## Public miễn phí trên Render

Xem [hướng dẫn Render Free](deploy/render-free.md). Ứng dụng dùng SQLite; lưu ý filesystem của Render Free không bền vững nên file database có thể mất khi redeploy hoặc khởi tạo lại service.

## Lưu ý dữ liệu

Đây là endpoint công khai của VNDirect và có thể thay đổi hoặc giới hạn truy cập. Ứng dụng dùng timeout và tiếp tục trả cache cũ khi nguồn tạm lỗi. Điểm phân tích chỉ mô tả tín hiệu kỹ thuật, không phải khuyến nghị đầu tư.

MCDX được tính hoàn toàn trong ứng dụng từ RSI của giá đóng cửa VNDirect, không gọi API hoặc sử dụng cookie 24HMoney. Các giá trị là chỉ số sức mạnh độc lập trên thang 0–100, không phải tỷ trọng sở hữu và không nhất thiết cộng lại thành 100%.

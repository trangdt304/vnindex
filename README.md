# VN Stock Lab

Dashboard lấy dữ liệu giá cuối ngày từ VNDirect, lưu cache cục bộ và trực quan hóa:

- Nến OHLC, khối lượng và MA khối lượng 20 phiên
- MA20, MA50, MA200 và Bollinger Bands
- RSI(14), MACD(12, 26, 9), Accumulation/Distribution Line (A/D)
- MCDX tính cục bộ từ giá đóng cửa VNDirect: nhóm lớn, đầu cơ và nhỏ lẻ
- Watchlist có thể thêm/xóa và được lưu phía server theo HMAC của địa chỉ IP
- Điểm xu hướng, hỗ trợ/kháng cự gần và diễn giải từng tín hiệu
- Lưu cache giá và watchlist trong SQLite

## Chạy dự án

Yêu cầu Node.js 14 trở lên.

```bash
npm install
npm start
```

Mở `http://localhost:5173`. Dữ liệu được lưu trong `data/stock.db`; lần mở đầu tiên sẽ gọi VNDirect, các lần sau trong ngày dùng cache. Nút **Cập nhật VNDirect** buộc đồng bộ lại.

## Cấu hình

Sao chép `.env.example` thành `.env` nếu dùng trình quản lý biến môi trường, hoặc đặt biến trực tiếp trước khi chạy:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `5173` | Cổng web |
| `WATCHLIST` | `GEX,FPT,HPG,VNM,VND` | Watchlist mặc định |
| `SQLITE_PATH` | `./data/stock.db` | Đường dẫn file SQLite |
| `VNDIRECT_API_BASE` | `https://api-finfo.vndirect.com.vn/v4` | API nguồn |

Endpoint chính: `GET /api/stocks/GEX`; thêm `?refresh=1` để bỏ qua cache.

## Public trên Oracle Cloud

Dự án có Docker image đa kiến trúc và Compose dành cho Oracle Always Free. Xem [hướng dẫn triển khai](deploy/oracle-cloud.md). Đặt cố định `WATCHLIST_IP_SALT` để nhận diện watchlist mà không lưu IP thô.

Lưu ý: IP không phải định danh thiết bị ổn định. Các thiết bị chung NAT/Wi-Fi có thể dùng chung danh sách; đổi mạng, VPN hoặc IPv6 privacy address có thể tạo một danh sách mới.

## Public miễn phí trên Render

Xem [hướng dẫn Render Free](deploy/render-free.md). Ứng dụng dùng SQLite; lưu ý filesystem của Render Free không bền vững nên file database có thể mất khi redeploy hoặc khởi tạo lại service.

## Lưu ý dữ liệu

Đây là endpoint công khai của VNDirect và có thể thay đổi hoặc giới hạn truy cập. Ứng dụng dùng timeout và tiếp tục trả cache cũ khi nguồn tạm lỗi. Điểm phân tích chỉ mô tả tín hiệu kỹ thuật, không phải khuyến nghị đầu tư.

MCDX được tính hoàn toàn trong ứng dụng từ RSI của giá đóng cửa VNDirect, không gọi API hoặc sử dụng cookie 24HMoney. Các giá trị là chỉ số sức mạnh độc lập trên thang 0–100, không phải tỷ trọng sở hữu và không nhất thiết cộng lại thành 100%.

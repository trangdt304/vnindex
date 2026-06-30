# Triển khai VN Stock Lab trên Oracle Cloud Always Free

Kiến trúc: một VM Ubuntu chạy Docker Compose. Dữ liệu giá và watchlist nằm trong Docker volume `vn-stock-lab-data`, nên vẫn còn sau khi cập nhật hoặc khởi động lại container.

## 1. Tạo VM

Trong Oracle Cloud Console:

1. Tạo **Compute Instance** trong home region.
2. Chọn Ubuntu 24.04 hoặc 22.04.
3. Chọn shape có nhãn **Always Free eligible**. Ampere A1 (ARM64) chạy được image của dự án.
4. Gán public IPv4 và lưu private SSH key.
5. Trong VCN Security List hoặc Network Security Group, mở ingress:
   - TCP 22: chỉ IP của bạn nếu có thể.
   - TCP 3000: `0.0.0.0/0` để chạy nhanh bằng IP.
   - Khi dùng domain/HTTPS, mở TCP 80 và 443 rồi đóng 3000.

## 2. Cài Docker

SSH vào VM:

```bash
ssh -i private-key.key ubuntu@PUBLIC_IP
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker "$USER"
newgrp docker
```

Kiểm tra:

```bash
docker --version
docker compose version
```

## 3. Đưa mã nguồn lên VM

Đẩy project lên một GitHub repository riêng hoặc công khai, sau đó:

```bash
git clone https://github.com/USERNAME/REPOSITORY.git
cd REPOSITORY
cp .env.example .env
```

Tạo salt dùng để băm IP:

```bash
openssl rand -hex 32
```

Mở `.env`, đặt salt và địa chỉ bind:

```dotenv
WATCHLIST_IP_SALT=GIÁ_TRỊ_VỪA_TẠO
BIND_ADDRESS=0.0.0.0
```

Không thay đổi `WATCHLIST_IP_SALT` sau khi đã có người dùng, nếu không các watchlist cũ sẽ không còn truy cập được. Server chỉ lưu HMAC của IP, không lưu địa chỉ IP thô. Biến `WATCHLIST` là danh sách mặc định; scheduler tự động hiện đang tắt.

## 4. Chạy ứng dụng

```bash
docker compose -f docker-compose.oracle.yml up -d --build
docker compose -f docker-compose.oracle.yml ps
docker compose -f docker-compose.oracle.yml logs -f
```

Truy cập:

```text
http://PUBLIC_IP:3000
```

Kiểm tra health:

```bash
curl http://127.0.0.1:3000/api/health
```

## 5. Cập nhật phiên bản

```bash
git pull
docker compose -f docker-compose.oracle.yml up -d --build
```

Docker volume không bị xóa bởi lệnh trên. Không chạy `docker compose down -v` vì tùy chọn `-v` sẽ xóa dữ liệu cache và watchlist.

## 6. Domain và HTTPS

Trỏ bản ghi A của domain về public IP. Cài Caddy hoặc Nginx làm reverse proxy tới `127.0.0.1:3000`, sau đó đổi trong `.env`:

```dotenv
BIND_ADDRESS=127.0.0.1
```

Chạy lại Compose và đóng ingress TCP 3000 trên Oracle Cloud. Chỉ giữ 22, 80 và 443.

## Sao lưu dữ liệu

```bash
docker run --rm \
  -v vn-stock-lab-data:/data \
  -v "$PWD":/backup \
  alpine tar czf /backup/vn-stock-lab-data.tgz -C /data .
```

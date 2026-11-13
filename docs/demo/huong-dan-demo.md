<!-- SPDX-FileCopyrightText: 2026 DTU_DZ_2 -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Hướng dẫn chạy lại demo

Trang này dành cho bất kỳ ai muốn tự chạy lại demo Commune DX-OS trên máy của mình: một hồ sơ đăng ký khai sinh đi từ lúc người dân hỏi thủ tục tới lúc nhận kết quả ký số, qua cả bốn không gian H-P-D-I của Tầng 2. Mọi dữ liệu là dữ liệu mẫu giả.

| Mục | Nội dung |
|---|---|
| [1. Chuẩn bị môi trường](#1-chuẩn-bị-môi-trường) | lệnh `make`, cấu hình `.env`, OTP, tệp mẫu |
| [2. Tài khoản mẫu](#2-tài-khoản-mẫu) | tên tài khoản, cách đặt mật khẩu |
| [3. Các luồng demo](#3-các-luồng-demo) | bảy luồng, thao tác và kết quả mong đợi |
| [4. Sau khi chạy](#4-sau-khi-chạy) | rút gói ví dụ, quay lại thành video |

## 1. Chuẩn bị môi trường

### 1.1 Máy và dịch vụ

Cần máy 16 GB RAM trở lên; cấp cho Docker ít nhất 12 GB khi bật cả profile `ai`. Yêu cầu chung và cách cài: [Cài đặt và chạy](../cai-dat.md).

```bash
cp .env.example .env
# trong .env: LLM_PROVIDER=ollama          (trợ lý dùng Qwen2.5 7B)
#             DXOS_SU_KIEN_QUET_GIAY=30    (cảnh báo sắp trễ hạn hiện sau ≤ 30 giây, mặc định 300)
make up-ai        # lõi + Ollama (Qwen2.5 7B + bge-m3, tải khoảng 6 GB lần đầu) + OCR
make up-bi        # thêm Superset
make smoke        # phải kết thúc bằng "0 trượt"
make du-lieu-demo # dữ liệu giả: 96 hồ sơ lịch sử, 1 hồ sơ sắp trễ hạn có thông báo, nạp kho dữ liệu cho dashboard
make demo-users   # đặt một mật khẩu chung cho mọi tài khoản mẫu và in ra một lần
```

`make du-lieu-demo` chạy sau `make smoke` và trước `make demo-users`. Kiểm tra bằng `make ps`: dịch vụ chạy nền ở trạng thái `healthy`, dịch vụ một lần ở `Exited (0)`.

Không cần trợ lý và OCR thì chỉ chạy `make up` thay cho `make up-ai`; luồng 1 khi đó chỉ trả về đoạn tài liệu liên quan, luồng 2 bỏ phần đọc ảnh.

### 1.2 Thời gian trả lời của trợ lý trên CPU

Qwen2.5 7B chạy bằng CPU trong Docker trả lời chậm: đo ngày 29/10/2026 trên MacBook arm64, câu hỏi đầu tiên mất hơn 3 phút. Docker trên macOS không dùng được GPU.

- Hỏi trợ lý một câu bất kỳ trước khi bắt đầu để Ollama nạp mô hình vào RAM; lần hỏi đầu chậm nhất.
- Trên Mac, cài Ollama ngay trên máy để dùng GPU Apple: `ollama pull qwen2.5:7b && ollama pull bge-m3`, rồi đặt trong `.env` `LLM_BASE_URL=http://host.docker.internal:11434` (xem [Cài đặt §4](../cai-dat.md#4-cấu-hình-trước-khi-chạy)).
- Câu trả lời chậm thì có thể gửi câu hỏi ở luồng 1, làm tiếp luồng 2, rồi quay lại xem câu trả lời.

### 1.3 Cài OTP cho cán bộ và lãnh đạo

Cán bộ và lãnh đạo bắt buộc đăng nhập kèm mã OTP. Trước khi chạy demo, đăng nhập một lần bằng `canbo01` và `lanhdao01` ở `http://localhost:9080/can-bo`, quét mã QR bằng ứng dụng OTP (FreeOTP, Google Authenticator…) trên điện thoại.

### 1.4 Trình duyệt và tệp mẫu

Dùng **hai cửa sổ ẩn danh** để phiên công dân và phiên cán bộ không lẫn nhau:

| Tab | Địa chỉ | Phiên |
|---|---|---|
| 1 | `http://localhost:9080/hoi-dap` | cửa sổ A, chưa đăng nhập |
| 2 | `http://localhost:9080/thu-tuc/KS01` | cửa sổ A (công dân `congdan01` đăng nhập khi nộp) |
| 3 | `http://localhost:9080/can-bo` | cửa sổ B (`canbo01`, rồi đăng xuất, `lanhdao01`) |
| 4 | `http://localhost:9080/bao-cao/superset/dashboard/hieu-suat-mot-cua/` (hoặc mục "Báo cáo hiệu suất" của cổng cán bộ), bấm "Sign in with Keycloak" | cửa sổ B, mở **sau** khi `lanhdao01` đã đăng nhập ở tab 3 (SSO không hỏi lại mật khẩu) |
| 5 | terminal ở thư mục repo | |

Tải sẵn hai ảnh giấy tờ mẫu giả: `http://localhost:9080/mau-gia/giay-chung-sinh.png` và `http://localhost:9080/mau-gia/giay-to-tuy-than.png`. Chuẩn bị thêm một tệp PNG hoặc PDF bất kỳ làm tờ khai.

## 2. Tài khoản mẫu

| Tài khoản | Vai | Dùng ở luồng |
|---|---|---|
| `congdan01` | người dân | 2, 4 |
| `canbo01` | cán bộ hộ tịch | 3 |
| `lanhdao01` | lãnh đạo xã | 4, 5, 6 |

Mật khẩu do `make demo-users` đặt và in ra một lần trên máy của bạn (hoặc đặt trước bằng biến `DXOS_DEMO_PASSWORD`). Không ghi mật khẩu vào tài liệu, issue hay ảnh chụp. Trên bản demo công khai, tài khoản do đội cấp trực tiếp: xem [Hướng dẫn buổi dùng thử](../thu-nghiem.md#13-tài-khoản-mẫu).

Một số lệnh ở luồng 4 và 5 cần token của lãnh đạo trong biến `TOKEN`. Cách lấy token bằng `curl` (kèm `-d totp=<mã 6 số>` cho tài khoản có OTP): [Cài đặt §3](../cai-dat.md#3-địa-chỉ-cổng-và-tài-khoản-mẫu).

## 3. Các luồng demo

Bảy luồng chạy nối tiếp trên cùng một hồ sơ khai sinh. Mỗi luồng ghi thao tác và kết quả mong đợi trên màn hình.

### Luồng 1 · [I] Trợ lý thủ tục

**Thao tác:** tab 1, gõ "Đăng ký khai sinh cho con cần những giấy tờ gì và mất bao lâu?", bấm **Gửi câu hỏi**.

**Kết quả mong đợi:**
- Trong lúc chờ hiện "Đang tra cứu tài liệu và soạn câu trả lời…".
- Câu trả lời có số trích dẫn [1], [2]… và mục **Nguồn tham khảo** trỏ tới văn bản pháp luật hoặc gói thủ tục.
- Trợ lý tìm cùng lúc theo từ khóa (Meilisearch) và theo nghĩa (pgvector, bge-m3); máy chủ bỏ trích dẫn không có thật. Khi mô hình tắt hoặc lỗi, trang vẫn trả các đoạn tài liệu liên quan.

### Luồng 2 · [P] Nộp hồ sơ khai sinh

**Thao tác:**
1. Tab 2: trang KS01 hiện thành phần hồ sơ, thời hạn, lệ phí. Bấm **Bắt đầu nộp**, đăng nhập `congdan01`, nhập số điện thoại giả, ví dụ 0900 000 108.
2. Ở bước Giấy tờ, chỉ chọn tệp tờ khai rồi bấm **Tiếp tục**.
3. Chọn hai ảnh mẫu giả cho giấy chứng sinh và giấy tờ tùy thân, bấm **Đọc thông tin từ ảnh** ở từng ảnh.
4. **Tiếp tục**, **Đồng ý và nộp hồ sơ**, rồi tải biên nhận.

**Kết quả mong đợi:**
- Bước 2: cổng báo thiếu giấy chứng sinh và không gửi request nào lên máy chủ (Poka-yoke theo JSON Schema của gói). Gọi thẳng API mà thiếu giấy cũng nhận lỗi 422, quy trình không khởi tạo.
- Bước 3: các ô được điền sẵn từ ảnh (PaddleOCR + VietOCR trên ONNX Runtime, chạy trong máy); ô máy không chắc được đánh dấu để người dân kiểm lại.
- Bước 4: màn **Đã nộp hồ sơ** có mã hồ sơ và hạn trả kết quả tính theo ngày làm việc; biên nhận là PDF có chữ ký số của xã.

### Luồng 3 · [P] Cán bộ hộ tịch xử lý

**Thao tác:**
1. Tab 3: đăng nhập `canbo01`, nhập mật khẩu và mã OTP.
2. Bấm chuông, mở trang **Thông báo**.
3. Mở hồ sơ vừa nộp, kéo tới **Thông tin đọc từ giấy tờ**, so ảnh gốc với cột máy đọc, bấm **Xác nhận đúng với ảnh gốc** cho từng giấy.
4. Ở ô xử lý bước: chọn **Có**, **Hoàn thành bước** (Tiếp nhận); lặp lại cho bước Thẩm định.

**Kết quả mong đợi:**
- Hộp việc chỉ có hồ sơ thuộc lĩnh vực hộ tịch (PostgreSQL Row-Level Security, không phải giao diện tự ẩn).
- Trang Thông báo có cảnh báo sắp trễ hạn cho hồ sơ của "Đỗ Thị Sắp Trễ" do `make du-lieu-demo` tạo; chuông cập nhật ngay, không cần tải lại trang.
- Sau khi xác nhận, thông tin máy đọc không sửa được nữa; nhật ký kiểm toán ghi số trường cán bộ đã sửa so với máy đọc.
- Các bước và ô nhập lấy từ BPMN của gói khai sinh chạy trên Flowable; trạng thái hồ sơ chuyển theo đúng bước.

### Luồng 4 · [P] Lãnh đạo phê duyệt, công dân nhận kết quả

**Thao tác:**
1. Tab 3: đăng xuất, đăng nhập `lanhdao01` kèm OTP, mở hồ sơ, ở bước Phê duyệt chọn **Có**, **Hoàn thành bước**.
2. Tab 2: **Hồ sơ của tôi**, mở hồ sơ, tải thông báo kết quả về tệp `ket-qua.pdf`.
3. Terminal, xác minh chữ ký:

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/pdf' \
  --data-binary @ket-qua.pdf http://localhost:9080/files/xac-minh | jq '{hopLe, toanVen, nguoiKy}'
```

**Kết quả mong đợi:**
- Hồ sơ chuyển sang hoàn tất; thông báo kết quả là PDF do Gotenberg dựng, pyHanko ký PAdES bằng chứng thư của CA nội bộ (step-ca, khóa giữ trong OpenBao).
- Lệnh xác minh trả `hopLe` và `toanVen` là `true`, kèm tên người ký. Sửa một byte trong tệp rồi chạy lại thì kết quả báo không toàn vẹn.

### Luồng 5 · [D] Xác minh nhật ký kiểm toán

**Thao tác:** terminal, với token lãnh đạo trong biến `TOKEN`:

```bash
DXOS_TOKEN=$TOKEN python3 mot-cua/backend/kiem_toan.py --api http://localhost:9080/api
```

**Kết quả mong đợi:**
- Công cụ đọc nhật ký qua API rồi tự tính lại từng mắt xích của chuỗi băm SHA-256, in một dòng JSON có `"hopLe": true`, số bản ghi và băm cuối; chuỗi hỏng thì `hopLe` là `false` và `loi` chỉ ra bản ghi đứt.
- Nhật ký có đủ các thao tác của luồng 2–4: nộp hồ sơ, tải tệp, xác nhận OCR, chuyển bước, ký. Trigger trong CSDL chặn sửa, xóa kể cả superuser.

### Luồng 6 · [D] Dashboard lãnh đạo

**Thao tác:** tab 4, Superset đã đăng nhập SSO bằng tài khoản lãnh đạo, mở dashboard **Hiệu suất một cửa**.

**Kết quả mong đợi:**
- Năm biểu đồ: số hồ sơ đã đóng, tỷ lệ trễ hạn, số hồ sơ theo lĩnh vực, tỷ lệ trễ hạn theo tháng và thủ tục, thời gian giải quyết theo thủ tục và tháng.
- Số liệu lấy từ 96 hồ sơ giả của `make du-lieu-demo`, đi qua Parquet, DuckDB, dbt. Cách đọc từng biểu đồ: [Dashboard báo cáo](../bao-cao.md).

### Luồng 7 · [H] Cắm gói thủ tục mới không sửa mã

**Thao tác:**

```bash
python3 scripts/goi_vi_du.py --ra thu-tuc   # gói "Xác nhận thông tin về cư trú" lấy nguyên từ docs/thu-tuc.md
ls thu-tuc/xac-nhan-cu-tru/
make nap-thu-tuc
```

Sau đó ở tab 2, tải lại trang chủ và mở thủ tục **Xác nhận thông tin về cư trú**.

**Kết quả mong đợi:**
- Thư mục gói có năm tệp: mô tả, quy trình BPMN, JSON Schema thành phần hồ sơ, dữ liệu mẫu, README.
- `make nap-thu-tuc` báo gói hợp lệ, deploy BPMN lên Flowable, ghi danh mục; không sửa mã, không khởi động lại dịch vụ. Gói lỗi thì bộ nạp chỉ rõ tệp và dòng.
- Thủ tục mới có trên cổng công dân, form nộp sinh từ schema của gói. Hướng dẫn tự viết gói: [Thêm một thủ tục mới](../thu-tuc.md).

## 4. Sau khi chạy

Rút gói ví dụ của luồng 7:

```bash
rm -rf thu-tuc/xac-nhan-cu-tru && make nap-thu-tuc
```

Quay lại toàn bộ bảy luồng thành một video MP4 (3–5 phút), ghi ra thư mục **ngoài repo**:

```bash
make quay-demo XUAT_PY=.venv/bin/python VIDEO=../video-demo
```

Lệnh quay đặt mật khẩu và OTP ngẫu nhiên cho tài khoản mẫu rồi trả chúng về trạng thái ban đầu, nên sau đó chạy lại `make demo-users` và cài lại OTP. Không commit video vào repo.

Lỗi khi cài đặt, đăng nhập, lấy token: [Cài đặt §7 Xử lý lỗi thường gặp](../cai-dat.md#7-xử-lý-lỗi-thường-gặp).

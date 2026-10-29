# Kịch bản trình bày 15 phút

Kịch bản chung kết OLP PMNM 2026 của đội DTU_DZ_2. Theo thể lệ, 15 phút phải đủ bốn phần: **giải pháp thiết kế và lựa chọn công nghệ**, **tính năng nền tảng và bài toán minh họa**, **demo**, **định hướng phát triển**. Phần demo đi qua cả bốn không gian H-P-D-I trên hệ thống chạy thật, với dữ liệu mẫu giả.

| Mục | Ở đâu |
|---|---|
| Lịch theo phút | [mục 2](#2-lịch-15-phút) |
| Lời thoại và thao tác từng bước demo | [mục 3](#3-demo-từng-bước) |
| Khi demo hỏng | [mục 4](#4-khi-demo-hỏng) |
| Câu hỏi giám khảo hay gặp | [mục 5](#5-câu-hỏi-giám-khảo-và-câu-trả-lời) |
| Dàn ý slide | [mục 6](#6-dàn-ý-slide) |

## 1. Chuẩn bị

### 1.1 Trước buổi trình bày một ngày

Chạy trên laptop trình diễn (16 GB RAM trở lên; Docker được cấp ít nhất 12 GB khi bật cả profile `ai`):

```bash
cp .env.example .env
# trong .env: LLM_PROVIDER=ollama và DXOS_SU_KIEN_QUET_GIAY=30 (cảnh báo sắp trễ hạn hiện sau ≤ 30 giây)
make up-ai        # lõi + Ollama (Qwen2.5 7B + bge-m3, tải ~6 GB lần đầu) + OCR
make up-bi        # thêm Superset
make smoke        # phải kết thúc bằng "0 trượt"
make du-lieu-demo # 96 hồ sơ lịch sử giả, 1 hồ sơ sắp trễ hạn có thông báo, nạp kho dữ liệu cho dashboard
make demo-users   # một mật khẩu chung cho mọi tài khoản mẫu, in ra một lần: chép vào trình quản lý mật khẩu
```

Qwen2.5 7B chạy CPU trong Docker trả lời chậm: đo ngày 29/10/2026 trên MacBook arm64, câu hỏi đầu mất hơn 3 phút. Trên Mac nên cài Ollama ngay trên máy để dùng GPU Apple (`ollama pull qwen2.5:7b && ollama pull bge-m3`, `.env`: `LLM_BASE_URL=http://host.docker.internal:11434`, xem [Cài đặt §4](../cai-dat.md#4-cấu-hình-trước-khi-chạy)). Đo lại thời gian trả lời trên máy trình diễn. Quá 20 giây thì làm theo cách "gửi trước, xem sau" ở demo 1.

Sau đó đăng nhập một lần bằng `canbo01` và `lanhdao01` ở `http://localhost:9080/can-bo`, rồi quét mã QR bằng ứng dụng OTP trên điện thoại người trình bày. Không làm bước này trên máy chiếu.

Quay sẵn video dự phòng ngay trên hệ thống này (mục [4](#4-khi-demo-hỏng)), rồi chạy lại `make demo-users` và cài lại OTP, vì lệnh quay trả các tài khoản mẫu về trạng thái ban đầu:

```bash
make quay-demo XUAT_PY=.venv/bin/python VIDEO=../video-demo   # MP4 3–5 phút, ghi NGOÀI repo (venv: scripts/quay_demo.py)
```

### 1.2 Một giờ trước giờ trình bày

- `make up-ai && make up-bi` rồi `make ps`: dịch vụ chạy nền ở trạng thái `healthy`, dịch vụ một lần ở `Exited (0)`.
- Hỏi trợ lý một câu bất kỳ để Ollama nạp mô hình vào RAM. Lần hỏi đầu chậm nhất.
- Mở sẵn các tab trình duyệt theo thứ tự trình diễn. Dùng **hai cửa sổ ẩn danh** để phiên công dân và phiên cán bộ không lẫn nhau:

| Tab | Địa chỉ | Phiên |
|---|---|---|
| 1 | `http://localhost:9080/hoi-dap` | cửa sổ A, chưa đăng nhập |
| 2 | `http://localhost:9080/thu-tuc/KS01` | cửa sổ A (công dân `congdan01` đăng nhập khi nộp) |
| 3 | `http://localhost:9080/can-bo` | cửa sổ B (`canbo01`, rồi đăng xuất, `lanhdao01`) |
| 4 | `http://localhost:9080/bao-cao/superset/dashboard/hieu-suat-mot-cua/` (hoặc mục "Báo cáo hiệu suất" của cổng cán bộ), bấm "Sign in with Keycloak" | cửa sổ B, mở **sau** khi `lanhdao01` đã đăng nhập ở tab 3 (SSO không hỏi lại mật khẩu) |
| 5 | terminal, thư mục repo, chữ cỡ lớn | |

- Lưu sẵn hai ảnh giấy tờ mẫu giả: `http://localhost:9080/mau-gia/giay-chung-sinh.png` và `http://localhost:9080/mau-gia/giay-to-tuy-than.png`. Chuẩn bị thêm một tệp PNG hoặc PDF bất kỳ làm tờ khai.
- Tắt thông báo hệ điều hành; phóng to trình duyệt 125 %.
- Mở sẵn video dự phòng trong trình phát, dừng ở giây đầu.

### 1.3 Phân vai

| Người | Phần |
|---|---|
| Trưởng nhóm (V1) | mở đầu, kiến trúc, mã nguồn mở, kết luận; trả lời câu hỏi về lõi, bảo mật, giấy phép |
| V2 | demo bước 2–6 (một cửa, Flowable, ký số, kiểm toán, Superset) |
| V3 | demo bước 1 và 7 (trợ lý, cắm gói); trả lời câu hỏi về OCR, RAG |

Người không nói thì giữ chuột cho người đang nói. Mỗi người nói đúng phần mình đã commit, vì thể lệ chấm cả việc hiểu sản phẩm.

## 2. Lịch 15 phút

| Phút | Phần | Nội dung | Slide hoặc màn hình |
|---|---|---|---|
| 0:00–1:15 | Mở đầu | Vấn đề ở bộ phận một cửa cấp xã, bảng "Trước và sau" | slide 1–2 |
| 1:15–3:00 | Giải pháp thiết kế, lựa chọn công nghệ | Hai tầng, gói thủ tục cắm–rút, bốn dịch vụ bắt buộc, vì sao chọn từng thành phần | slide 3–5 |
| 3:00–3:45 | Bài toán minh họa | Một hồ sơ khai sinh đi qua hệ thống, H-P-D-I | slide 6 |
| 3:45–4:45 | Demo 1 · [I] | Công dân hỏi trợ lý thủ tục | tab 1 |
| 4:45–6:15 | Demo 2 · [P] | Nộp hồ sơ khai sinh: Poka-yoke, OCR tự điền, biên nhận ký số | tab 2 |
| 6:15–7:45 | Demo 3 · [P] | Cán bộ: thông báo sắp trễ hạn, xác nhận máy đọc, xử lý theo bước Flowable | tab 3 |
| 7:45–8:45 | Demo 4 · [P] | Lãnh đạo phê duyệt, công dân tải kết quả ký số, xác minh chữ ký | tab 3, tab 2, terminal |
| 8:45–9:30 | Demo 5 · [D] | Xác minh chuỗi băm nhật ký kiểm toán | terminal |
| 9:30–10:15 | Demo 6 · [D] | Dashboard Superset | tab 4 |
| 10:15–11:30 | Demo 7 · [H] | Thêm gói thủ tục mới không sửa mã | terminal, tab 2 |
| 11:30–13:00 | Tính năng nền tảng, nguồn mở | GPL-3.0, REUSE, release, CI, dữ liệu mở, tài liệu song ngữ | slide 7–8 |
| 13:00–14:30 | Định hướng phát triển | Lộ trình, kêu gọi cộng đồng | slide 9–10 |
| 14:30–15:00 | Dự phòng | Bù chỗ chậm; nếu đúng giờ thì kết thúc sớm | |

Mốc kiểm soát: **phút 6:15** phải xong demo 2, **phút 10:15** phải xong demo 6. Trễ hơn 45 giây ở một mốc thì bỏ phần "xác minh chữ ký" của demo 4 và chỉ nói một câu về Superset.

## 3. Demo từng bước

Lời thoại viết để nói, không đọc. Chữ nghiêng là thao tác.

### Demo 1 · [I] Trợ lý thủ tục (1 phút)

*Tab 1. Gõ: "Đăng ký khai sinh cho con cần những giấy tờ gì và mất bao lâu?", bấm Gửi câu hỏi.* Nếu trên máy trình diễn câu trả lời mất quá 20 giây: nói đoạn lời thoại đầu, rồi chuyển ngay sang demo 2. Quay lại tab 1 sau khi xong demo 2 để nói đoạn thứ hai.

> "Trước khi đi lên xã, người dân hỏi trợ lý. Trợ lý tìm trong văn bản pháp luật và các gói thủ tục của xã bằng hai cách cùng lúc: tìm theo từ khóa và tìm theo nghĩa. Rồi Qwen2.5 7B, chạy ngay trên máy của xã, soạn câu trả lời."

*Khi câu trả lời hiện ra, trỏ vào số [1], [2] và mục Nguồn tham khảo.*

> "Câu trả lời nào cũng phải có nguồn. Máy chủ bỏ những trích dẫn không có thật. Nếu mô hình tắt hoặc lỗi, trợ lý vẫn trả về đúng các đoạn văn bản liên quan. Dữ liệu người dân không rời khỏi xã."

### Demo 2 · [P] Nộp hồ sơ khai sinh (1,5 phút)

*Tab 2: trang KS01 có thành phần hồ sơ, thời hạn, lệ phí. Bấm Bắt đầu nộp, đăng nhập `congdan01`, nhập số điện thoại 0900 000 108. Ở bước Giấy tờ, chỉ chọn tệp tờ khai rồi bấm Tiếp tục.*

> "Thiếu giấy chứng sinh: cổng chặn ngay, chưa có request nào gửi lên máy chủ. Đây là Poka-yoke. Luật kiểm tra không viết trong mã web mà nằm trong JSON Schema của gói thủ tục. Máy chủ kiểm lại đúng schema đó, nên ai gọi thẳng API mà thiếu giấy cũng nhận lỗi 422 và quy trình không khởi tạo."

*Chọn hai ảnh mẫu giả, bấm "Đọc thông tin từ ảnh" ở từng ảnh.*

> "Ảnh giấy chứng sinh, giấy tờ tùy thân được đọc bằng PaddleOCR và VietOCR, chạy ONNX Runtime ngay trong máy, không gọi dịch vụ ngoài. Ô nào máy không chắc thì được đánh dấu để người dân kiểm lại."

*Tiếp tục, Đồng ý và nộp hồ sơ. Trỏ vào mã hồ sơ, bấm tải biên nhận.*

> "Người dân có mã hồ sơ và giấy biên nhận PDF có chữ ký số của xã. Hạn trả kết quả được tính theo ngày làm việc, bỏ thứ Bảy, Chủ nhật và ngày lễ."

### Demo 3 · [P] Cán bộ hộ tịch (1,5 phút)

*Tab 3: đăng nhập `canbo01`, nhập mật khẩu và mã OTP từ điện thoại.*

> "Cán bộ đăng nhập một lần qua Keycloak và bắt buộc có OTP. Cán bộ chỉ thấy hồ sơ thuộc lĩnh vực mình phụ trách. Việc lọc này do PostgreSQL Row-Level Security làm, không phải giao diện tự ẩn đi."

*Bấm chuông, mở trang Thông báo: hồ sơ của "Đỗ Thị Sắp Trễ" còn chưa tới 1 ngày.*

> "Mỗi bước của hồ sơ phát một sự kiện qua RabbitMQ. Còn một ngày làm việc tới hạn thì cán bộ phụ trách nhận cảnh báo ngay trên chuông, đẩy qua SSE, không phải tải lại trang."

*Mở hồ sơ vừa nộp. Kéo tới "Thông tin đọc từ giấy tờ": so ảnh gốc với cột máy đọc, bấm "Xác nhận đúng với ảnh gốc" cho từng giấy.*

> "Máy chỉ đề xuất, cán bộ quyết định. Đây là human-in-the-loop: cán bộ so với ảnh gốc rồi xác nhận. Đã xác nhận thì không sửa được nữa, và nhật ký kiểm toán ghi lại có bao nhiêu trường cán bộ đã sửa so với máy đọc."

*Xử lý bước: chọn Có, Hoàn thành bước (Tiếp nhận), rồi lặp lại cho Thẩm định.*

> "Các bước và ô nhập ở bên phải lấy từ BPMN của gói khai sinh, chạy trên Flowable. Trạng thái hồ sơ đi theo đúng bước của quy trình."

### Demo 4 · [P] Lãnh đạo ký, công dân nhận kết quả (1 phút)

*Đăng xuất, đăng nhập `lanhdao01` kèm OTP, mở hồ sơ, Phê duyệt: Có, Hoàn thành bước.*

> "Lãnh đạo phê duyệt. Gotenberg in thông báo kết quả, pyHanko ký PAdES bằng chứng thư do CA nội bộ của xã cấp. CA này là step-ca, khóa của nó nằm trong OpenBao."

*Tab 2: Hồ sơ của tôi, mở hồ sơ, tải thông báo kết quả. Sang terminal:*

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/pdf' \
  --data-binary @ket-qua.pdf http://localhost:9080/files/xac-minh | jq '{hopLe, toanVen, nguoiKy}'
```

> "Ai cầm tờ giấy này cũng xác minh được là do xã phát hành và chưa bị sửa. Sửa một byte thì kết quả trả về không toàn vẹn."

### Demo 5 · [D] Nhật ký kiểm toán (45 giây)

*Terminal (token lãnh đạo lấy sẵn trong biến `TOKEN`):*

```bash
DXOS_TOKEN=$TOKEN python3 mot-cua/backend/kiem_toan.py --api http://localhost:9080/api
```

> "Mọi thao tác vừa rồi đều vào nhật ký kiểm toán chỉ ghi thêm: nộp hồ sơ, tải tệp, xác nhận OCR, chuyển bước, ký. Các bản ghi nối với nhau bằng chuỗi băm SHA-256. Trigger chặn sửa và xóa, kể cả với superuser. Công cụ này không tin hàm kiểm tra trong cơ sở dữ liệu: nó đọc qua API rồi tự tính lại từng mắt xích."

### Demo 6 · [D] Dashboard lãnh đạo (45 giây)

*Tab 4: Superset, đã đăng nhập SSO bằng tài khoản lãnh đạo.*

> "Hồ sơ đã đóng được khử định danh, xuất ra Parquet, đọc bằng DuckDB, rồi dbt dựng bảng báo cáo có lineage và test dữ liệu. Lãnh đạo xem thời gian giải quyết và tỷ lệ trễ hạn theo tháng, theo thủ tục, không cần cộng sổ. Số liệu ở đây là dữ liệu mẫu giả."

### Demo 7 · [H] Cắm gói thủ tục mới (1,25 phút)

*Terminal:*

```bash
python3 scripts/goi_vi_du.py --ra thu-tuc   # gói "Xác nhận thông tin về cư trú" lấy nguyên từ docs/thu-tuc.md
ls thu-tuc/xac-nhan-cu-tru/
make nap-thu-tuc
```

> "Xã có hàng trăm thủ tục, nên đơn vị cắm–rút của chúng em là gói thủ tục. Một gói là một thư mục năm tệp: mô tả, quy trình BPMN, JSON Schema thành phần hồ sơ, dữ liệu mẫu, README. Bộ nạp kiểm gói, deploy BPMN lên Flowable, ghi danh mục. Không sửa dòng mã nào, không khởi động lại dịch vụ nào."

*Tab 2: tải lại trang chủ, mở thủ tục "Xác nhận thông tin về cư trú": form nộp đã sinh từ schema.*

> "Smoke test tự chạy hết quy trình của gói mới bằng dữ liệu mẫu của chính gói. Hướng dẫn từ A đến Z có trên trang tài liệu, song ngữ."

*Sau buổi: `rm -rf thu-tuc/xac-nhan-cu-tru && make nap-thu-tuc` để rút gói.*

## 4. Khi demo hỏng

Nguyên tắc: không gỡ lỗi trước giám khảo quá **20 giây**. Nói một câu, chuyển sang phương án dưới đây, rồi đi tiếp theo lịch.

| Sự cố | Dấu hiệu | Làm ngay |
|---|---|---|
| Trợ lý trả lời quá 30 giây | vẫn hiện "Đang tra cứu tài liệu và soạn câu trả lời…" | Nói: "mô hình 7B chạy CPU; khi mô hình tắt trợ lý vẫn trả tài liệu có nguồn". Chuyển sang demo 2, quay lại tab 1 sau khi xong. Nếu vẫn chưa có, chiếu đoạn 1 của video |
| OCR không đọc được | báo lỗi dưới nút đọc | Nộp không cần OCR (OCR là tùy chọn); nói về HITL ở demo 3, chiếu đoạn 2 của video |
| Đăng nhập OTP bị từ chối | "Mã không hợp lệ" | Chờ mã mới (30 giây), nhập lại. Lần hai vẫn lỗi: đồng hồ VM Docker lệch sau khi máy ngủ, chạy `docker run --rm --privileged alpine hwclock -s` rồi thử lại |
| Hồ sơ không có trong hộp việc | danh sách trống | Kiểm tra đúng cán bộ hộ tịch (`canbo01`). Mở hồ sơ mẫu sẵn có (HSMAU-000002) để trình bày phần xử lý |
| Không có thông báo sắp trễ | chuông không có số | `make du-lieu-demo` ở terminal (≤ 1 phút với `DXOS_SU_KIEN_QUET_GIAY=30`); trong lúc chờ, làm tiếp phần xác nhận OCR |
| Superset trắng hoặc lỗi | không có biểu đồ | `make kho-du-lieu`, tải lại; vẫn lỗi thì chiếu đoạn 6 của video |
| `make nap-thu-tuc` lỗi | không có dòng "hợp lệ" | Đọc dòng lỗi (bộ nạp chỉ rõ tệp, dòng): đó cũng là một tính năng. Rút gói và chiếu đoạn 7 |
| Cả hệ thống không lên, máy treo | | Chiếu **video dự phòng** từ đầu, thuyết minh trực tiếp theo đúng lời thoại; video dài 3–5 phút nên tiết kiệm thời gian cho phần hỏi đáp |
| Máy chiếu không nhận laptop | | Laptop dự phòng đã chạy `make up-ai && make up-bi`, hoặc phát video từ USB |

Video dự phòng được quay bằng `make quay-demo VIDEO=<thư mục ngoài repo>` trên đúng hệ thống trình diễn. Video có bảy đoạn đúng thứ tự mục 3, mỗi đoạn mở đầu bằng khung tiêu đề nên dễ tua tới. Phần chờ mô hình trả lời được tua nhanh. Không commit video vào repo.

## 5. Câu hỏi giám khảo và câu trả lời

| Câu hỏi | Trả lời ngắn | Bằng chứng |
|---|---|---|
| Tầng 1 có thật sự "headless", không chứa nghiệp vụ? | Có. `nen-tang/` không có bảng, vai trò hay thủ tục nào; mọi nghiệp vụ nằm ở `mot-cua/` và gói `thu-tuc/`. Tầng 2 chỉ gọi lõi qua APISIX | `docs/architecture.md` §2 |
| Vì sao "cắm–rút" là gói thủ tục mà không phải ứng dụng? | Ở cấp xã, thứ thay đổi liên tục là thủ tục (hàng trăm thủ tục); tiếp nhận, phân quyền, hạn, lưu tệp thì giống nhau. Thêm thủ tục là thêm thư mục, đã chứng minh bằng 4 gói và demo 7 | `docs/thu-tuc.md` |
| Không có modeler BPMN thì viết quy trình thế nào? | BPMN 2.0 viết XML tay, vì bpmn-js không theo giấy phép OSI. Bộ kiểm trong CI bắt lỗi cấu trúc; sơ đồ Mermaid trong README của gói cho người đọc | `docs/architecture.md` §7 |
| Bảo mật dữ liệu cá nhân? | Ba lớp: JWT kiểm ở APISIX và ở PostgREST/backend, RLS trong CSDL; mọi bí mật trong OpenBao (mỗi dịch vụ một AppRole); tệp quét ClamAV trước khi lưu; sự kiện và kho dữ liệu không chứa dữ liệu cá nhân; pgAudit | `de-thi-mapping.md` B4 |
| Nhật ký kiểm toán chống ai sửa? | Chống cả quản trị viên: trigger chặn sửa, xóa, TRUNCATE kể cả superuser; nếu ai tắt trigger để sửa thì chuỗi băm đứt đúng chỗ đó. Có thể lưu mốc (stt, băm) ra ngoài để chống viết lại cả chuỗi | `docs/architecture.md` §4.6 |
| AI có quyết định thay cán bộ không? | Không. OCR chỉ đề xuất, cán bộ xác nhận và hệ thống ghi số trường bị sửa. Trợ lý chỉ trả lời có nguồn, không nộp hay duyệt hồ sơ | §4.14, §4.15 |
| Vì sao Qwen2.5 7B, không Llama hay Gemma? | Qwen2.5 7B/14B theo Apache-2.0. Llama, Gemma có điều khoản riêng, không phải OSI. Chạy tại chỗ, đổi được qua `LLM_PROVIDER` | `DEPENDENCIES.md` |
| Garage (AGPL), ClamAV (GPL-2.0) có "lây" giấy phép không? | Chạy như dịch vụ riêng bằng image gốc, không sửa, không liên kết; giao tiếp qua mạng (S3, clamd). Dự án theo GPL-3.0-or-later, kiểm bằng `reuse lint` | `NOTICE`, `DEPENDENCIES.md` |
| Vì sao chọn GPL-3.0? | Phần mềm chính quyền số là tài sản công: bản sửa đổi được phân phối lại vẫn phải mở mã. Chọn bản 3 vì tương thích với các thành phần Apache-2.0 | README mục Giấy phép |
| Chạy được ở xã thật không, cần máy gì? | Profile `core` chạy trên laptop 16 GB (Docker dùng ~2,3 GB); AI và dashboard là profile tùy chọn. Một máy chủ ở xã đủ dùng | `docs/cai-dat.md` |
| Đã có người dùng thật chưa? | Chưa có VPS công khai. Đội sẽ mời cán bộ xã dùng thử khi có VPS; phản hồi được ghi thành issue nhãn `user-feedback`. Không tạo số liệu ảo | `docs/PLAN.md` |
| Kiểm thử thế nào? | Mỗi PR chạy CI 8 job: kiểm giấy phép và gói, shellcheck, yamllint, REUSE, BPMN, test backend, test SQL/RLS, kho dữ liệu dbt. Ngoài ra smoke đầu–cuối hơn 1100 kiểm tra trên volume trống trước mỗi bản phát hành | `.github/workflows/check.yml` |
| Tích hợp Cổng Dịch vụ công quốc gia, CSDL dân cư? | Chưa làm, đó là định hướng (slide 9). Kiến trúc cho phép vì mọi thứ đi qua API Gateway và sự kiện RabbitMQ | |
| Đóng góp của từng thành viên? | Theo lịch sử commit và PR trên GitHub; mỗi người trình bày đúng phần mình làm | GitHub Insights |

## 6. Dàn ý slide

Mười slide, mỗi slide một ý. Số liệu lấy từ repo tại thời điểm nộp; không dùng số sao, fork hay người dùng ảo.

| # | Tiêu đề | Ý chính | Hình |
|---|---|---|---|
| 1 | Commune DX-OS: Hệ điều hành Chính quyền số Cấp xã | Tên đội DTU_DZ_2, trường, đề DX-OS Open-Core, link repo và trang tài liệu (mã QR) | logo, banner |
| 2 | Bộ phận một cửa hôm nay | Người dân đi lại nhiều lần, thiếu giấy bị trả về, hồ sơ thất lạc, hạn tính tay, thêm thủ tục phải chờ sửa phần mềm | bảng "Trước và sau" rút gọn |
| 3 | Kiến trúc hai tầng | Tầng 1 headless chỉ API; Tầng 2 bộ máy một cửa và các cổng; Tầng 2 chỉ gọi lõi qua APISIX | `docs/images/kien-truc-2-tang.webp` |
| 4 | Bốn dịch vụ bắt buộc và lựa chọn công nghệ | SSO Keycloak + OTP; API Gateway APISIX; dữ liệu PostgreSQL + RLS + PostgREST, Garage + ClamAV; Workflow Flowable. Vì sao: OSI, image gốc, chạy một máy | bảng 4 dòng |
| 5 | Gói thủ tục: đơn vị cắm–rút | 5 tệp, bộ nạp kiểm và deploy, 4 gói hiện có, smoke tự chạy gói mới | cây thư mục `thu-tuc/` |
| 6 | Một hồ sơ đi qua hệ thống (H-P-D-I) | H: hai cổng, SSO; P: Poka-yoke, Flowable, ký số, cảnh báo trễ hạn; D: kiểm toán chuỗi băm, kho dữ liệu, Superset; I: OCR + HITL, trợ lý RAG | `docs/images/luong-ho-so.webp` |
| (demo) | Chuyển sang trình duyệt | | |
| 7 | Nguồn mở đúng nghĩa | GPL-3.0-or-later, REUSE 3.3 đạt 100 %, mọi thành phần OSI, AGPL/GPL chạy tách; số bản phát hành có `.tar.gz` + SHA256SUMS; CHANGELOG sinh bằng git-cliff | huy hiệu CI, trang Releases |
| 8 | Cộng đồng và bền vững | Tài liệu song ngữ (MkDocs), hướng dẫn thêm gói A–Z, dữ liệu mở thủ tục cấp xã CC-BY-4.0, issue/milestone/Project công khai, CI 8 job | trang tài liệu, `du-lieu-mo/` |
| 9 | Định hướng phát triển | Triển khai thử ở một xã (VPS, người dùng thật), thông báo tới công dân, lịch công tác, thêm gói thủ tục do cộng đồng đóng góp, liên thông cổng dịch vụ công | lộ trình 3 mốc |
| 10 | Cảm ơn, mời đóng góp | Repo, trang tài liệu, cách mở issue "Thủ tục mới" | mã QR repo |

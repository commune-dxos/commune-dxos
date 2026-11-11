<!-- SPDX-FileCopyrightText: 2026 DTU_DZ_2 -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Hướng dẫn buổi dùng thử

Trang này dành cho người tổ chức và người tham gia buổi dùng thử Commune DX-OS với người dùng thật: cán bộ xã, sinh viên, người dân. Mỗi người làm vài nhiệm vụ ngắn theo đúng vai của mình, rồi báo lại bằng mẫu **Phản hồi dùng thử** trên GitHub.

| Mục | Dành cho |
|---|---|
| [1. Chuẩn bị buổi thử](#1-chuẩn-bị-buổi-thử) | người tổ chức |
| [2. Nhiệm vụ](#2-nhiệm-vụ) | người thử |
| [3. Báo lại](#3-báo-lại) | người thử |
| [4. Sau buổi thử](#4-sau-buổi-thử) | người tổ chức |

Mọi tài khoản, hồ sơ, mã hồ sơ, số điện thoại trong bản thử là **dữ liệu giả**. Không nhập họ tên, số CCCD, số điện thoại hay ảnh giấy tờ thật của bất kỳ ai.

## 1. Chuẩn bị buổi thử

### 1.1 Chọn nơi chạy

| Bản | Địa chỉ | Có gì |
|---|---|---|
| Chạy trên máy (mặc định trong trang này) | `http://localhost:9080` | đủ mọi phần nếu bật thêm `make up-bi`, `make up-ai` |
| Demo công khai | `https://commune.dzfullstack.com` | profile `core` và `bi`: cổng công dân, cổng cán bộ, tra cứu, dashboard `/bao-cao/`, hỏi đáp chỉ tìm kiếm. **Chưa bật** `up-ai` (trợ lý có mô hình ngôn ngữ) vì máy chủ thiếu RAM |

Khi thử trên demo công khai, thay `http://localhost:9080` trong trang này bằng `https://commune.dzfullstack.com`. Nhiệm vụ 5 chỉ trả đoạn tài liệu liên quan, không soạn câu trả lời.

### 1.2 Dựng bản trên máy

Theo [Cài đặt và chạy](cai-dat.md):

```bash
cp .env.example .env
make up            # lõi + bộ máy một cửa + gói thủ tục + cổng công dân
make smoke         # phải kết thúc bằng "0 trượt"
make du-lieu-demo  # tùy chọn: hồ sơ lịch sử giả cho hộp việc và dashboard
make demo-users    # đặt một mật khẩu chung cho tài khoản mẫu, in ra một lần
```

Muốn thử nhiệm vụ 5 có mô hình ngôn ngữ và nhiệm vụ 6 thì thêm `make up-ai` (đặt `LLM_PROVIDER=ollama` trong `.env`) và `make up-bi` (rồi `make kho-du-lieu`). Hai profile này cần thêm RAM, xem [Cài đặt §4](cai-dat.md#4-cấu-hình-trước-khi-chạy).

### 1.3 Tài khoản mẫu

`make demo-users` đặt mật khẩu cho các tài khoản dưới đây. Mật khẩu in ra **một lần** trên màn hình người tổ chức:

- **không** ghi mật khẩu vào trang này, issue, tin nhắn nhóm hay ảnh chụp màn hình;
- đọc trực tiếp hoặc đưa cho từng người thử trên giấy, thu lại sau buổi;
- xong buổi thì chạy lại `make demo-users` để đổi mật khẩu.

| Tài khoản | Vai | Dùng cho nhiệm vụ |
|---|---|---|
| `congdan01`, `congdan02` | công dân | 1, 2 |
| `canbo01` (hộ tịch), `canbo02` (chứng thực), `canbo03` (đất đai) | cán bộ | 3 |
| `lanhdao01` | lãnh đạo xã | 4 |
| `vanthu01` | văn thư | 4 (soạn dự thảo văn bản cho lãnh đạo ký) |

Mỗi người thử một tài khoản riêng; hai người cùng vai thì dùng `congdan01`/`congdan02`, `canbo01`/`canbo02`. Trên demo công khai, đội cấp tài khoản theo cùng cách và không đăng mật khẩu ở đâu cả.

Cán bộ, lãnh đạo, văn thư phải có **mã OTP**: lần đăng nhập đầu, quét mã QR bằng ứng dụng OTP (FreeOTP, Google Authenticator…) trên điện thoại của chính người thử. Dặn người thử cài ứng dụng trước buổi.

### 1.4 Giấy tờ mẫu để tải lên

Nộp hồ sơ cần tải tệp. Chuẩn bị sẵn vài ảnh hoặc PDF **không chứa thông tin thật**, ví dụ ảnh chụp một tờ giấy trắng ghi chữ "MẪU – GIẤY CHỨNG SINH". Không dùng ảnh giấy tờ của người thật.

### 1.5 Trong buổi thử

- Mỗi người 20–30 phút, làm các nhiệm vụ của vai mình theo thứ tự.
- Người tổ chức **không chỉ cách bấm**. Người thử bí quá 2 phút thì ghi lại chỗ bí (đó là phản hồi có giá trị nhất), rồi mới gợi ý.
- Đề nghị người thử nói to điều mình đang nghĩ ("tôi tìm nút nộp…").
- Ghi lại mã hồ sơ người thử tạo ra để cán bộ và lãnh đạo xử lý tiếp ở nhiệm vụ 3, 4.

## 2. Nhiệm vụ

Làm theo thứ tự: hồ sơ công dân nộp ở nhiệm vụ 1 là hồ sơ cán bộ và lãnh đạo xử lý ở nhiệm vụ 3, 4. Sau mỗi nhiệm vụ, trả lời câu hỏi in nghiêng; có chuyện muốn báo thì gửi một phản hồi (mục 3).

### Nhiệm vụ 1. Tìm thủ tục và nộp hồ sơ – công dân

1. Mở `http://localhost:9080/`, tìm thủ tục **Đăng ký khai sinh**, đọc phần giấy tờ cần chuẩn bị.
2. Bấm **Bắt đầu nộp**, đăng nhập bằng `congdan01`.
3. Điền từng bước, tải giấy tờ mẫu. Thử bỏ trống một giấy tờ bắt buộc rồi bấm tiếp, xem cổng báo gì.
4. Tải đủ, kiểm tra lại, đồng ý và nộp. Ghi lại **mã hồ sơ** ở trang "Đã nộp".

*Câu hỏi: Bạn có biết mình còn thiếu giấy tờ gì trước khi bấm nộp không? Chỗ nào làm bạn phải dừng lại suy nghĩ?*

### Nhiệm vụ 2. Tra cứu tiến độ hồ sơ – công dân

1. Đăng xuất, bấm **Tra cứu hồ sơ** (`/tra-cuu`), nhập mã hồ sơ vừa nộp và 4 số cuối số điện thoại đã khai.
2. Đăng nhập lại, mở **Hồ sơ của tôi** (`/ho-so`), mở hồ sơ đó, tải **biên nhận hồ sơ** có chữ ký số.
3. Sau khi cán bộ xử lý (nhiệm vụ 3, 4), xem lại hồ sơ đổi trạng thái thế nào.

Ý nghĩa từng trạng thái: [Tra cứu hồ sơ đã nộp](tra-cuu-ho-so.md).

*Câu hỏi: Nhìn trang tra cứu, bạn có biết hồ sơ đang ở bước nào và bao giờ có kết quả không?*

### Nhiệm vụ 3. Cán bộ tiếp nhận, thẩm định hồ sơ – cán bộ

1. Mở `http://localhost:9080/can-bo`, đăng nhập bằng `canbo01` (mật khẩu, rồi mã OTP).
2. Trong **hộp việc**, tìm hồ sơ có mã công dân vừa nộp. Xem người nộp, giấy tờ đã tải.
3. Ở ô **Xử lý bước**: câu **Đủ thành phần hồ sơ?** chọn Có, bấm **Hoàn thành bước**; sang bước Thẩm định, câu **Đạt yêu cầu?** chọn Có, ghi chú trình lãnh đạo.
4. Thử thêm (tùy chọn) với một hồ sơ khác: ở bước tiếp nhận chọn **Không**, ghi cần bổ sung gì; công dân thấy yêu cầu ở "Hồ sơ của tôi" và nộp lại.

Luồng chi tiết: [Cổng cán bộ – luồng xử lý hồ sơ](cong-can-bo.md).

*Câu hỏi: So với cách tiếp nhận hồ sơ hiện nay ở xã, phần nào nhanh hơn, phần nào chậm hơn hoặc thiếu?*

### Nhiệm vụ 4. Lãnh đạo phê duyệt hồ sơ, ký văn bản – lãnh đạo, văn thư

1. Đăng nhập cổng cán bộ bằng `lanhdao01`. Mở hồ sơ cán bộ vừa trình ở nhiệm vụ 3, đọc ghi chú thẩm định, chọn **Phê duyệt: Có**, hoàn thành bước.
2. (Tùy chọn, cần thêm người văn thư) `vanthu01` vào **Sổ văn bản** (`/can-bo/van-ban`), soạn một dự thảo văn bản đi. `lanhdao01` bấm **Ký ban hành** trên dòng dự thảo đó, rồi tải PDF và thử thẻ **Xác minh PDF**.

*Câu hỏi: Lãnh đạo có đủ thông tin để quyết định ngay trên màn hình không, hay vẫn cần hỏi lại cán bộ?*

### Nhiệm vụ 5. Hỏi đáp thủ tục – mọi vai

1. Mở `http://localhost:9080/hoi-dap` (không cần đăng nhập).
2. Hỏi một câu bằng lời của bạn, ví dụ "làm giấy khai sinh cho con cần mang gì" hoặc "chứng thực bản sao mất bao lâu".
3. Mở nguồn dẫn kèm câu trả lời, đối chiếu.

Trên demo công khai và khi `LLM_PROVIDER=tat`, trang chỉ trả các đoạn tài liệu liên quan nhất; câu trả lời có dẫn nguồn do mô hình soạn chỉ có khi bật `make up-ai`.

*Câu hỏi: Câu trả lời có đúng điều bạn hỏi không? Bạn có tin nó đủ để mang giấy tờ đi nộp không?*

### Nhiệm vụ 6. Dashboard báo cáo – lãnh đạo, sinh viên

Trên máy cần chạy `make up-bi` (rồi `make kho-du-lieu`); demo công khai đã bật sẵn.

1. Mở `http://localhost:9080/bao-cao/`, đăng nhập bằng `lanhdao01`, mở dashboard **Hiệu suất một cửa**.
2. Tìm tỷ lệ trễ hạn theo tháng và thủ tục, số hồ sơ theo lĩnh vực.

*Câu hỏi: Con số nào bạn cần cho báo cáo hằng tháng mà dashboard chưa có?*

## 3. Báo lại

Mỗi chuyện muốn báo là **một phản hồi**:

1. Mở [Issues → New issue](https://github.com/commune-dxos/commune-dxos/issues/new/choose), chọn mẫu **Phản hồi dùng thử** (cần tài khoản GitHub; ai không có thì người tổ chức ghi hộ, gửi bằng tài khoản của đội).
2. Chọn vai, nhiệm vụ đang làm, loại phản hồi (lỗi, khó hiểu, góp ý, khen), mức độ ảnh hưởng.
3. Kể chuyện gì đã xảy ra: bấm gì, ở trang nào, thấy gì, mong thấy gì. Ghi **mã hồ sơ** nếu liên quan; ảnh chụp màn hình thì che thông tin cá nhân trước.
4. Ghi thiết bị, trình duyệt và nơi thử (demo công khai hay máy).

Phản hồi tự gắn nhãn `user-feedback`. Issue công khai: **không dán mật khẩu, mã OTP, họ tên, số điện thoại, số CCCD hay ảnh giấy tờ thật.**

Câu trả lời cho các câu hỏi in nghiêng ở mục 2 cũng gửi theo cách này, loại "Góp ý" hoặc "Khen".

## 4. Sau buổi thử

- Chạy lại `make demo-users` để đổi mật khẩu; trên demo công khai, đổi mật khẩu các tài khoản đã cấp.
- Đội đọc các issue `user-feedback`, gắn thêm nhãn thành phần (`mot-cua`, `thu-tuc`…) và milestone. Lỗi "Chặn" sửa trước.
- Sửa xong thì đóng issue, ghi PR đã sửa; người thử nhận thông báo qua GitHub.
- Danh sách phản hồi: [issue có nhãn `user-feedback`](https://github.com/commune-dxos/commune-dxos/issues?q=label%3Auser-feedback).

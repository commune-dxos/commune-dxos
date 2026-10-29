# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [SemVer](https://semver.org/lang/vi/).

## [Unreleased]

## [0.8.0] - 2026-10-29

### Tính năng mới

- **mot-cua:** Lịch công tác trong cổng cán bộ – văn thư soạn, lãnh đạo duyệt, chặn trùng địa điểm, RLS, kiểm toán ([#117](https://github.com/commune-dxos/commune-dxos/issues/117)) ([#118](https://github.com/commune-dxos/commune-dxos/issues/118))

### Kiểm thử

- **mot-cua:** Test sự kiện không chứa dữ liệu cá nhân không còn trượt ngẫu nhiên ([#115](https://github.com/commune-dxos/commune-dxos/issues/115)) ([#116](https://github.com/commune-dxos/commune-dxos/issues/116))
    - Giá trị canh gác "abc" có thể trùng một đoạn của id UUID4 ngẫu nhiên (~0,7 % mỗi lượt): đổi sang chuỗi có ký tự ngoài [0-9a-f-], số điện thoại khác số mẫu
    - Cố định id và luc của sự kiện trong test để chuỗi JSON được kiểm hoàn toàn xác định
    - Các assertNotIn khác của test backend đều kiểm khóa dict hoặc văn bản cố định, không cần sửa

## [0.7.0] - 2026-10-29

### Tính năng mới

- **thu-tuc:** Công bố bộ dữ liệu mở thủ tục hành chính cấp xã – danh mục + JSON Schema thành phần hồ sơ, CC-BY-4.0 ([#102](https://github.com/commune-dxos/commune-dxos/issues/102)) ([#103](https://github.com/commune-dxos/commune-dxos/issues/103))
    - du-lieu-mo/thu-tuc-cap-xa/: danh mục JSON + CSV, JSON Schema thành phần hồ sơ từng thủ tục, LICENSE CC-BY-4.0, README song ngữ
    - Sinh từ thu-tuc/*/ bằng make du-lieu-mo, make check báo lệch; REUSE.toml khai CC-BY-4.0 cho du-lieu-mo/**
    - Smoke đối chiếu bản công bố với API công khai; smoke 1158/1158 trên volume trống

### Sửa lỗi

- **nen-tang:** Nút "Sign in with Keycloak" của Superset về đúng /bao-cao/login/keycloak ([#110](https://github.com/commune-dxos/commune-dxos/issues/110)) ([#111](https://github.com/commune-dxos/commune-dxos/issues/111))
    - Superset 6.1 dựng link nút SSO cứng `/login/<provider>`, bỏ qua SUPERSET_APP_ROOT: APISIX thêm route /login/keycloak → 302 /bao-cao/login/keycloak, giữ ?next=; không sửa mã Superset
    - Smoke mục 4m: đọc mẫu href của nút trong JS Superset phục vụ, kiểm route chuyển hướng giữ next, đi theo nút tới Keycloak (client bao_cao_superset); smoke 1176/1176 trên volume trống (profile bi)
    - Kịch bản trình bày và video dự phòng bỏ đường vòng, bấm nút như người dùng; bảng route architecture §4.1 thêm /bao-cao, /login/keycloak

### Tài liệu

- **tai-lieu:** Dọn kế hoạch theo hiện trạng, tài liệu song ngữ, ví dụ gói thủ tục từ A đến Z ([#106](https://github.com/commune-dxos/commune-dxos/issues/106)) ([#107](https://github.com/commune-dxos/commune-dxos/issues/107))
    - docs/PLAN.md: bảng 7 bản đã phát hành, bỏ "PR chờ duyệt" của PR đã merge, dòng "Release v0.3.0" tuần 6 thành v0.7.0, đánh dấu 🔒 các dòng chờ người hướng dẫn (VPS, người dùng thật, tuần UX)
    - README: mục English đủ mọi mục chính, Quick start chạy từ máy sạch; trang tài liệu thêm tab English (docs/en/: tổng quan, Quick start, kiến trúc, đóng góp)
    - docs/thu-tuc.md: ví dụ song ngữ gói XNCT01 từ issue tới rút gói, đủ 5 tệp, lỗi thật của bộ kiểm, phân công cán bộ, kết quả smoke
- **trinh-bay:** Kịch bản trình bày 15 phút, script dữ liệu demo, video dự phòng đủ luồng H-P-D-I ([#108](https://github.com/commune-dxos/commune-dxos/issues/108)) ([#109](https://github.com/commune-dxos/commune-dxos/issues/109))
    - docs/trinh-bay/kich-ban-demo.md (MkDocs, mục Kiến trúc): chuẩn bị, lịch theo phút, lời thoại 7 bước demo H-P-D-I, phương án khi demo hỏng, câu hỏi giám khảo kèm trả lời, dàn ý 10 slide
    - make du-lieu-demo (scripts/du-lieu-demo.sh): 96 hồ sơ lịch sử giả cho dashboard, 1 hồ sơ khai sinh nộp thật qua APISIX có thông báo sắp trễ hạn cho canbo01, nạp kho dữ liệu nếu đã bật profile bi
    - make quay-demo VIDEO=<thư mục ngoài repo> (scripts/quay_video_demo.py): MP4 ≤ 5 phút, 7 đoạn có khung tiêu đề, lệnh xác minh chữ ký và chuỗi băm chạy thật, cắm rồi rút gói ví dụ
    - scripts/goi_vi_du.py: chép gói ví dụ XNCT01 từ docs/thu-tuc.md; make check kiểm gói này để tài liệu không lỗi thời

### Hạ tầng và CI

- Reuse lint đạt 100% đặc tả REUSE 3.3 và chạy trong CI ([#104](https://github.com/commune-dxos/commune-dxos/issues/104)) ([#105](https://github.com/commune-dxos/commune-dxos/issues/105))
    - reuse lint 438/438 tệp có bản quyền và giấy phép (REUSE 3.3); job CI reuse, phần reuse trong scripts/lint.sh
    - Bọc chuỗi SPDX trong mã bằng REUSE-IgnoreStart/End; REUSE.toml khai tệp reuse đoán sai bảng mã và mẫu Go template

## [0.6.0] - 2026-10-27

### Tính năng mới

- **cong-cong-dan:** Tra cứu tiến độ hồ sơ – không đăng nhập bằng mã + 4 số cuối điện thoại, Hồ sơ của tôi, nộp bổ sung ([#54](https://github.com/commune-dxos/commune-dxos/issues/54)) ([#88](https://github.com/commune-dxos/commune-dxos/issues/88))
- **mot-cua:** Thông báo sắp trễ hạn tới cán bộ – consumer RabbitMQ, chuông và trang thông báo cập nhật qua SSE ([#56](https://github.com/commune-dxos/commune-dxos/issues/56)) ([#89](https://github.com/commune-dxos/commune-dxos/issues/89))
    - Queue mot_cua.thong_bao (quorum, dead-letter mot_cua.thong_bao.loi) nhận ho_so.sap_tre_han;
      consumer trong mot-cua-worker gọi RPC ghi_thong_bao_sap_tre: mỗi cán bộ phụ trách lĩnh vực một
      thông báo, idempotent theo (cán bộ, hồ sơ, loại, mốc hạn)
    - Migration 013: mot_cua.thong_bao + thong_bao_kenh, RLS chỉ đọc của mình, chỉ được đánh dấu đã đọc;
      nội dung không có dữ liệu cá nhân người nộp
    - Kênh email/SMS chỉ giả lập (DXOS_THONG_BAO_KENH): ghi CSDL và log, không gửi ra ngoài
    - GET /workflow/thong-bao/luong (SSE) đọc qua PostgREST bằng token cán bộ, đẩy sự kiện khi số chưa
      đọc đổi, nhịp giữ kết nối, het-han khi token hết hạn
    - Test đơn vị backend và test SQL RLS cho thông báo
- **mot-cua:** Trợ lý thủ tục hành chính RAG – Meilisearch CE + pgvector, LLM_PROVIDER, ô hỏi đáp cổng công dân ([#91](https://github.com/commune-dxos/commune-dxos/issues/91)) ([#92](https://github.com/commune-dxos/commune-dxos/issues/92))
- **mot-cua:** Đọc giấy tờ bằng OCR (PP-OCRv5 + VietOCR trên ONNX Runtime) tự điền hồ sơ, cán bộ xác nhận ([#93](https://github.com/commune-dxos/commune-dxos/issues/93)) ([#94](https://github.com/commune-dxos/commune-dxos/issues/94))
    - Công dân chọn ảnh giấy tờ khi nộp → máy tự điền, đánh dấu trường cần kiểm tra; sau khi nộp máy đọc lại tệp đã lưu, cán bộ so ảnh gốc rồi xác nhận (HITL), kiểm toán chuỗi băm không ghi giá trị
    - Dịch vụ ocr (Tầng 1, profile ai): PP-OCRv5_mobile_det + VietOCR vgg_transformer chạy bằng ONNX Runtime, OpenCV 4.10 tự biên dịch; không PyTorch/PaddlePaddle, không Intel MKL/IPP, OpenSSL 1.1; mạng nội bộ, tắt số liệu sử dụng
    - Bảng doc_giay_to (migration 015) với RLS theo hồ sơ, xác nhận rồi không sửa được, CSDL tính trường bị sửa
    - Smoke 1064/1064 trên volume trống, test-sql 786/786; ảnh mẫu giả 14/14 trường đúng
- **mot-cua:** Wiki văn bản nội bộ cho cán bộ – tìm qua Meilisearch theo quyền RLS, phiên bản, kiểm toán ([#95](https://github.com/commune-dxos/commune-dxos/issues/95)) ([#96](https://github.com/commune-dxos/commune-dxos/issues/96))
    - Bảng wiki_van_ban (migration 016): RLS theo phạm vi toàn xã / lĩnh vực phụ trách / chỉ lãnh đạo, văn thư và lãnh đạo ghi, không xóa, phiên bản + lịch sử, kiểm toán wiki.* ghi SHA-256 nội dung
    - mot-cua-api /files/wiki: tìm qua Meilisearch (index mot-cua-wiki-van-ban) lọc theo vai rồi đối chiếu RLS, Meilisearch lỗi thì tìm trong CSDL (RPC tim_wiki); ghi bằng token người gọi, đồng bộ chỉ mục
    - Cổng cán bộ /can-bo/wiki: tìm, lọc, đánh dấu đoạn khớp, chi tiết + phiên bản trước, thêm/sửa/ngừng hiệu lực
    - Smoke 1138/1138 trên volume trống, test-sql 872/872
- **thu-tuc:** Gói đăng ký kết hôn (KH01) và hòa giải tranh chấp đất đai (DD01), smoke tự chạy mọi gói mới ([#97](https://github.com/commune-dxos/commune-dxos/issues/97)) ([#98](https://github.com/commune-dxos/commune-dxos/issues/98))
    - thu-tuc/ket-hon/ (KH01, hộ tịch) và thu-tuc/hoa-giai-dat-dai/ (DD01, đất đai): thêm bằng thư mục, không sửa mã chạy của bộ máy
    - Bộ kiểm gói từ chối process id dài quá 24 ký tự (Flowable đổi id định nghĩa quy trình sang UUID)
    - Smoke gói mục 5 tự nộp và chạy hết quy trình mọi gói mới bằng du-lieu-mau.json; smoke 1156/1156 trên volume trống

### Tài liệu

- **mot-cua:** GIF demo cổng công dân và cổng cán bộ quay trên lõi chạy thật ([#58](https://github.com/commune-dxos/commune-dxos/issues/58)) ([#90](https://github.com/commune-dxos/commune-dxos/issues/90))

## [0.5.0] - 2026-10-24

### Tính năng mới

- **cong-can-bo:** Cổng cán bộ /can-bo – SSO + OTP, hộp việc theo lĩnh vực, xử lý bước ([#55](https://github.com/commune-dxos/commune-dxos/issues/55)) ([#72](https://github.com/commune-dxos/commune-dxos/issues/72))
    - Cổng cán bộ là route /can-bo trong cùng ứng dụng web Tầng 2 (mot-cua/web-cong-dan/src/can-bo/),
      nạp lười thành gói JS riêng; dùng chung theme, phông, thành phần shadcn/ui, lớp gọi APISIX.
    - Đăng nhập Keycloak client public riêng mot_cua_can_bo (PKCE S256, redirect chỉ /can-bo/*);
      Keycloak tự đòi OTP với can_bo, lanh_dao; token không có hai vai này → trang "không có quyền".
    - Hộp việc: GET /workflow/tasks ghép GET /api/ho_so (RLS), hạn xử lý ghi còn bao lâu, sắp trễ
      (≤ 1 ngày) và quá hạn đổi màu, lên đầu; lọc trạng thái nhận, thủ tục, hạn trên URL; chuông và
      ô số liệu đếm từ dữ liệu có sẵn (realtime là #56).
    - Chi tiết hồ sơ: người nộp, thành phần và tệp (link ký sẵn /files/tep/{id}), lịch sử bước.
    - Form xử lý bước sinh từ thu_tuc.bien_theo_buoc (formProperty của BPMN); bộ nạp gói thêm nhãn
      "ten" (thuộc tính name) cho mỗi biến. Gửi POST /workflow/tasks/{id}/complete, lỗi 400/403/409
      hiện nguyên câu của mot-cua-api.
    - APISIX route mot-cua-web-can-bo (GET/HEAD, 300 req/phút/IP, X-Robots-Tag noindex); nginx SPA
      fallback /can-bo, /cau-hinh.js thêm clientIdCanBo (DXOS_OIDC_CLIENT_ID_CAN_BO).
    - Thành phần shadcn/ui mới (CLI 4.22.1, MIT): avatar, dropdown-menu, select, sheet, sidebar,
      table, tooltip; tách goiGateway dùng chung cho nộp hồ sơ và cổng cán bộ.
    - Vitest: hạn xử lý, form theo bước (đọc BPMN thật của thu-tuc/), quyền, lọc hộp việc, màn
      cổng vào, hộp việc, chi tiết, gửi bước (85 test).
    - Trang /can-bo 200 (route riêng, noindex, CSP), route SPA sâu, /cau-hinh.js có
      mot_cua_can_bo, gói JS tách riêng không có bí mật.
    - Keycloak: mot_cua_can_bo chỉ nhận redirect /can-bo/*, bắt PKCE; sau mật khẩu vẫn đòi OTP;
      Authorization Code + PKCE + OTP bằng curl như trình duyệt.
    - E2E trên hồ sơ KS01 vừa nộp từ cổng công dân: cán bộ hộ tịch thấy hồ sơ, xem tệp (link ký
      sẵn), tiến độ → tiếp nhận → thẩm định đạt (chuyển lãnh đạo) → không tự phê duyệt được →
      lãnh đạo phê duyệt → kết thúc Hoàn tất; cán bộ lĩnh vực khác không thấy, không xử lý được;
      công dân đăng nhập client cán bộ chỉ có vai cong_dan.
    - docs/cong-can-bo.md: đăng nhập và quyền, luồng KS01 (sơ đồ), form sinh từ gói, hạn xử lý,
      hạ tầng, tài khoản mẫu; thêm vào mục "Người dân / cán bộ" của trang tài liệu.
    - README (chạy thử: URL cổng cán bộ, tài khoản mẫu), docs/cai-dat.md, docs/architecture.md
      (route /can-bo), mot-cua/README.md, mot-cua/web-cong-dan/README.md.
    - NOTICE, DEPENDENCIES.md: thành phần shadcn/ui mới, bố cục tham khảo satnaing/shadcn-admin (MIT).
    - Ảnh chụp từ bản chạy thật: hộp việc 1440 px, chi tiết hồ sơ, xử lý bước, điện thoại 390 px.
- **cong-cong-dan:** Web Tầng 2 trong compose, phục vụ qua APISIX route / và smoke web ([#57](https://github.com/commune-dxos/commune-dxos/issues/57)) ([#70](https://github.com/commune-dxos/commune-dxos/issues/70))
    - Dockerfile hai tầng cho mot-cua/web-cong-dan: node 22.23.4 build theo lockfile → nginxinc/nginx-unprivileged
      1.30.6 (uid 101), không bí mật trong image; /cau-hinh.js và CSP sinh từ biến môi trường lúc chạy,
      web gọi lõi bằng đường dẫn tương đối (cùng origin với gateway).
    - Dịch vụ mot-cua-web (profile core): không mở cổng ra host, rootfs chỉ đọc, cap_drop ALL,
      no-new-privileges, healthcheck; make up build lại image (--build).
    - APISIX: route /* ưu tiên thấp nhất, chỉ GET/HEAD, 600 req/phút/IP; không che /public, /api, /files, /workflow.
    - nginx: route SPA (/thu-tuc, /nop-ho-so, /dang-nhap) tải lại 200, đường dẫn lạ 404; CSP không
      unsafe-inline, frame-ancestors 'none', nosniff, Referrer-Policy, X-Frame-Options.
    - Keycloak client mot_cua_web: redirect URI, web origin, post logout của http://localhost:9080.
    - CORS APISIX/PostgREST luôn kèm origin của gateway (DXOS_GATEWAY_URL).
    - Smoke mot-cua/tests/smoke-web.sh (make smoke mục 4h): trang, tài nguyên, phông, route SPA, header,
      cấu hình lúc chạy, đăng nhập Authorization Code + PKCE, nộp hồ sơ E2E từ origin của web.
    - Tài liệu: README, docs/cai-dat.md (kèm lệnh cập nhật client trên volume cũ), docs/architecture.md,
      README web, NOTICE, DEPENDENCIES.md.
- **mot-cua:** Poka-yoke 2 lớp – máy chủ kiểm JSON Schema trước khi khởi tạo quy trình, form không gửi request khi thiếu thành phần ([#59](https://github.com/commune-dxos/commune-dxos/issues/59)) ([#71](https://github.com/commune-dxos/commune-dxos/issues/71))
    - mot-cua-api dựng tài liệu hồ sơ từ tệp đã quét sạch trong CSDL (đọc bằng token người gọi, RLS)
      và kiểm bằng jsonschema (MIT, Draft 2020-12) với thu_tuc.json_schema của gói trước khi gọi
      Flowable. Thiếu/sai → 422 kèm lỗi từng thành phần tiếng Việt, không khởi tạo quy trình, không
      ghi sự kiện. 409 (gọi trùng, hồ sơ không còn moi) vẫn kiểm trước.
    - POST /workflow/ho-so (nộp gộp) kiểm schema trước khi lưu: thủ tục cần giấy tờ → 422, không lưu.
    - Image mot-cua-api build từ mot-cua/backend/Dockerfile (python gốc + requirements.txt ghim);
      CI make-check, test-backend cài requirements; make test-backend báo rõ nếu thiếu jsonschema.
    - Test: test_poka_yoke.py (đủ → 201, thiếu → 422, tệp chưa sạch → 422, 404, 409, schema hỏng).
    - Smoke theo thứ tự tạo hồ sơ → tải tệp → khởi tạo cho KS01 và CT01; thêm ca gọi thẳng
      khoi-tao khi thiếu tệp → 422.
    - Tài liệu: mot-cua/README.md mục /workflow, docs/architecture.md §4.2, docs/thu-tuc.md.
    - src/lib/thanh-phan.ts kiểm tệp đã chọn bằng @cfworker/json-schema (MIT) với đúng schema của
      gói (required, minItems, maxItems, format uuid). Không dùng Ajv: Ajv biên dịch schema bằng
      new Function, bị CSP script-src 'self' của cổng chặn.
    - src/lib/ho-so.ts nopHoSo: Poka-yoke trước request đầu tiên, rồi tạo hồ sơ → tải tệp → khởi tạo;
      form dùng nopHoSo, lỗi 422 của máy chủ hiện nguyên câu.
    - Vitest: thiếu thành phần (KS01, CT01, gói giả ZZ01) → fetch 0 lần; đủ → đúng thứ tự 3 bước;
      form tự sinh cho gói giả, nộp được CT01 chỉ với bản chính.
    - DEPENDENCIES.md (npm + pip), de-thi-mapping [P], PLAN tuần 3 V2.
- **mot-cua:** Đồng bộ trạng thái hồ sơ theo bước Flowable – ánh xạ trong gói, lịch sử và outbox cùng transaction, đối soát ([#73](https://github.com/commune-dxos/commune-dxos/issues/73)) ([#74](https://github.com/commune-dxos/commune-dxos/issues/74))
    - Ánh xạ bước → trạng thái khai trong gói: mặc định theo người nhận userTask (công dân → cho_bo_sung,
      lanh_dao → cho_phe_duyet, còn lại → dang_xu_ly), ghi đè bằng trang_thai_theo_buoc của thu-tuc.yaml;
      bộ nạp ghi thu_tuc.trang_thai_buoc. Hai gói mẫu khai tiep_nhan: moi.
    - Migration 006: trạng thái cho_phe_duyet (chỉ quy trình chuyển), bảng lich_su_trang_thai chỉ thêm
      (trigger, RLS theo quyền xem hồ sơ), RPC dong_bo_trang_thai đổi trạng thái + lịch sử + hộp thư đi
      trong một transaction (chỉ dich_vu_su_kien).
    - mot-cua-api: Flowable trước, một lời gọi RPC sau; CSDL lỗi thì request vẫn thành công, response có
      trangThai. Công dân nộp lại bước bo_sung phải đủ thành phần (Poka-yoke).
    - mot-cua-worker: đối soát trạng thái lệch Flowable mỗi vòng quét (doi-soat-mot-lan).
    - Test: test_trang_thai.py, db/tests/trang_thai.sql (50 kiểm tra).
- **mot-cua:** Nhật ký kiểm toán append-only chuỗi băm SHA-256, endpoint xác minh toàn vẹn, bật pgAudit ([#75](https://github.com/commune-dxos/commune-dxos/issues/75)) ([#76](https://github.com/commune-dxos/commune-dxos/issues/76))
- **mot-cua:** Ký số biên nhận và kết quả PDF – step-ca, Gotenberg, pyHanko PAdES, xác minh ([#77](https://github.com/commune-dxos/commune-dxos/issues/77)) ([#79](https://github.com/commune-dxos/commune-dxos/issues/79))
- **mot-cua:** Kho dữ liệu lịch sử – Parquet + DuckDB, dbt-core dựng mart và lineage, nạp bao_cao ([#80](https://github.com/commune-dxos/commune-dxos/issues/80)) ([#81](https://github.com/commune-dxos/commune-dxos/issues/81))
- **mot-cua:** Sổ văn bản đến/đi có ký số – văn thư vào sổ, lãnh đạo ký ban hành, đánh số theo năm ([#78](https://github.com/commune-dxos/commune-dxos/issues/78)) ([#84](https://github.com/commune-dxos/commune-dxos/issues/84))
- **nen-tang:** Dashboard Superset qua /bao-cao với SSO Keycloak, mô tả luồng hồ sơ một cửa ([#82](https://github.com/commune-dxos/commune-dxos/issues/82)) ([#83](https://github.com/commune-dxos/commune-dxos/issues/83))

## [0.4.0] - 2026-10-23

### Tính năng mới

- **cong-cong-dan:** Khung cổng công dân React + danh mục thủ tục + đăng nhập Keycloak PKCE ([#52](https://github.com/commune-dxos/commune-dxos/issues/52)) ([#60](https://github.com/commune-dxos/commune-dxos/issues/60))
    - mot-cua/web-cong-dan/: React 19 + Vite 7 + TypeScript + Tailwind 4 + thành phần theo mẫu shadcn/ui, phiên bản ghim, lockfile
    - Trang chủ liệt kê thủ tục công khai từ GET /public/thu_tuc qua APISIX (mã, tên, lĩnh vực, thời hạn, lệ phí), tìm không dấu, nút Nộp hồ sơ dẫn tới trang tạm "sắp có"
    - Đăng nhập công dân Authorization Code + PKCE S256 bằng client public mot_cua_web, không bí mật trong web; realm thêm post.logout.redirect.uris
    - Chế độ dữ liệu giả (npm run dev:gia), test kiểm khớp thu-tuc/*/thu-tuc.yaml
    - 19 test Vitest; make check kiểm web ghim phiên bản (scripts/check-web.py); make test-web; workflow CI web (không bắt buộc)
    - DEPENDENCIES.md mục 2 giấy phép gói npm, NOTICE, trang MkDocs Cổng công dân
    - Biểu tượng docs/images/logo/ (favicon, mark-64, apple-touch-icon) trong ô trắng ở đầu trang
    - Màu chính xanh ngọc #0F766E, phụ chàm #4338CA, viền focus đỏ son #D9480F
    - REUSE.toml khai public/ của web
- **cong-cong-dan:** Nền giao diện shadcn/ui, phông Be Vietnam Pro, khối dùng chung ([#63](https://github.com/commune-dxos/commune-dxos/issues/63)) ([#65](https://github.com/commune-dxos/commune-dxos/issues/65))
    - Theme shadcn/ui (biến CSS) theo bộ nhận diện: xanh ngọc #0F766E, chàm #4338CA cho liên kết và
      vòng focus (7.9:1), đỏ son #D9480F chỉ cho cảnh báo và dấu tích, chữ #0B1220; bo góc 8px;
      thang chữ không bậc nào dưới 16px.
    - Phông Be Vietnam Pro (OFL-1.1) tự host qua @fontsource, chỉ bộ latin + vietnamese.
    - 15 thành phần shadcn/ui lấy bằng shadcn CLI 4.22.1 (new-york-v4, MIT), chỉnh vùng bấm >= 44px;
      thêm radix-ui 1.8.1 (MIT), lucide-react 1.61.0 (ISC).
    - Khối thông báo dùng chung ThongBao (dựng trên Empty), khung nội dung Khung, đầu trang trắng một
      hàng, dải Thử nghiệm, chân trang có logo ngang.
    - Trang chủ áp kiểu mới: khối tìm thủ tục, danh mục dạng dòng Item, trạng thái tải/lỗi/không thấy
      dùng ThongBao. Các màn khác và form nộp hồ sơ để cho #64.
    - NOTICE, DEPENDENCIES.md, REUSE.toml, README cổng, ảnh trang chủ.
- **cong-cong-dan:** Chi tiết thủ tục, form nộp hồ sơ theo mẫu GOV.UK nộp thật qua APISIX, màn lỗi ([#64](https://github.com/commune-dxos/commune-dxos/issues/64)) ([#66](https://github.com/commune-dxos/commune-dxos/issues/66))
    - Chi tiết thủ tục /thu-tuc/:ma: các bước, thành phần hồ sơ (Bắt buộc / Nếu có) đọc từ JSON Schema
      của gói (cột thu_tuc.json_schema qua /public), thẻ tóm tắt + nút Bắt đầu nộp.
    - Danh mục: tên thủ tục là liên kết tới trang chi tiết, thêm giấy tờ cần có.
    - Form nộp /nop-ho-so/:ma/:buoc? theo mẫu dịch vụ công GOV.UK (không chép mã): thanh bước, mỗi trang
      một nhóm câu hỏi, tóm tắt lỗi đầu form nhận focus, Poka-yoke theo JSON Schema, Kiểm tra lại thông
      tin, Đã nộp. Chưa đăng nhập: thẻ mời đăng nhập (bố cục block login-03).
    - Nộp thật: POST /api/ho_so → POST /files/ho-so/{id}/tep từng tệp (ClamAV) → POST
      /workflow/ho-so/{id}/khoi-tao; lỗi giữa chừng thì Thử lại tiếp từ chỗ dở, không tạo trùng hồ sơ.
    - Màn đăng nhập lỗi, 404, lỗi tải thủ tục dùng khối thông báo chung.
    - Test: lib/ho-so, thanh-phan, form đi hết các bước, thứ tự gọi API, thử lại sau lỗi.

### Tài liệu

- **logo:** Logo và bộ nhận diện dự án ([#61](https://github.com/commune-dxos/commune-dxos/issues/61)) ([#62](https://github.com/commune-dxos/commune-dxos/issues/62))

## [0.3.0] - 2026-10-22

> **Giấy phép:** đây là bản đầu tiên phát hành theo GPL-3.0-or-later (D-010, [#47](https://github.com/commune-dxos/commune-dxos/issues/47)). Các bản v0.0.1–v0.2.0 vẫn theo Apache-2.0.

### Tài liệu

- **kien-truc:** Sơ đồ kiến trúc SVG động 2 tầng có gói thủ tục ([#43](https://github.com/commune-dxos/commune-dxos/issues/43)) ([#44](https://github.com/commune-dxos/commune-dxos/issues/44))
    - docs/images/kien-truc-dong.svg: vẽ tay, không JS; Tầng 2 mot-cua/ với gói thủ tục
      KS01, CT01 cắm vào bộ máy, Tầng 1 nen-tang/ headless, đánh số 4 dịch vụ bắt buộc.
      Một hồ sơ KS01 chạy qua 6 bước (SMIL, vòng 14 giây), tắt khi giảm chuyển động.
    - README dùng sơ đồ mới thay kien-truc-tong-quan.webp (giữ tệp cũ).
    - scripts/xuat_kien_truc.py + make xuat-kien-truc: Playwright chụp khung, ffmpeg ghép
      GIF (README, 0,46 MB) và MP4 1920x1080 (slide, 0,68 MB).
    - docs/images/kien-truc-2-tang.webp: ảnh tĩnh do đội tạo bằng công cụ AI theo bản SVG,
      dùng cho slide và docs/architecture.md; ghi nguồn trong docs/images/README.md.
    - README giữ sơ đồ động, thêm link ảnh tĩnh ngay dưới.
- **kien-truc:** Ảnh tĩnh kiến trúc 2 tầng bản v2 ([#45](https://github.com/commune-dxos/commune-dxos/issues/45)) ([#46](https://github.com/commune-dxos/commune-dxos/issues/46))

### Hạ tầng và CI

- **giay-phep:** Chuyển sang GPL-3.0-or-later ([#47](https://github.com/commune-dxos/commune-dxos/issues/47)) ([#48](https://github.com/commune-dxos/commune-dxos/issues/48))
    - LICENSE: toàn văn GPL-3.0 bản gnu.org (sha256 3972dc97…, 674 dòng), không sửa chữ nào
    - LICENSES/GPL-3.0-or-later.txt: bản sao cho đặc tả REUSE
    - NOTICE: bản quyền DTU_DZ_2, thông báo GPL (bản gốc + dịch), mốc chuyển sau v0.2.0, Garage/ClamAV là dịch vụ riêng
    - REUSE.toml: khai GPL-3.0-or-later cho tệp không chú thích được (JSON, ảnh, video, .md)
    - 101 tệp mã/cấu hình: header 2 dòng SPDX-FileCopyrightText + SPDX-License-Identifier: GPL-3.0-or-later
    - tang2-migrate: CSDL cài từ v0.2.0 trở về trước chỉ cập nhật sổ khi tệp chỉ khác header giấy phép
    - test-sql: thêm bước giả lập sổ ghi SHA-256 trước D-010
    - make license/make check: thêm header GPL-3.0-or-later, báo lỗi tệp thiếu header, còn Apache-2.0 hoặc thiếu dòng bản quyền; test scripts/tests/test_check_license.py
    - README: huy hiệu và mục Giấy phép; CONTRIBUTING: inbound = outbound
    - DEPENDENCIES: cột Tương thích GPL-3.0, rà gói Python
    - MkDocs chân trang, docs/, mẫu PR; xuất lại sơ đồ động GIF/MP4

## [0.2.0] - 2026-10-22

### Tái cấu trúc

- **thu-tuc:** Mô hình gói thủ tục nen-tang/ + mot-cua/ + thu-tuc/ ([#30](https://github.com/commune-dxos/commune-dxos/issues/30)) ([#31](https://github.com/commune-dxos/commune-dxos/issues/31))
    - core/ → nen-tang/, apps/mot-cua/ → mot-cua/ (git mv); bỏ DXOS_APP, dịch vụ
      tang2-migrate, tang2-realm, mot-cua-api, mot-cua-worker; nhánh OpenBao dxos/tang2/.
    - thu-tuc/khai-sinh (chuyển BPMN và danh mục KS01) và thu-tuc/chung-thuc-ban-sao (CT01,
      hạn trong ngày): thu-tuc.yaml, quy-trinh.bpmn20.xml, thanh-phan-ho-so.schema.json,
      du-lieu-mau.json, README.md.
    - Bộ nạp nap-thu-tuc (make up, make nap-thu-tuc): kiểm gói, deploy BPMN qua REST, ghi danh
      mục qua RPC mot_cua.nap_thu_tuc (migration 005, client mot_cua_danh_muc); gói lỗi bị bỏ qua.
    - API /workflow đọc quy trình và biến từng bước từ danh mục (flowable:formProperty).
    - make check kiểm gói; CI bpmn kiểm thu-tuc/*/quy-trinh.bpmn20.xml; test bộ nạp, test SQL
      danh mục, smoke cắm–rút và hồ sơ chứng thực qua /workflow; docs/thu-tuc.md.

### Tài liệu

- **readme:** README tiếng Việt có ảnh minh họa, README.en.md, sơ đồ kiến trúc SVG ([#26](https://github.com/commune-dxos/commune-dxos/issues/26)) ([#27](https://github.com/commune-dxos/commune-dxos/issues/27))
    - README.md viết lại thuần tiếng Việt, giữ đủ nội dung đã kiểm chứng ở #12;
      thêm banner, ảnh minh họa bài toán, huy hiệu, mục Bài toán, bảng 4 dịch vụ bắt buộc
    - README.en.md ngắn: mô tả, kiến trúc, chạy từ máy sạch, giấy phép
    - docs/images/kien-truc.svg: sơ đồ kiến trúc vẽ tay theo docker-compose.yml, core/, apps/mot-cua/
    - docs/images/luong-ho-so.svg: luồng hồ sơ khai sinh theo BPMN dang_ky_khai_sinh
    - docs/images/*.webp: ảnh minh họa do đội tạo bằng công cụ AI; nguồn ghi ở docs/images/README.md
- **readme:** README kể chuyện sản phẩm với ảnh minh họa, bỏ README.en.md ([#28](https://github.com/commune-dxos/commune-dxos/issues/28)) ([#29](https://github.com/commune-dxos/commune-dxos/issues/29))
    - README.md thuần tiếng Việt theo trình tự: Giới thiệu, Thách thức, Giải pháp,
      Đối tượng, Chức năng (đã có ở v0.1.0 / sắp có), Kiến trúc, Công nghệ,
      Luồng hồ sơ, Hướng phát triển, Cài đặt từ máy sạch, Đóng góp, Báo lỗi,
      Giấy phép, CHANGELOG.
    - Ảnh mới trong docs/images/: banner có tiêu đề, vòng 6 chức năng, kiến trúc
      tổng quan dạng biểu tượng, luồng hồ sơ 5 bước; nhãn tiếng Việt.
    - Hướng dẫn cài đặt chi tiết chuyển sang docs/cai-dat.md, README giữ các lệnh chính.
    - Sơ đồ SVG chi tiết chỉ dùng trong docs/architecture.md (§1, §4.2).
    - Xóa README.en.md; cập nhật docs/images/README.md, CHANGELOG, de-thi-mapping.
- **readme:** Bố cục riêng "Trước và sau chuyển đổi số", thủ tục đang hỗ trợ ([#38](https://github.com/commune-dxos/commune-dxos/issues/38)) ([#39](https://github.com/commune-dxos/commune-dxos/issues/39))
    - Bảng Trước/Sau 8 dòng thay vòng tròn chức năng, mỗi dòng ghi trạng thái v0.1.0 / develop / tuần.
    - Mục thủ tục đang hỗ trợ từ thu-tuc/*/thu-tuc.yaml, link danh mục và hướng dẫn 5 bước.
    - Kiến trúc gọn theo nen-tang/, mot-cua/, thu-tuc/; chạy thử khớp Makefile; chỗ dành cho GIF demo.
    - docs/images/README.md: vong-chuc-nang.webp, mot-cua-so.webp không còn dùng ở README; ghi chú cách quay GIF.
- **tai-lieu:** Trang tài liệu MkDocs trên GitHub Pages, danh mục thủ tục tự sinh ([#32](https://github.com/commune-dxos/commune-dxos/issues/32)) ([#33](https://github.com/commune-dxos/commune-dxos/issues/33))
    - mkdocs.yml: MkDocs 1.6.1 + Material for MkDocs 9.7.7 bản community, giao diện và tìm kiếm
      tiếng Việt, điều hướng theo vai người đọc, dùng lại các tệp trong docs/, loại docs/contest/.
    - scripts/tai_lieu_hooks.py: trang Danh mục thủ tục sinh từ thu-tuc/*/ bằng bộ kiểm của bộ nạp,
      mỗi gói một trang từ README của gói; đưa mot-cua/README.md, CONTRIBUTING.md, CHANGELOG.md lên
      site; neo tiêu đề như GitHub; link ra ngoài docs/ trỏ về GitHub.
    - make tai-lieu (--strict), make xem-tai-lieu; workflow tai-lieu.yml build trên PR, deploy Pages
      khi push main hoặc chạy tay.
    - DEPENDENCIES.md, NOTICE, CHANGELOG, một dòng link trong README; site/ vào .gitignore.

### Hạ tầng và CI

- **phat-hanh:** Git-cliff tự sinh CHANGELOG và ghi chú phát hành ([#36](https://github.com/commune-dxos/commune-dxos/issues/36)) ([#37](https://github.com/commune-dxos/commune-dxos/issues/37))
    - cliff.toml: nhóm theo loại commit với tiêu đề tiếng Việt, phạm vi in đậm và xếp theo
      phạm vi, (#số) thành link GitHub, gạch đầu dòng của mô tả squash thành mục con;
      bỏ commit Merge và chore(release), commit không theo quy ước vào nhóm Khác
    - scripts/nhat_ky.py: chỉ viết lại mục [Unreleased] (khoảng <tag mới nhất>..HEAD vì tag nằm
      trên merge commit của main), giữ nguyên mục v0.0.1, v0.1.0 viết tay
    - make nhat-ky [PHIEN_BAN=x.y.z], make ghi-chu-phat-hanh PHIEN_BAN=x.y.z; git-cliff 2.14.2 ghim
      trong scripts/requirements-phat-hanh.txt, cài bằng venv
    - workflow phat-hanh (tag vX.Y.Z): ghi chú git-cliff, commune-dxos-X.Y.Z.tar.gz bằng git archive,
      SHA256SUMS, GitHub Release; quyền contents: write
    - workflow quy-uoc-commit trên PR (không bắt buộc): tiêu đề PR theo quy ước, chạy thử git-cliff
    - docs/quy-trinh-lam-viec.md mục 5–6: quy ước commit, sinh CHANGELOG, quy trình phát hành;
      link trong CONTRIBUTING.md và mẫu PR; DEPENDENCIES.md, NOTICE; CHANGELOG [Unreleased] sinh lại
- **tien-do:** Milestone theo tuần, nhãn thành phần tự gắn, mẫu issue ([#34](https://github.com/commune-dxos/commune-dxos/issues/34)) ([#35](https://github.com/commune-dxos/commune-dxos/issues/35))
    - .github/labeler.yml + workflow gan-nhan (actions/labeler, pull_request_target,
      không checkout mã PR): tự gắn nen-tang, mot-cua, thu-tuc, docs, ci theo tệp sửa
    - Mẫu issue "Thủ tục mới" (tự gắn thu-tuc) và "Việc trong tuần" (chọn thành phần)
    - docs/quy-trinh-lam-viec.md: milestone Tuần 1–7, nhãn, bảng Project, luồng
      issue → nhánh → PR → develop; thêm vào mục "Đóng góp" của site
    - CONTRIBUTING.md, docs/PLAN.md, CHANGELOG cập nhật theo

## [0.1.0] - 2026-10-21
### Added
- `apps/mot-cua/db/migrations/002_schema_day_du.sql`: schema `mot_cua` đầy đủ – `linh_vuc`, `thu_tuc` (thời hạn theo ngày làm việc, phí, công khai), `thanh_phan_yeu_cau`, `ngay_nghi`, `can_bo` (liên kết `sub` Keycloak) + `can_bo_linh_vuc`, `ho_so` (mã hồ sơ, hạn xử lý tính theo ngày làm việc, trạng thái `moi → dang_xu_ly → cho_bo_sung → hoan_tat | tu_choi` có trigger chặn bước sai), `thanh_phan_ho_so` (metadata, tệp ở Garage); khóa UUID, `created_at`/`updated_at` (#5).
- RLS bật và `FORCE` trên mọi bảng `mot_cua`: công dân chỉ thấy/nộp hồ sơ của mình và chỉ sửa khi chờ bổ sung; cán bộ chỉ thấy/xử lý hồ sơ thuộc lĩnh vực phụ trách; lãnh đạo chỉ đọc; `anon` chỉ đọc danh mục thủ tục công khai. Quyền GRANT theo cột, hàm nội bộ ở schema `mot_cua_noi_bo` không phơi ra API (#5).
- RPC công khai `json_schema_thu_tuc(ma)`: JSON Schema thành phần hồ sơ của thủ tục, chuẩn bị cho Poka-yoke tuần 3 (#5).
- Seed `002_du_lieu_mau.sql` (dữ liệu giả): 3 lĩnh vực, 6 thủ tục cấp xã kèm thành phần hồ sơ, 3 cán bộ khác lĩnh vực, 6 hồ sơ ở đủ trạng thái, ngày nghỉ 2026; người dùng mẫu `congdan02`, `canbo02`, `canbo03`, `id` Keycloak cố định khớp seed (#5).
- `apps/mot-cua/db/tests/rls.sql`: 63 kiểm tra quyền/RLS từng vai trò, chạy trong một transaction rồi ROLLBACK; `make smoke` chạy tệp này và gọi API qua APISIX bằng token thật của cả 4 vai trò (cán bộ, lãnh đạo dùng người dùng tạm có OTP, mã TOTP sinh trong script) (#5).
- `apps/mot-cua/README.md`: sơ đồ ER, sơ đồ trạng thái, bảng quyền theo vai trò, ghi chú dữ liệu cá nhân tối thiểu; `docs/architecture.md` §2.7, §8.3 (#5).

- Workflow engine Flowable REST 8.0.0 trong profile `core`: CSDL riêng `flowable` (dịch vụ một lần `flowable-db-init`, chạy được với volume cũ), tắt quy trình demo, healthcheck có xác thực, cổng debug chỉ trên 127.0.0.1; biến `FLOWABLE_DB_PASSWORD`, `FLOWABLE_ADMIN_PASSWORD`, `FLOWABLE_PORT` (#8).
- Quy trình `apps/mot-cua/processes/dang_ky_khai_sinh.bpmn20.xml` viết tay: tiếp nhận → (công dân bổ sung) → thẩm định → phê duyệt, nhánh từ chối, hẹn giờ quá hạn không ngắt quy trình; Flowable tự triển khai thư mục `processes/` của ứng dụng khi khởi động (#8).
- `scripts/check-bpmn.py` kiểm cú pháp và cấu trúc BPMN trong `make check` và CI; `make smoke` kiểm Flowable và chạy quy trình khai sinh qua các bước (#8).

- APISIX: route `/workflow/*` (bắt buộc JWT, 300 req/phút/IP) chuyển tới backend của ứng dụng; route chặn 403 các đường dẫn API quản trị Flowable (`repository`, `management`, `identity`, `runtime`, `history`, `query`, `form`, `flowable-rest`); `/files/*` kiểm JWT rồi trả 503 giữ chỗ cho Garage; CORS toàn cục theo biến `DXOS_CORS_ORIGINS`; cấu hình JWT dùng chung bằng `plugin_configs` (#6).
- Dịch vụ `app-backend` trong profile `core`: chạy `apps/<DXOS_APP>/backend/main.py` trên image `python:3.13.16-alpine3.24` (chỉ thư viện chuẩn, không build), không mở cổng ra host (#6).
- `apps/mot-cua/backend/main.py`: API quy trình mỏng – công dân nộp hồ sơ + khởi tạo quy trình trong một lời gọi, xem tiến độ; cán bộ/lãnh đạo lấy task của nhóm mình (lĩnh vực phụ trách tra trong CSDL), nhận và hoàn thành task với biến khai báo cho từng bước. Tự kiểm JWT (RS256 theo JWKS), đọc/ghi hồ sơ qua PostgREST bằng token người dùng (RLS), gọi Flowable bằng tài khoản kỹ thuật – người dùng không cầm mật khẩu Flowable (#6).
- `make smoke` (199 kiểm tra): 401 trên mọi route cần token, 403 khi gọi API quản trị Flowable qua gateway, CORS, cổng không mở ra host, luồng khai sinh đầy đủ qua `/workflow` bằng token thật của công dân, cán bộ, lãnh đạo, chặn chéo vai trò, backend tự kiểm token, `/public` vượt hạn mức → 429 (#6).

- Dữ liệu phi cấu trúc trong profile `core`: Garage v2.4.1 một nút (AGPL-3.0, dịch vụ riêng, image gốc, không mở cổng ra host) và ClamAV 1.5.4 (GPL-2.0, dịch vụ riêng, image gốc, CSDL virus giữ trong volume `clamav-db`) (#7).
- Dịch vụ một lần `garage-secrets` (sinh `rpc_secret`, `admin_token`) và `garage-init` (layout một nút, bucket do ứng dụng khai báo trong `apps/<DXOS_APP>/s3/buckets.conf`, khóa S3 riêng của ứng dụng chỉ đọc/ghi trên bucket đó), chạy lại an toàn; khóa và bí mật sinh lúc khởi tạo vào volume `garage-secrets`, `app-secrets` (quyền 600), không nằm trong repo hay `.env`. TODO #10: chuyển sang OpenBao (#7).
- `app-realm` ghi client secret của client dịch vụ (service account) mà ứng dụng khai báo vào volume `app-secrets` (#7).
- API tệp `apps/mot-cua/backend` (`/files`): công dân tải PDF/JPG/PNG ≤ 10 MiB vào hồ sơ của mình khi `moi`/`cho_bo_sung`; kiểm đuôi, Content-Type và magic bytes (giả mạo → 415); **ClamAV quét trước khi lưu** (tệp nhiễm → 422, không lưu, ghi nhật ký); lưu Garage, ghi metadata (object key, sha256, kích thước, người tải, kết quả quét); xem tệp theo RLS (cán bộ sai lĩnh vực → 403) bằng link GET ký SigV4 ngắn hạn, client không cầm khóa S3 (#7).
- APISIX: `/files/*` chuyển tới backend của ứng dụng (JWT, 120 req/phút/IP, body ≤ 10 MiB → 413) thay cho chỗ giữ 503; `/files/s3/*` cho link ký sẵn tới Garage (chỉ GET/HEAD, `nosniff`) (#7).
- Migration `003_tep_ho_so.sql`: role `dich_vu_tep` (client Keycloak `mot_cua_tep`, Client Credentials) ghi metadata tệp đã quét; cột `nguoi_tai_sub`, `ket_qua_quet`, `may_quet`, `quet_luc`; ràng buộc khóa object nằm dưới tiền tố hồ sơ; bảng `nhat_ky_tep` chỉ thêm (trigger chặn sửa/xóa/TRUNCATE kể cả superuser), lãnh đạo đọc được (#7).
- `make test`: 17 test đơn vị cho API tệp (tên/đuôi, magic bytes, quy tắc quyền, SigV4 theo ví dụ chính thức của AWS, giao thức `clamd`), chạy trong `make check` và CI; `rls.sql` 88 kiểm tra; `make smoke` 277 kiểm tra, có tải EICAR, tệp giả mạo, quá cỡ, link hết hạn (#7).

- OpenBao 2.7.1 (MPL-2.0, dịch vụ riêng, image gốc) trong profile `core`: chế độ server (không `-dev`), storage raft một nút trong volume `bao-data`, không UI, không mở cổng ra host, audit device ra stdout (giá trị bí mật băm HMAC); cấu hình `core/openbao/config.hcl` (#10).
- Dịch vụ một lần `bao-init` (`core/openbao/bao-init.py`, cũng là `make bao-init`), chạy ở mỗi `make up`, idempotent: init lần đầu (unseal key + root token ra `.data/openbao/<project>.json` trên máy, quyền 600, ngoài git), unseal (`BAO_UNSEAL=file` chỉ cho máy dev, `manual` để unseal tay), KV v2 `dxos/`, AppRole, policy theo danh tính `core/openbao/policies/*.hcl`, sinh ngẫu nhiên bí mật lõi chưa có (mật khẩu role PostgreSQL, quản trị Keycloak, `rest-admin` Flowable, `rpc_secret`/`admin_token` Garage); lệnh `make bao-status`, `make bao-import-env` (#10).
- 8 danh tính AppRole (`db`, `postgrest`, `keycloak`, `flowable`, `garage`, `garage-init`, `app-realm`, `app`), mỗi danh tính chỉ đọc/ghi đúng đường dẫn của mình, role_id/secret_id trong volume riêng quyền 0400; 5 agent một lần `*-secrets` (`bao agent`, `core/openbao/agent/*.hcl`) render tệp bí mật cho PostgreSQL, PostgREST, Keycloak, Flowable, Garage (#10).
- `make smoke` thêm 51 kiểm tra (`scripts/smoke-openbao.sh`, `core/openbao/kiem-quyen.py`): két đã unseal, 27 cặp danh tính × đường dẫn kiểm bằng AppRole thật, không mật khẩu trong biến môi trường của 9 dịch vụ, quyền tệp, nhật ký kiểm toán không chứa bí mật dạng rõ, `bao-init` chạy lại không đổi gì; tổng 328 kiểm tra (#10).
- `docs/architecture.md` §4.4 (thiết kế, sơ đồ, bảng dịch vụ ↔ đường dẫn KV ↔ policy, init/unseal, chuyển từ `.env` cũ), §8.7 kết quả chạy thử; README mục Bí mật (#10).

- RabbitMQ 4.3.6 (MPL-2.0, dịch vụ riêng, image gốc `rabbitmq:4.3.6-alpine`) trong profile `core`: một nút, plugin STOMP + management, không mở cổng ra host, không có route APISIX; tài khoản quản trị khởi tạo lấy từ OpenBao (`dxos/core/rabbitmq/admin`, agent `rabbitmq-secrets`, danh tính `rabbitmq`); cấu hình `core/rabbitmq/`; biến `RABBITMQ_ADMIN` (#9).
- Dịch vụ một lần `rabbitmq-init` (`core/scripts/rabbitmq-init.py`, danh tính OpenBao `rabbitmq-init`): vhost riêng `<DXOS_APP>`, user `app-<DXOS_APP>` không tag quản trị, không quyền configure; nạp topology ứng dụng khai báo trong `apps/<DXOS_APP>/rabbitmq/definitions.json` (chỉ exchange, queue, binding); ghi thông tin kết nối vào OpenBao `dxos/apps/<DXOS_APP>/rabbitmq`; chạy lại không đổi gì (#9).
- Dịch vụ `app-worker` trong profile `core`: chạy `apps/<DXOS_APP>/backend/worker.py` (cùng image, cùng AppRole `app` với `app-backend`, không có cổng, healthcheck theo nhịp sống) (#9).
- Sự kiện hồ sơ của `mot-cua` (định dạng JSON phiên bản 1: `id`, `loai`, `luc`, mã hồ sơ, lĩnh vực, thủ tục; không có dữ liệu cá nhân): `ho_so.moi` (khởi tạo quy trình), `ho_so.chuyen_buoc` (hoàn thành task), `ho_so.hoan_tat` / `ho_so.tu_choi` (quy trình kết thúc), `ho_so.sap_tre_han` (còn ≤ 1 ngày làm việc tới hạn, mỗi hồ sơ và hạn một lần). `app-backend` ghi vào hộp thư đi (outbox) sau khi gọi Flowable thành công; `app-worker` phát lên exchange `mot_cua.su_kien` qua STOMP, chờ RabbitMQ xác nhận rồi mới đánh dấu đã phát; RabbitMQ dừng thì sự kiện chờ trong bảng (#9).
- Migration `004_su_kien.sql`: role `dich_vu_su_kien` (client Keycloak `mot_cua_su_kien`) chỉ đọc các cột hồ sơ không phải dữ liệu cá nhân; bảng `hop_thu_su_kien` (khóa chống trùng UNIQUE, nội dung phải khớp dòng, không bỏ phát được), `nhat_ky_su_kien` chỉ thêm (lãnh đạo đọc được) (#9).
- Consumer mẫu trong `app-worker`: nhận từ queue `mot_cua.nhat_ky` (quorum), kiểm định dạng, ghi `nhat_ky_su_kien` chống trùng theo id rồi ACK; tin sai định dạng → queue lỗi `mot_cua.nhat_ky.loi` (dead-letter); quét sắp trễ hạn mỗi `DXOS_SU_KIEN_QUET_GIAY` giây, ngưỡng `DXOS_SU_KIEN_SAP_TRE_NGAY` ngày làm việc (#9).
- `make test` thêm 36 test đơn vị (định dạng sự kiện, ngày làm việc, quy tắc sắp trễ hạn, chống trùng, mã hóa frame STOMP, consumer, publisher); `rls.sql` thêm 22 kiểm tra cho sự kiện (110 tổng); `make smoke` thêm 77 kiểm tra (`scripts/smoke-rabbitmq.sh`, `apps/mot-cua/tests/smoke-su-kien.sh`): management chỉ cho quản trị trong mạng nội bộ, luồng thật qua `/workflow` → queue → consumer, sắp trễ hạn đúng một lần, tin hỏng → queue lỗi, RabbitMQ dừng rồi lên lại; tổng 405 kiểm tra (#9).
- `docs/architecture.md` §4.5 (thiết kế, lý do chọn outbox + STOMP, sơ đồ, topology, bí mật), §8.8 kết quả chạy thử; `apps/mot-cua/README.md` danh mục sự kiện và payload (#9).

- CI tách thành các check riêng, tên ổn định, chạy trên mọi push/PR không lọc đường dẫn: `shellcheck`, `yamllint`, `bpmn`, `test-backend`, `test-sql` bên cạnh `make-check`; action ghim theo tag (`actions/checkout@v5.0.0`, `actions/setup-python@v6.0.0`, chạy Node 24), công cụ lint ghim trong `scripts/requirements-lint.txt` (yamllint 1.38.0, ShellCheck 0.11.0) (#11).
- `make lint` (`scripts/lint.sh`): shellcheck mọi `*.sh`, yamllint theo `.yamllint.yml` (compose, APISIX, workflow), kiểm cấu trúc BPMN + 13 test của chính bộ kiểm (`scripts/tests/test_check_bpmn.py`); thiếu công cụ thì in cách cài (#11).
- `make test` = `test-backend` + `test-sql`; `make test-sql` (`scripts/test-sql.sh`): PostgreSQL trống (service container trên CI, container tạm cùng image compose trên máy) → `10-core.sql` → `app-migrate.sh` hai lần (lần sau phải bỏ qua hết) → `apps/*/db/tests/*.sql` trước và sau khi nạp seed; dòng TRƯỢT hay lỗi psql làm job đỏ (#11).

- `make demo-users` (`scripts/demo-users.sh`): đặt một mật khẩu chung cho 6 người dùng mẫu (dữ liệu giả) để thử tay từng vai trò sau `make smoke`; mật khẩu lấy từ `DXOS_DEMO_PASSWORD` hoặc sinh ngẫu nhiên và in một lần, đi qua stdin vào `kcadm.sh` (#12).
- `docs/architecture.md` §8.9: kết quả chạy từ máy sạch theo README (bản clone mới ngoài thư mục mã, `make up` 128 giây, smoke 405/405, dung lượng image và RAM đo được) (#12).

### Changed
- README viết lại song ngữ Việt – Anh: kiến trúc 3 tầng (Mermaid), yêu cầu máy (Docker/Compose tối thiểu, RAM, ổ, amd64/arm64), chạy từ máy sạch kèm thời gian và dung lượng đo thật, địa chỉ/cổng, tài khoản mẫu theo vai trò, biến cấu hình trong `.env`, thêm ứng dụng vào `apps/`, kiểm thử và đóng góp, xử lý lỗi thường gặp (cổng bị chiếm, OpenBao sealed, thiếu RAM/ổ), giấy phép, phiên bản (#12).
- `docs/architecture.md` §8 bước 3 đặt mật khẩu bằng `make demo-users` thay cho lệnh `kcadm.sh` dùng `KEYCLOAK_ADMIN_PASSWORD` (đã chuyển vào OpenBao ở #10) (#12).
- `make test` cũ đổi tên thành `make test-backend` (`make check` vẫn chạy test đơn vị, không cần Docker) (#11).
- Sửa cảnh báo shellcheck: mẫu `*.bpmn20.xml` thừa trong `scripts/lib-spdx.sh` (đã khớp `*.xml`), `scripts/smoke.sh` khai báo nguồn `.env.example` cho `. ./.env` (CI không có `.env`), chú thích lý do cho biến dùng ở tệp `source` và chuỗi nháy đơn có chủ ý trong `scripts/lib-smoke.sh`, `apps/mot-cua/tests/smoke-tep.sh`; không đổi hành vi (#11).
- Bỏ mọi mật khẩu khỏi `.env`/`.env.example` (`POSTGRES_PASSWORD`, `PGRST_DB_PASSWORD`, `KEYCLOAK_DB_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD`, `FLOWABLE_DB_PASSWORD`, `FLOWABLE_ADMIN_PASSWORD`): nguồn duy nhất là OpenBao. `.env` cũ còn các biến này thì lần `make up` đầu tiên chuyển giá trị sang OpenBao, giữ được volume cũ (#10).
- `flowable-db-init` và `core/postgres/initdb/20-auth.sh` gộp thành dịch vụ một lần `db-init` (`core/scripts/db-init.sh`): role + CSDL riêng của `authenticator`, `keycloak`, `flowable`, đặt mật khẩu theo OpenBao ở mỗi `up` (đổi mật khẩu trong OpenBao là PostgreSQL theo) (#10).
- `garage-secrets` thành agent OpenBao (không còn `core/scripts/garage-secrets.sh`); `garage-init` đọc `admin_token` và ghi khóa S3 của ứng dụng vào OpenBao `dxos/apps/<DXOS_APP>/s3`; `app-realm` đọc mật khẩu quản trị Keycloak và ghi client secret vào `dxos/apps/<DXOS_APP>/keycloak/<client>`; `app-backend` đọc các bí mật này và mật khẩu `rest-admin` từ OpenBao lúc cần (`apps/mot-cua/backend/bimat.py`), chỉ giữ trong bộ nhớ. Tệp rõ `s3.json`, `keycloak-*.secret` cũ trong volume `app-secrets` bị xóa khi nâng cấp (#10).
- Keycloak khởi động qua `core/scripts/kc-start.sh` (đọc mật khẩu từ tệp); Flowable nạp mật khẩu bằng Spring Boot config tree; PostgREST đọc URI kết nối bằng `PGRST_DB_URI=@tệp` (#10).
- Công dân không còn `INSERT` trực tiếp vào `mot_cua.thanh_phan_ho_so` qua `/api`: metadata tệp chỉ ghi qua API tệp `/files` sau khi quét (#7).
- ClamAV chuyển từ profile `docs` sang `core` vì quét là điều kiện bắt buộc để lưu tệp (#7).
- PostgREST: `PGRST_OPENAPI_MODE=follow-privileges` (OpenAPI chỉ liệt kê những gì role của request được quyền), `PGRST_DB_MAX_ROWS=1000`, CORS giới hạn theo `DXOS_CORS_ORIGINS` thay vì mọi origin (#6).
- Route `/public/*` nhận thêm `OPTIONS`, thông báo 429 dạng JSON (#6).
- Migration 002 thay hai bảng giữ chỗ `thu_tuc`, `ho_so` của v0.0.1 (chỉ có dữ liệu giả); bỏ seed `001_du_lieu_mau.sql`. API đổi: `ho_so.thu_tuc_id` (UUID) thay cho `ma_thu_tuc`, trạng thái `moi_nop`/`bo_sung` đổi thành `moi`/`cho_bo_sung` (#5).

## [0.0.1] - 2026-10-20
### Added
- Khung dự án: LICENSE (Apache-2.0), NOTICE, CONTRIBUTING, CODE_OF_CONDUCT, CI kiểm tra giấy phép, mẫu issue.
- `docker-compose.yml` profile `core`: PostgreSQL 17, Keycloak 26, PostgREST v13, APISIX 3.13 (standalone); image ghim phiên bản, có healthcheck; `.env.example`.
- `infra/postgres/initdb/`: schema `mot_cua`, bảng `ho_so` bật RLS, role `anon`/`cong_dan`/`can_bo`/`lanh_dao`, quyền theo cột, dữ liệu mẫu giả.
- `infra/keycloak/realm-commune.json`: realm `commune`, client `commune_api`/`commune_web`/`commune_cli`, vai trò ánh xạ sang role PostgreSQL, OTP bắt buộc cho cán bộ và lãnh đạo.
- `infra/apisix/`: route `/api/*` kiểm JWT Keycloak (openid-connect + JWKS), route công khai `/api/thu_tuc` có giới hạn tần suất.
- `docs/architecture.md`: sơ đồ Mermaid 3 tầng, luồng JWT → RLS, chia profile, cách viết BPMN không có modeler, lệnh chạy thử.
- `DEPENDENCIES.md`: khai báo image, thư viện npm/pip, mô hình AI kèm phiên bản, giấy phép, nguồn.
- README: mục "Giấy phép / License" song ngữ.
- CI `.github/workflows/check.yml` chạy `make check` trên mỗi push/PR.
- `.github/PULL_REQUEST_TEMPLATE.md`: mô tả, issue liên quan, checklist `make check`, SPDX, CHANGELOG, tài liệu, bí mật (#1).
- `DEPENDENCIES.md` mục 5: danh sách thành phần không dùng kèm lý do giấy phép và thành phần thay thế (#1).
- `apps/mot-cua/`: ứng dụng Tầng 2 đầu tiên – migration (role `cong_dan`/`can_bo`/`lanh_dao`, schema `mot_cua`, RLS), seed dữ liệu giả, vai trò/nhóm/người dùng Keycloak, `app.env`, smoke riêng (#3).
- Dịch vụ một lần `app-migrate` (áp dụng `apps/<DXOS_APP>/db/` một lần mỗi tệp, ghi sổ `dxos.app_migration` kèm SHA-256, dừng nếu tệp đã áp dụng bị sửa) và `app-realm` (Keycloak Partial Import, bỏ qua đối tượng đã có) (#3).
- Biến `DXOS_APP`, `DXOS_SEED` trong `.env.example`; lệnh `make migrate`, `make seed`, `make smoke` (`scripts/smoke.sh`, `scripts/lib-smoke.sh`) (#3).
- `docs/architecture.md` §2: vì sao lõi độc lập nghiệp vụ, hợp đồng lõi–ứng dụng, cách cắm một ứng dụng khác; §8.2 kết quả chạy thử 20/10/2026 (#3).

### Changed
- NOTICE theo kết quả xác minh giấy phép 17/10/2026: Meilisearch Community Edition (MIT), dbt-core từ PyPI (không dùng dbt Fusion), image `flowable/flowable-rest`, Qwen2.5 chỉ bản 7B/14B; trạng thái "Đã xác minh 17/10/2026".
- `scripts/check-license.sh`, `scripts/add-license-header.sh` (dùng chung `scripts/lib-spdx.sh`): quét thêm Dockerfile, Makefile, `.env.example`, `.yml/.yaml`, `.toml`, `.conf`, `.ini`, `.properties`, `.css`, `.xml/.bpmn`; bỏ qua `.json` và thư mục bên thứ ba.
- `make check` kiểm compose với mọi profile, dùng `.env.example` khi chưa có `.env`.
- `CONTRIBUTING.md` viết lại: quy trình issue → nhánh `feature/<số>-<tên>` từ `develop` → PR → 1 người duyệt → squash; Conventional Commits; quy tắc không commit bí mật và dữ liệu thật (#1).
- Mẫu issue "Việc cần làm" có ô "Tuần" và "Vai phụ trách" khớp nhãn `tuan-*`, `vai-*` (#1).
- `NOTICE` và `LICENSE` (dòng bản quyền trong APPENDIX): `Copyright 2026 DTU_DZ_2` (#1).
- **Tách lõi khỏi nghiệp vụ (D-005, D-008):** `infra/` đổi thành `core/`; init SQL của lõi chỉ còn role `authenticator`/`anon` và schema `dxos` (hàm `dxos.jwt_claims()`, `dxos.jwt_claim()`, `dxos.jwt_sub()`, sổ migration); realm lõi đổi thành `dxos` với client `dxos_api` (không có role) và `dxos_cli`; PostgREST lấy schema từ `apps/<DXOS_APP>/app.env`, đọc role ở `resource_access.dxos_api.roles[0]` (#3).
- APISIX: route công khai đổi từ `/api/thu_tuc` thành `/public/*` (chỉ GET/HEAD, bỏ header Authorization, chạy với role `anon`), lõi không còn nêu tên bảng nghiệp vụ (#3).
- Volume `pg-data` tạo trước bản này không tương thích: `docker compose --profile core down -v && make up` (#3).
- `docs/PLAN.md` theo lộ trình mới: gán vai V1/V2/V3 từng dòng, tách `core/`/`apps/` đầu tuần 2, VPS + tên miền tuần 4, tuần UX và 2 lần tập trình bày, bộ JSON Schema thủ tục dạng dữ liệu mở, module mẫu thứ hai, đóng băng PoF trước 17:00 06/12/2026 (#1).

### Fixed
- Chạy thử profile `core` (17/10/2026): cổng PostgreSQL trên host mặc định đổi sang 55432 để không đụng PostgreSQL cài sẵn; bỏ healthcheck `postgrest --ready` (v13.0.4 không có cờ này, image amd64 không có shell), thay bằng health check chủ động của APISIX tới `/ready` (cổng admin 3001).
- Bỏ các tham chiếu tới tệp không có trong kho (`DEPENDENCIES.md`, `docs/PLAN.md`, CHANGELOG); thông tin nộp bài ghi thẳng trong `docs/PLAN.md` (#1).

### Removed
- `.github/workflows/ci.yml` (thay bằng `check.yml`; job `docker compose build` cũ không có gì để build).

[Unreleased]: https://github.com/commune-dxos/commune-dxos/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/commune-dxos/commune-dxos/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/commune-dxos/commune-dxos/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/commune-dxos/commune-dxos/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/commune-dxos/commune-dxos/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/commune-dxos/commune-dxos/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/commune-dxos/commune-dxos/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/commune-dxos/commune-dxos/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/commune-dxos/commune-dxos/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/commune-dxos/commune-dxos/releases/tag/v0.0.1

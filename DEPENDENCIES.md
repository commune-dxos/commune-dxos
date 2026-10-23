# Khai báo phụ thuộc / Dependencies

Từ OLP PMNM 2026, BTC yêu cầu đội tự rà và khai báo minh bạch giấy phép và nguồn gốc
từng module bên ngoài; khai sai hoặc thiếu bị xử lý nặng hơn năm 2025.
Tệp này bổ sung cho [`NOTICE`](NOTICE): NOTICE ghi thành phần theo lớp kiến trúc,
còn tệp này ghi **từng** image, gói npm, gói pip kèm phiên bản cụ thể.

Quy tắc:
- Chỉ thêm thành phần có giấy phép OSI-approved. Không dùng các thành phần ở mục 5.
- Thêm/nâng phiên bản một phụ thuộc → sửa dòng tương ứng trong cùng commit.
- Cột "Nguồn" là nơi tải về (registry) và nơi đọc giấy phép (repo gốc).
- Cột "Tương thích GPL-3.0": dự án phát hành theo GPL-3.0-or-later (D-010). Gộp được vào
  bản phân phối GPL-3.0: Apache-2.0 (chỉ với GPLv3, không với GPLv2), MIT, BSD, MPL-2.0,
  PostgreSQL, PSF-2.0. Thành phần AGPL-3.0/GPL-2.0 (Garage, ClamAV) chạy như **dịch vụ riêng**
  bằng image gốc, chỉ nói chuyện qua mạng, không liên kết với mã của dự án. "Công cụ" là thứ chỉ
  chạy lúc phát triển/CI, không đi vào sản phẩm. Không thêm thành phần GPL-2.0-only, SSPL, BSL hay
  giấy phép không OSI vào mã của dự án.

## 1. Image Docker (`docker-compose.yml`)

| Image | Phiên bản | Giấy phép | Nguồn | Profile | Tương thích GPL-3.0 |
|---|---|---|---|---|---|
| `postgres` | 17.6-alpine | PostgreSQL | Docker Hub (official) · https://www.postgresql.org/about/licence/ | core | ✓ PostgreSQL (kiểu BSD) |
| pgAudit (biên dịch vào image `commune-dxos/postgres:17.6-pgaudit17.1`) | 17.1 (tag GitHub, SHA-256 `9c5f3750…4361e6c`) | PostgreSQL | https://github.com/pgaudit/pgaudit · LICENSE trong mã nguồn | core | ✓ PostgreSQL (kiểu BSD) |
| `quay.io/keycloak/keycloak` | 26.3.3 | Apache-2.0 | quay.io · https://github.com/keycloak/keycloak | core | ✓ Apache-2.0 (tương thích GPLv3) |
| `postgrest/postgrest` | v13.0.4 | MIT | Docker Hub · https://github.com/PostgREST/postgrest | core | ✓ MIT |
| `apache/apisix` | 3.13.0-debian | Apache-2.0 | Docker Hub · https://github.com/apache/apisix | core | ✓ Apache-2.0 (tương thích GPLv3) |
| `flowable/flowable-rest` | 8.0.0 | Apache-2.0 | Docker Hub · https://github.com/flowable/flowable-engine | core | ✓ Apache-2.0 (tương thích GPLv3) |
| `python` | 3.13.16-alpine3.24 | PSF-2.0 | Docker Hub (official) · https://github.com/python/cpython | core | ✓ PSF-2.0 |
| `dxflrs/garage` | v2.4.1 | AGPL-3.0 – dịch vụ riêng, image gốc, không sửa mã; chỉ gọi qua S3 HTTP và Admin API | Docker Hub · https://git.deuxfleurs.fr/Deuxfleurs/garage | core | Dịch vụ riêng, không liên kết |
| `rabbitmq` | 4.3.6-alpine | MPL-2.0 – dịch vụ riêng, image gốc, không sửa mã; plugin `rabbitmq_stomp`, `rabbitmq_management` có sẵn trong image | Docker Hub (official) · https://github.com/rabbitmq/rabbitmq-server | core | ✓ MPL-2.0; dịch vụ riêng |
| `openbao/openbao` | 2.7.1 | MPL-2.0 – dịch vụ riêng, image gốc, không sửa mã; chỉ gọi qua HTTP API, agent của chính image render tệp bí mật | Docker Hub · https://github.com/openbao/openbao | core | ✓ MPL-2.0; dịch vụ riêng |
| `clamav/clamav` | 1.5.4-debian (đa kiến trúc, có sẵn CSDL virus) | GPL-2.0 – dịch vụ riêng, image gốc, không sửa mã; chỉ gọi qua giao thức TCP của `clamd` | Docker Hub · https://github.com/Cisco-Talos/clamav | core | Dịch vụ riêng, không liên kết |
| `node` | 22.23.4-alpine3.24 – chỉ tầng build của `mot-cua/web-cong-dan/Dockerfile` (npm ci + vite build), không có trong image chạy | MIT | Docker Hub (official) · https://github.com/nodejs/node | core (build) | ✓ MIT; công cụ build |
| `nginxinc/nginx-unprivileged` | 1.30.6-alpine3.24 – image chạy của `mot-cua-web` (cổng công dân, #57): nginx bản gốc không đặc quyền (uid 101), chỉ phục vụ tệp tĩnh | nginx: BSD-2-Clause; đóng gói image: Apache-2.0 | Docker Hub · https://github.com/nginx/docker-nginx-unprivileged | core | ✓ BSD-2-Clause, Apache-2.0 (tương thích GPLv3) |
| `getmeili/meilisearch` | (tuần 5) – chỉ CE | MIT | Docker Hub · https://github.com/meilisearch/meilisearch | docs | ✓ MIT |

Dịch vụ `postgres` chạy image `commune-dxos/postgres:17.6-pgaudit17.1` build từ `nen-tang/postgres/Dockerfile` (#75): bước biên dịch cài tạm `build-base`, `curl`, `icu-dev`, `krb5-dev`, `openssl-dev` của Alpine trên image `postgres` gốc, tải mã nguồn pgAudit tag 17.1, kiểm SHA-256, biên dịch bằng PGXS; image cuối là `postgres:17.6-alpine` gốc cộng `pgaudit.so`, tệp extension và LICENSE, không có công cụ biên dịch. `make test-sql` và CI dùng image `postgres` gốc (migration không cần pgAudit). Image `postgres` gốc cũng được dùng cho dịch vụ một lần `jwks-init` (lấy JWKS bằng `wget` có sẵn trong image) và `db-init` (role + CSDL riêng của dịch vụ lõi bằng `psql`). Image `openbao/openbao` chạy server OpenBao và 6 dịch vụ một lần `*-secrets` (`bao agent`); không kéo thêm image nào cho bí mật. `scripts/check-bpmn.py` chỉ dùng thư viện chuẩn Python 3. Image `python` là nền của image `commune-dxos/mot-cua-api:local` (build từ `mot-cua/backend/Dockerfile`: chỉ thêm các gói pip ghim trong `mot-cua/backend/requirements.txt`, mục 3; mã nguồn vẫn mount chỉ đọc) chạy dịch vụ `mot-cua-api` (API một cửa, `mot-cua/backend/main.py`), và chạy thẳng `mot-cua-worker` (tác vụ nền, `backend/worker.py`) và các dịch vụ một lần `nap-thu-tuc` (bộ nạp gói thủ tục, `backend/nap_thu_tuc.py`; `thu-tuc.yaml` đọc bằng bộ đọc tập con YAML tự viết, không cài PyYAML), `bao-init` (khởi tạo OpenBao qua HTTP API), `garage-init`, `rabbitmq-init`, chỉ dùng thư viện chuẩn, không cài gói. Riêng `mot-cua-api` dùng thêm `jsonschema` cho Poka-yoke phía máy chủ (#59). Backend nói giao thức STOMP 1.2 tới RabbitMQ bằng client tự viết (`mot-cua/backend/stomp.py`), không dùng `pika` hay thư viện nào của RabbitMQ. Backend tự ký S3 SigV4 và nói giao thức `clamd` bằng thư viện chuẩn (`mot-cua/backend/tep.py`): không nhúng hay liên kết mã nào của Garage (AGPL-3.0) hay ClamAV (GPL-2.0). CSDL mẫu virus của ClamAV (tải bằng `freshclam`) do Cisco Talos phân phối kèm image, không nằm trong repo.

## 2. Thư viện npm (`mot-cua/web-cong-dan/package.json`)

Cổng công dân (#52). Phiên bản ghim cứng trong `package.json` (`.npmrc` `save-exact`), cây phụ thuộc đầy đủ khóa trong `package-lock.json`; `make check` (`scripts/check-web.py`) báo lỗi nếu có `^`/`~` hoặc lockfile lệch. "Sản phẩm" là gói có trong bản build chạy trên trình duyệt; "công cụ" chỉ chạy lúc build/test.

| Gói | Phiên bản | Giấy phép | Nguồn | Dùng ở | Tương thích GPL-3.0 |
|---|---|---|---|---|---|
| `react` | 19.3.1 | MIT | npmjs.com · https://github.com/facebook/react | `mot-cua/web-cong-dan` – sản phẩm | ✓ MIT |
| `react-dom` | 19.3.1 | MIT | npmjs.com · https://github.com/facebook/react | `mot-cua/web-cong-dan` – sản phẩm | ✓ MIT |
| `react-router` | 7.18.4 | MIT | npmjs.com · https://github.com/remix-run/react-router | `mot-cua/web-cong-dan` – sản phẩm (điều hướng trang) | ✓ MIT |
| `oidc-client-ts` | 3.5.0 | Apache-2.0 | npmjs.com · https://github.com/authts/oidc-client-ts | `mot-cua/web-cong-dan` – sản phẩm (đăng nhập OIDC + PKCE) | ✓ Apache-2.0 (tương thích GPLv3) |
| `class-variance-authority` | 0.7.1 | Apache-2.0 | npmjs.com · https://github.com/joe-bell/cva | `mot-cua/web-cong-dan` – sản phẩm (biến thể thành phần shadcn/ui) | ✓ Apache-2.0 (tương thích GPLv3) |
| `clsx` | 2.1.1 | MIT | npmjs.com · https://github.com/lukeed/clsx | `mot-cua/web-cong-dan` – sản phẩm | ✓ MIT |
| `tailwind-merge` | 3.7.0 | MIT | npmjs.com · https://github.com/dcastil/tailwind-merge | `mot-cua/web-cong-dan` – sản phẩm | ✓ MIT |
| `tailwindcss` | 4.3.3 | MIT | npmjs.com · https://github.com/tailwindlabs/tailwindcss | `mot-cua/web-cong-dan` – công cụ (sinh CSS lúc build; CSS kết quả vào bản build) | ✓ MIT; công cụ |
| `@tailwindcss/vite` | 4.3.3 | MIT | npmjs.com · https://github.com/tailwindlabs/tailwindcss | `mot-cua/web-cong-dan` – công cụ | ✓ MIT; công cụ |
| `vite` | 7.3.7 | MIT | npmjs.com · https://github.com/vitejs/vite | `mot-cua/web-cong-dan` – công cụ (dev server, build) | ✓ MIT; công cụ |
| `@vitejs/plugin-react` | 5.2.0 | MIT | npmjs.com · https://github.com/vitejs/vite-plugin-react | `mot-cua/web-cong-dan` – công cụ | ✓ MIT; công cụ |
| `typescript` | 5.9.3 | Apache-2.0 | npmjs.com · https://github.com/microsoft/TypeScript | `mot-cua/web-cong-dan` – công cụ (kiểm kiểu) | ✓ Apache-2.0; công cụ |
| `vitest` | 3.2.7 | MIT | npmjs.com · https://github.com/vitest-dev/vitest | `mot-cua/web-cong-dan` – công cụ (test) | ✓ MIT; công cụ |
| `jsdom` | 26.1.0 | MIT | npmjs.com · https://github.com/jsdom/jsdom | `mot-cua/web-cong-dan` – công cụ (DOM giả cho test) | ✓ MIT; công cụ |
| `@testing-library/react` | 16.3.3 | MIT | npmjs.com · https://github.com/testing-library/react-testing-library | `mot-cua/web-cong-dan` – công cụ | ✓ MIT; công cụ |
| `@testing-library/jest-dom` | 6.9.1 | MIT | npmjs.com · https://github.com/testing-library/jest-dom | `mot-cua/web-cong-dan` – công cụ | ✓ MIT; công cụ |
| `@testing-library/user-event` | 14.6.8 | MIT | npmjs.com · https://github.com/testing-library/user-event | `mot-cua/web-cong-dan` – công cụ | ✓ MIT; công cụ |
| `@types/react, @types/react-dom` | 19.3.0 | MIT | npmjs.com · https://github.com/DefinitelyTyped/DefinitelyTyped | `mot-cua/web-cong-dan` – công cụ (kiểu TypeScript) | ✓ MIT; công cụ |
| `@types/node` | 22.20.5 | MIT | npmjs.com · https://github.com/DefinitelyTyped/DefinitelyTyped | `mot-cua/web-cong-dan` – công cụ | ✓ MIT; công cụ |
| `radix-ui` | 1.8.1 | MIT | npmjs.com · https://github.com/radix-ui/primitives | `mot-cua/web-cong-dan` – sản phẩm (nguyên thủy truy cập được cho RadioGroup, Checkbox, Label, Slot của shadcn/ui; cổng cán bộ thêm DropdownMenu, Select, Dialog (Sheet), Tooltip, Avatar) | ✓ MIT |
| `lucide-react` | 1.61.0 | ISC | npmjs.com · https://github.com/lucide-icons/lucide | `mot-cua/web-cong-dan` – sản phẩm (biểu tượng; chỉ biểu tượng được import vào bản build) | ✓ ISC |
| `@cfworker/json-schema` | 4.1.1 | MIT | npmjs.com · https://github.com/cfworker/cfworker | `mot-cua/web-cong-dan` – sản phẩm: Poka-yoke phía trình duyệt, kiểm tệp đã chọn theo JSON Schema 2020-12 của gói trước khi gửi request (#53, `src/lib/thanh-phan.ts`). Không kéo theo gói nào. Chọn thay Ajv vì Ajv biên dịch schema bằng `new Function`, bị CSP `script-src 'self'` của cổng (#57) chặn; thư viện này diễn giải schema, không cần `unsafe-eval` | ✓ MIT |
| `@fontsource/be-vietnam-pro` | 5.3.0 | OFL-1.1 | npmjs.com · https://github.com/fontsource/font-files | `mot-cua/web-cong-dan` – sản phẩm (phông tự host; woff2 latin + vietnamese đóng gói vào bản build, không gọi Google Fonts) | ✓ OFL-1.1 là giấy phép phông, phông là dữ liệu đi kèm, không liên kết vào mã GPL |
| shadcn/ui (mã thành phần, không phải gói npm) | shadcn CLI 4.22.1, kiểu `new-york-v4`, 23/10/2026 | MIT | https://github.com/shadcn-ui/ui · https://ui.shadcn.com/docs/components | `src/components/ui/*.tsx` (15 tệp: alert, badge, breadcrumb, button, card, empty, field, input, input-group, item, label, radio-group, separator, skeleton, textarea) chép vào repo bằng CLI, đội chỉnh chữ ≥ 16px, vùng bấm ≥ 44px; ghi nguồn trong tệp và NOTICE (#63). Bố cục block `login-03` cho màn chưa đăng nhập/đăng nhập lỗi (#64). Cổng cán bộ (#55) thêm 7 tệp: avatar, dropdown-menu, select, sheet, sidebar, table, tooltip, kèm `src/hooks/use-mobile.ts` (đội chỉ dịch nhãn ẩn sang tiếng Việt). Dùng chung gói `radix-ui` có sẵn, không thêm gói npm nào | ✓ MIT |
| shadcn-admin (tham khảo bố cục, không phải gói npm, không chép mã) | bản trên GitHub ngày 23/10/2026 | MIT | https://github.com/satnaing/shadcn-admin | Cổng cán bộ `/can-bo` (#55): thanh bên, đầu trang có chuông và người dùng, ô số liệu, bảng việc. Mã viết lại bằng thành phần shadcn/ui của repo; ghi nguồn ở NOTICE | ✓ MIT |

Rà giấy phép ngày 23/10/2026 (bản mẫu giao diện shadcn, rà lại khi thêm `@cfworker/json-schema` ở #53) trên `package-lock.json` (331 gói kể cả gói kéo theo): 293 MIT, 12 MPL-2.0 (`lightningcss` của Tailwind, công cụ), 10 ISC, 8 Apache-2.0, 2 BSD-2-Clause, 2 BSD-3-Clause, 1 MIT-0 (`@csstools/color-helpers`, công cụ test), 1 0BSD (`tslib`, kéo theo bởi Radix), 1 OFL-1.1 (phông). Gói không thuộc nhánh dev: 91 (86 MIT, 2 Apache-2.0, 1 ISC, 1 0BSD, 1 OFL-1.1), phần lớn là các gói `@radix-ui/*` mà `radix-ui` kéo theo; trình đóng gói chỉ đưa vào bản build phần được import. Một gói không phải giấy phép mã: `caniuse-lite` (CC-BY-4.0, bảng dữ liệu trình duyệt mà `browserslist` của Babel đọc lúc build, kéo theo bởi `@vitejs/plugin-react`), chỉ là công cụ build, không vào bản build và không liên kết với mã của dự án. Không có gói GPL-2.0-only, SSPL, BSL hay giấy phép không OSI trong mã chạy.

## 3. Thư viện Python

Sinh bảng tự động khi có mã: `pip-licenses --format=markdown --with-urls`.

| Gói | Phiên bản | Giấy phép | Nguồn | Dùng ở | Tương thích GPL-3.0 |
|---|---|---|---|---|---|
| `jsonschema` | 4.26.0 | MIT | pypi.org · https://github.com/python-jsonschema/jsonschema | `mot-cua-api` – sản phẩm: Poka-yoke phía máy chủ, kiểm thành phần hồ sơ theo JSON Schema 2020-12 trước khi khởi tạo quy trình (#59, `mot-cua/backend/poka_yoke.py`, `mot-cua/backend/requirements.txt`); `make test-backend`, CI | ✓ MIT |
| `jsonschema-specifications` | 2025.9.1 | MIT | pypi.org · https://github.com/python-jsonschema/jsonschema-specifications | kéo theo bởi `jsonschema` (metaschema các draft) | ✓ MIT |
| `referencing` | 0.37.0 | MIT | pypi.org · https://github.com/python-jsonschema/referencing | kéo theo bởi `jsonschema` (`$ref`) | ✓ MIT |
| `rpds-py` | 0.30.0 | MIT | pypi.org · https://github.com/crate-py/rpds | kéo theo bởi `referencing` (wheel dựng sẵn, cả musllinux cho image alpine) | ✓ MIT |
| `attrs` | 26.1.0 | MIT | pypi.org · https://github.com/python-attrs/attrs | kéo theo bởi `jsonschema`, `referencing` | ✓ MIT |
| _(tuần 4: dbt-core 1.x, duckdb, pyhanko…)_ | | | pypi.org | | |
| `yamllint` | 1.38.0 | GPL-3.0 – chỉ là công cụ lint, chạy riêng, không đi vào sản phẩm | pypi.org · https://github.com/adrienverge/yamllint | `make lint`, CI (`scripts/requirements-lint.txt`) | ✓ cùng GPL-3.0; công cụ |
| `mkdocs` | 1.6.1 | BSD-2-Clause – công cụ build trang tài liệu, không đi vào sản phẩm | pypi.org · https://github.com/mkdocs/mkdocs | `make tai-lieu`, CI `tai-lieu` (`docs/requirements.txt`) | ✓ BSD; công cụ |
| `mkdocs-material` | 9.7.7 | MIT – giao diện trang tài liệu, bản community (không dùng Insiders); JS/CSS của giao diện nằm trong site đã build | pypi.org · https://github.com/squidfunk/mkdocs-material | `make tai-lieu`, CI `tai-lieu` (`docs/requirements.txt`) | ✓ MIT; công cụ |
| `pymdown-extensions` | 12.3 | MIT – phần mở rộng Markdown (khối ghi chú, sơ đồ Mermaid) | pypi.org · https://github.com/facelessuser/pymdown-extensions | `make tai-lieu`, CI `tai-lieu` (`docs/requirements.txt`) | ✓ MIT; công cụ |
| `git-cliff` | 2.14.2 | MIT OR Apache-2.0 – công cụ sinh CHANGELOG và ghi chú phát hành, không đi vào sản phẩm; gói PyPI chứa sẵn binary | pypi.org · https://github.com/orhun/git-cliff | `make nhat-ky`, `make ghi-chu-phat-hanh`, CI `phat-hanh`, `quy-uoc-commit` (`scripts/requirements-phat-hanh.txt`) | ✓ MIT; công cụ |
| `playwright` (Python) | 1.55.0 | Apache-2.0 – công cụ chụp khung sơ đồ động bằng Chromium headless, chỉ chạy trên máy người xuất, không đi vào sản phẩm; Chromium tải vào cache của Playwright, ngoài repo. Ghép khung bằng FFmpeg (LGPL/GPL) cài trên máy, chỉ gọi như công cụ dòng lệnh, không có trong repo | pypi.org · https://github.com/microsoft/playwright-python | `make xuat-kien-truc` (`scripts/requirements-xuat.txt`) | ✓ Apache-2.0; công cụ |
| `shellcheck-py` (ShellCheck 0.11.0) | 0.11.0.1 | MIT (gói bọc), ShellCheck GPL-3.0 – công cụ lint, không đi vào sản phẩm | pypi.org · https://github.com/koalaman/shellcheck | `make lint`, CI (`scripts/requirements-lint.txt`) | ✓ MIT / GPL-3.0; công cụ |

Rà tương thích GPL-3.0 ngày 22/10/2026 (#47): cài `docs/requirements.txt`, `scripts/requirements-lint.txt`, `scripts/requirements-phat-hanh.txt` vào venv tạm rồi chạy `pip-licenses`; 33 gói kể cả gói kéo theo (Jinja2, Markdown, PyYAML, click, requests, urllib3, certifi, pathspec, watchdog…) đều BSD, MIT, Apache-2.0, MPL-2.0 hoặc GPL-3.0-or-later. Không có gói GPL-2.0-only, SSPL, BSL hay giấy phép không OSI. Mã chạy trong sản phẩm (`mot-cua/backend/`, `nen-tang/`) chỉ dùng thư viện chuẩn Python, trừ `mot-cua-api` dùng `jsonschema` và 4 gói kéo theo ở bảng trên (rà 23/10/2026 bằng `pip show`: cả 5 gói khai `License-Expression: MIT`, #59).

Trang tài liệu (`mkdocs.yml`, #32): hook `scripts/tai_lieu_hooks.py` chỉ dùng thư viện chuẩn và bộ kiểm gói của đội (`mot-cua/backend/goi_thu_tuc.py`). Giao diện không tải phông chữ từ Google Fonts (`theme.font: false`). Trang có sơ đồ Mermaid (README các gói thủ tục) để Material tải thư viện `mermaid` (MIT, https://github.com/mermaid-js/mermaid) từ CDN unpkg lúc người đọc mở trang; repo và site không chứa mã Mermaid.

## 4. Mô hình AI (tuần 5)

| Mô hình | Phiên bản | Giấy phép | Nguồn | Tương thích GPL-3.0 |
|---|---|---|---|---|
| Qwen2.5 | 7B hoặc 14B (không dùng 3B) | Apache-2.0 | huggingface.co/Qwen | ✓ Apache-2.0; trọng số chạy qua Ollama, không liên kết |
| bge-m3 | — | MIT | huggingface.co/BAAI/bge-m3 | ✓ MIT; trọng số, không liên kết |

## 5. Thành phần không dùng

Đội chủ động không dùng các thành phần dưới đây, kể cả khi chỉ chạy như dịch vụ riêng: giấy phép không được OSI phê duyệt
(hoặc có phần không OSI) thì không đưa vào kho, đã có thay thế nguồn mở. Kiểm tra giấy phép ngày 17/10/2026.

| Thành phần | Lý do không dùng | Dùng thay |
|---|---|---|
| n8n | Giấy phép Sustainable Use License (fair-code), không OSI | Flowable (BPMN) + RabbitMQ |
| HashiCorp Vault | Chuyển sang BSL 1.1 từ 2023, không OSI | OpenBao (MPL-2.0) |
| Redpanda | Bản cộng đồng dùng BSL 1.1, không OSI | RabbitMQ (MPL-2.0) |
| MongoDB | SSPL, không OSI | PostgreSQL |
| Directus | BSL 1.1, không OSI | PostgREST (MIT) |
| Orion-LD | Bắt buộc chạy kèm MongoDB (SSPL) | Không cần cho đề tài này |
| bpmn-js | Giấy phép bpmn.io có điều khoản giữ logo/watermark, không OSI | BPMN 2.0 viết XML tay trong `thu-tuc/<ma>/quy-trinh.bpmn20.xml` |
| immudb | Các bản từ cuối 2023 (kể cả v1.11.x) chuyển sang BSL 1.1, không OSI | Bảng append-only + chuỗi băm SHA-256 (mã của đội) + pgAudit |
| Meilisearch Enterprise Edition | Các tệp `meilisearch-enterprise-*` dùng BUSL-1.1 | Meilisearch Community Edition (MIT), không bật tính năng EE |
| dbt Fusion | Bản phân phối "dbt" viết bằng Rust dùng giấy phép riêng, không OSI | `dbt-core` 1.x cài từ PyPI (Apache-2.0) |
| Mô hình Llama, Gemma | Giấy phép riêng của Meta/Google có điều khoản hạn chế sử dụng, không OSI | Qwen2.5 7B/14B (Apache-2.0) |
| Qwen2.5-3B | Dùng giấy phép Qwen Research, không phải Apache-2.0 như bản 7B/14B | Qwen2.5 7B hoặc 14B, không hạ xuống 3B cho máy yếu |

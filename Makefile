# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
.PHONY: up down logs ps migrate seed nap-thu-tuc smoke demo-users lint test test-backend test-sql test-web license check bao-init bao-status bao-import-env tai-lieu xem-tai-lieu xuat-kien-truc nhat-ky ghi-chu-phat-hanh

# Chưa có .env (máy CI, máy mới clone) thì kiểm tra compose bằng .env.example.
COMPOSE_ENV := $(if $(wildcard .env),,--env-file .env.example)

up:            ## Chạy nền tảng Tầng 1 + bộ máy mot-cua + nạp gói thu-tuc/ + cổng công dân http://localhost:9080/ (profile core); tự init/unseal OpenBao. Cần: cp .env.example .env
	@test -f .env || { echo "Thiếu .env — chạy: cp .env.example .env (không có mật khẩu nào cần điền)"; exit 1; }
	docker compose --profile core up -d --build

bao-init:      ## OpenBao: init (lần đầu) → unseal → KV, policy, AppRole, bí mật lõi. Idempotent; `make up` tự gọi
	@test -f .env || { echo "Thiếu .env — chạy: cp .env.example .env"; exit 1; }
	docker compose --profile core up -d openbao
	docker compose --profile core run --rm bao-init

bao-status:    ## Trạng thái OpenBao (initialized, sealed); không in bí mật
	docker compose exec openbao bao status

bao-import-env: ## Chuyển mật khẩu từ .env cũ (trước #10) sang OpenBao, GHI ĐÈ giá trị đang có
	BAO_IMPORT_ENV=force $(MAKE) --no-print-directory bao-init

down:          ## Dừng mọi dịch vụ, GIỮ volume dữ liệu
	docker compose --profile '*' down

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps -a

migrate:       ## Chạy lại migration SQL + vai trò Keycloak của mot-cua (bỏ qua phần đã áp dụng)
	docker compose --profile core run --rm --no-deps tang2-migrate
	docker compose --profile core run --rm --no-deps tang2-realm

seed:          ## Nạp dữ liệu mẫu giả mot-cua/db/seed/ (kể cả khi .env đặt DXOS_SEED=false)
	DXOS_SEED=true docker compose --profile core run --rm --no-deps tang2-migrate

nap-thu-tuc:   ## Nạp lại gói thu-tuc/*/: kiểm gói, deploy BPMN lên Flowable, ghi danh mục (gói lỗi bị bỏ qua)
	docker compose --profile core run --rm --no-deps nap-thu-tuc

smoke:         ## Kiểm tra hệ thống đang chạy: nền tảng (JWT, JWKS, OpenBao…) + bộ máy mot-cua + gói thủ tục
	bash scripts/smoke.sh

demo-users:    ## Đặt mật khẩu chung cho người dùng mẫu để thử tay (chạy sau smoke). DXOS_DEMO_PASSWORD=… hoặc sinh ngẫu nhiên
	bash scripts/demo-users.sh

lint:          ## Lint như CI (job shellcheck, yamllint, bpmn). Cài công cụ: pip install -r scripts/requirements-lint.txt
	bash scripts/lint.sh

test: test-backend test-sql ## Test như CI (job test-backend, test-sql)

# Test backend cần jsonschema (Poka-yoke phía máy chủ, #59) như image mot-cua-api. Cài:
# python3 -m venv .venv && .venv/bin/pip install -r mot-cua/backend/requirements.txt, rồi PYTHON=.venv/bin/python.
PYTHON ?= python3
test-backend:  ## Test đơn vị (không cần Docker): mot-cua/backend/tests/test_*.py (kể cả bộ nạp gói, Poka-yoke), unittest. Cần jsonschema (mot-cua/backend/requirements.txt)
	@$(PYTHON) -c 'import jsonschema' 2> /dev/null || { echo "LỖI: $(PYTHON) chưa có jsonschema — python3 -m venv .venv && .venv/bin/pip install -r mot-cua/backend/requirements.txt, rồi PYTHON=.venv/bin/python make test-backend"; exit 1; }
	PYTHONDONTWRITEBYTECODE=1 $(PYTHON) -m unittest discover -s mot-cua/backend/tests -p 'test_*.py'

test-web:      ## Test + build cổng công dân (cần Node ≥ 20.19): npm ci, Vitest, tsc, vite build (#52)
	cd mot-cua/web-cong-dan && npm ci --no-audit --no-fund && npm test && npm run build

test-sql:      ## Migration nền tảng + mot-cua và mot-cua/db/tests/*.sql (RLS) trên PostgreSQL tạm (Docker, hoặc PGHOST)
	sh scripts/test-sql.sh

# Trang tài liệu MkDocs (#32), không cần Docker. Cài: python3 -m venv .venv && .venv/bin/pip install -r docs/requirements.txt
# rồi chạy với PATH="$$PWD/.venv/bin:$$PATH" hoặc MKDOCS=.venv/bin/mkdocs. Bản 1.6.1 ghim sẵn, nên tắt lời nhắc MkDocs 2.0 của Material.
MKDOCS ?= mkdocs
TAI_LIEU_ENV := NO_MKDOCS_2_WARNING=1 PYTHONDONTWRITEBYTECODE=1

tai-lieu:      ## Build trang tài liệu vào site/ (--strict: link gãy, neo sai, gói thu-tuc/ lỗi là lỗi)
	@command -v $(MKDOCS) > /dev/null 2>&1 || { echo "LỖI: chưa có mkdocs — python3 -m venv .venv && .venv/bin/pip install -r docs/requirements.txt, rồi MKDOCS=.venv/bin/mkdocs make tai-lieu"; exit 1; }
	$(TAI_LIEU_ENV) $(MKDOCS) build --strict

xem-tai-lieu:  ## Xem trang tài liệu trên máy ở http://127.0.0.1:8000, tự build lại khi sửa docs/, thu-tuc/
	$(TAI_LIEU_ENV) $(MKDOCS) serve

# Sơ đồ kiến trúc động (#43): docs/images/kien-truc-dong.svg → GIF cho README, MP4 cho slide. Không cần Docker.
# Cài: python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements-xuat.txt && .venv/bin/playwright install chromium
# (hoặc KENH=chrome để dùng Google Chrome có sẵn), cần ffmpeg. Chạy với XUAT_PY=.venv/bin/python.
XUAT_PY ?= python3

xuat-kien-truc: ## Xuất sơ đồ kiến trúc động ra docs/images/kien-truc-dong.gif và docs/media/kien-truc-dong.mp4
	PYTHONDONTWRITEBYTECODE=1 $(XUAT_PY) scripts/xuat_kien_truc.py

# CHANGELOG và ghi chú phát hành sinh bằng git-cliff (D-009 hướng 4, #36), không cần Docker.
# Cài: python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements-phat-hanh.txt
# rồi chạy với PATH="$$PWD/.venv/bin:$$PATH" hoặc GIT_CLIFF=.venv/bin/git-cliff. Quy trình: docs/quy-trinh-lam-viec.md.
GIT_CLIFF ?= git-cliff
NHAT_KY := GIT_CLIFF=$(GIT_CLIFF) PYTHONDONTWRITEBYTECODE=1 python3 scripts/nhat_ky.py

nhat-ky:       ## Viết lại mục [Unreleased] của CHANGELOG từ commit sau tag mới nhất; PHIEN_BAN=x.y.z: đổi thành mục phiên bản đó
	$(NHAT_KY) nhat-ky $(PHIEN_BAN)

ghi-chu-phat-hanh: ## In ghi chú phát hành vX.Y.Z ra stdout (tag chưa có thì xem trước tới HEAD). Cần PHIEN_BAN=x.y.z
	@test -n "$(PHIEN_BAN)" || { echo "Thiếu PHIEN_BAN — ví dụ: make ghi-chu-phat-hanh PHIEN_BAN=0.1.0"; exit 1; }
	@$(NHAT_KY) ghi-chu $(PHIEN_BAN)

license:       ## Thêm header SPDX (bản quyền + GPL-3.0-or-later, D-010) cho tệp mới
	bash scripts/add-license-header.sh

check:         ## Kiểm tra trước khi commit/nộp: SPDX GPL-3.0-or-later + BPMN thu-tuc/*/ + web ghim phiên bản + test đơn vị + compose hợp lệ (mọi profile)
	bash scripts/check-license.sh
	PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/tests/test_check_license.py
	python3 scripts/check-bpmn.py
	PYTHONDONTWRITEBYTECODE=1 python3 scripts/check-web.py
	PYTHONDONTWRITEBYTECODE=1 python3 mot-cua/backend/nap_thu_tuc.py thu-tuc --chi-kiem
	$(MAKE) --no-print-directory test-backend
	docker compose $(COMPOSE_ENV) --profile '*' config --quiet && echo "OK: docker-compose.yml hợp lệ (mọi profile)"

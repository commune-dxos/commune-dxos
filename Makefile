# SPDX-License-Identifier: Apache-2.0
.PHONY: up down logs ps migrate seed smoke test license check bao-init bao-status bao-import-env

# Chưa có .env (máy CI, máy mới clone) thì kiểm tra compose bằng .env.example.
COMPOSE_ENV := $(if $(wildcard .env),,--env-file .env.example)

up:            ## Chạy lõi Tầng 1 + ứng dụng DXOS_APP (profile core); tự init/unseal OpenBao. Cần: cp .env.example .env
	@test -f .env || { echo "Thiếu .env — chạy: cp .env.example .env (không có mật khẩu nào cần điền)"; exit 1; }
	docker compose --profile core up -d

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

migrate:       ## Chạy lại migration SQL + vai trò Keycloak của apps/$$DXOS_APP (bỏ qua phần đã áp dụng)
	docker compose --profile core run --rm --no-deps app-migrate
	docker compose --profile core run --rm --no-deps app-realm

seed:          ## Nạp dữ liệu mẫu giả apps/$$DXOS_APP/db/seed/ (kể cả khi .env đặt DXOS_SEED=false)
	DXOS_SEED=true docker compose --profile core run --rm --no-deps app-migrate

smoke:         ## Kiểm tra lõi đang chạy: JWT qua APISIX, JWKS, migration chạy lại + smoke của ứng dụng
	bash scripts/smoke.sh

test:          ## Test đơn vị (không cần Docker): apps/*/backend/tests/test_*.py, thư viện chuẩn unittest
	@for d in apps/*/backend/tests; do [ -d "$$d" ] || continue; \
	  echo "== $$d"; PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "$$d" -p 'test_*.py' || exit 1; done

license:       ## Thêm header SPDX cho tệp mới
	bash scripts/add-license-header.sh

check:         ## Kiểm tra trước khi commit/nộp: SPDX + cú pháp BPMN + test đơn vị + compose hợp lệ (mọi profile)
	bash scripts/check-license.sh
	python3 scripts/check-bpmn.py
	$(MAKE) --no-print-directory test
	docker compose $(COMPOSE_ENV) --profile '*' config --quiet && echo "OK: docker-compose.yml hợp lệ (mọi profile)"

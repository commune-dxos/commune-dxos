# SPDX-License-Identifier: Apache-2.0
.PHONY: up down logs ps migrate seed smoke license check

# Chưa có .env (máy CI, máy mới clone) thì kiểm tra compose bằng .env.example.
COMPOSE_ENV := $(if $(wildcard .env),,--env-file .env.example)

up:            ## Chạy lõi Tầng 1 + ứng dụng DXOS_APP (profile core). Cần: cp .env.example .env
	@test -f .env || { echo "Thiếu .env — chạy: cp .env.example .env rồi đổi mật khẩu"; exit 1; }
	docker compose --profile core up -d

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

license:       ## Thêm header SPDX cho tệp mới
	bash scripts/add-license-header.sh

check:         ## Kiểm tra trước khi commit/nộp: SPDX + cú pháp BPMN + compose hợp lệ (mọi profile)
	bash scripts/check-license.sh
	python3 scripts/check-bpmn.py
	docker compose $(COMPOSE_ENV) --profile '*' config --quiet && echo "OK: docker-compose.yml hợp lệ (mọi profile)"

# SPDX-License-Identifier: Apache-2.0
.PHONY: up down logs ps seed license check

# Chưa có .env (máy CI, máy mới clone) thì kiểm tra compose bằng .env.example.
COMPOSE_ENV := $(if $(wildcard .env),,--env-file .env.example)

up:            ## Chạy lõi Tầng 1 (profile core). Cần: cp .env.example .env
	@test -f .env || { echo "Thiếu .env — chạy: cp .env.example .env rồi đổi mật khẩu"; exit 1; }
	docker compose --profile core up -d

down:
	docker compose --profile '*' down

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps

seed:          ## Bơm dữ liệu mẫu — dữ liệu mẫu tuần 1 nằm trong infra/postgres/initdb/
	@echo "TODO tuần 2: script seed riêng cho schema đầy đủ"

license:       ## Thêm header SPDX cho tệp mới
	bash scripts/add-license-header.sh

check:         ## Kiểm tra trước khi commit/nộp: SPDX + compose hợp lệ (mọi profile)
	bash scripts/check-license.sh
	docker compose $(COMPOSE_ENV) --profile '*' config --quiet && echo "OK: docker-compose.yml hợp lệ (mọi profile)"

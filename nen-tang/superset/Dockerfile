# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Image Superset của nền tảng (#82) = image gốc apache/superset:6.1.0 (bản lean) + hai gói mà bản lean
# không kèm: driver PostgreSQL psycopg2-binary (đúng phiên bản Superset khai ở extra "postgres") và
# Authlib (đăng nhập OIDC Keycloak). Cài bằng uv vào virtualenv của image, không sửa mã Superset.
# Cấu hình (superset_config.py) và bí mật mount lúc chạy, không chép vào image.
FROM apache/superset:6.1.0
USER root
RUN uv pip install --python /app/.venv/bin/python --no-cache psycopg2-binary==2.9.9 authlib==1.8.0
USER superset

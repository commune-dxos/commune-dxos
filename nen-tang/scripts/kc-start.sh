#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Entrypoint của dịch vụ `keycloak` (#10): Keycloak không đọc được mật khẩu từ tệp (*_FILE),
# nên đọc tệp do agent `keycloak-secrets` render từ OpenBao (volume keycloak-secrets, chỉ
# đọc) vào biến môi trường của RIÊNG tiến trình Keycloak rồi chạy kc.sh. Mật khẩu không nằm
# trong cấu hình container (docker inspect) hay .env, không in ra log.
set -euo pipefail
D="${KC_SECRETS_DIR:-/run/dxos-secrets}"
for f in db_password admin_password; do
  [ -s "$D/$f" ] || { echo "kc-start: thiếu $D/$f (agent keycloak-secrets chưa render?)" >&2; exit 1; }
done
KC_DB_PASSWORD="$(< "$D/db_password")"
KC_BOOTSTRAP_ADMIN_PASSWORD="$(< "$D/admin_password")"
export KC_DB_PASSWORD KC_BOOTSTRAP_ADMIN_PASSWORD
exec /opt/keycloak/bin/kc.sh "$@"

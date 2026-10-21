#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Dịch vụ một lần `app-realm` của lõi: nạp vai trò, nhóm, client và người dùng mẫu của
# ứng dụng đang chọn vào realm lõi bằng Partial Import của Keycloak (Admin REST API).
# Quy ước: /app/keycloak/realm.json (= apps/<DXOS_APP>/keycloak/realm.json) theo định dạng
# PartialImportRepresentation: roles, groups, clients, users.
# ifResourceExists=SKIP: đối tượng đã có thì giữ nguyên (không ghi đè người dùng đã cài
# OTP hay đổi `sub`), nên chạy lại bao nhiêu lần cũng không lỗi.
# Chạy trong image Keycloak (có sẵn kcadm.sh), không kéo thêm image.
set -euo pipefail
: "${DXOS_APP:?Thiếu DXOS_APP}"
: "${KEYCLOAK_ADMIN_PASSWORD:?Thiếu KEYCLOAK_ADMIN_PASSWORD}"
REALM="${DXOS_REALM:-dxos}"
TEP="${APP_DIR:-/app}/keycloak/realm.json"
KCADM=/opt/keycloak/bin/kcadm.sh
CFG="/tmp/kcadm-$$.config"
trap 'rm -f "$CFG"' EXIT

[ -f "$TEP" ] || { echo "app-realm: $DXOS_APP không có keycloak/realm.json, bỏ qua"; exit 0; }

"$KCADM" config credentials --config "$CFG" \
  --server "${KEYCLOAK_URL:-http://keycloak:8080}" --realm master \
  --user "${KEYCLOAK_ADMIN:-admin}" --password "$KEYCLOAK_ADMIN_PASSWORD" > /dev/null

ket_qua="$("$KCADM" create partialImport --config "$CFG" -r "$REALM" \
  -s ifResourceExists=SKIP -o -f "$TEP")"
# Chỉ in số lượng, không in chi tiết người dùng. Image Keycloak không có grep: dùng bash.
tom_tat=""
for k in added skipped overwritten; do
  if [[ "$ket_qua" =~ \"$k\"[[:space:]]*:[[:space:]]*([0-9]+) ]]; then
    tom_tat+="$k=${BASH_REMATCH[1]} "
  fi
done
echo "app-realm: $DXOS_APP → realm $REALM: ${tom_tat:-không có thay đổi}"

# Client có service account (confidential) mà ứng dụng khai báo trong realm.json: ghi
# client secret (Keycloak tự sinh khi nạp) vào volume bí mật của ứng dụng, tệp
# keycloak-<clientId>.secret quyền 600, để backend của ứng dụng lấy token Client
# Credentials. Secret không nằm trong repo, không in ra log. TODO(#10): ghi vào OpenBao.
if [ -n "${APP_SECRETS_DIR:-}" ]; then
  umask 077
  mkdir -p "$APP_SECRETS_DIR"
  con="$(< "$TEP")"
  while [[ "$con" =~ \"clientId\"[[:space:]]*:[[:space:]]*\"([A-Za-z0-9_.-]+)\" ]]; do
    client_id="${BASH_REMATCH[1]}"
    con="${con#*"${BASH_REMATCH[0]}"}"
    info="$("$KCADM" get clients --config "$CFG" -r "$REALM" -q "clientId=$client_id" \
      --fields id,serviceAccountsEnabled,publicClient)"
    [[ "$info" =~ \"serviceAccountsEnabled\"[[:space:]]*:[[:space:]]*true ]] || continue
    [[ "$info" =~ \"publicClient\"[[:space:]]*:[[:space:]]*true ]] && continue
    [[ "$info" =~ \"id\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]] || continue
    bi_mat="$("$KCADM" get "clients/${BASH_REMATCH[1]}/client-secret" --config "$CFG" -r "$REALM")"
    [[ "$bi_mat" =~ \"value\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]] || {
      echo "app-realm: không đọc được secret của client $client_id" >&2; exit 1; }
    printf '%s' "${BASH_REMATCH[1]}" > "$APP_SECRETS_DIR/keycloak-$client_id.secret.tmp"
    mv "$APP_SECRETS_DIR/keycloak-$client_id.secret.tmp" "$APP_SECRETS_DIR/keycloak-$client_id.secret"
    echo "app-realm: secret của client $client_id → $APP_SECRETS_DIR/keycloak-$client_id.secret"
  done
fi

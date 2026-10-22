#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Dịch vụ một lần `tang2-realm` của lõi: nạp vai trò, nhóm, client và người dùng mẫu của
# dịch vụ Tầng 2 vào realm lõi bằng Partial Import của Keycloak (Admin REST API).
# Quy ước: /tang2/keycloak/realm.json (= mot-cua/keycloak/realm.json) theo định dạng
# PartialImportRepresentation: roles, groups, clients, users.
# ifResourceExists=SKIP: đối tượng đã có thì giữ nguyên (không ghi đè người dùng đã cài
# OTP hay đổi `sub`), nên chạy lại bao nhiêu lần cũng không lỗi.
# Chạy trong image Keycloak (có sẵn kcadm.sh), không kéo thêm image.
#
# Bí mật (#10): đăng nhập OpenBao bằng AppRole `tang2-realm` (role_id/secret_id do bao-init đặt
# trong volume tang2-realm-secrets), đọc mật khẩu quản trị Keycloak và ghi client secret vào
# dxos/tang2/<DXOS_TANG2>/keycloak/<clientId>. Image không có curl: HTTP/1.0 qua /dev/tcp của
# bash (mạng nội bộ Docker). Policy: nen-tang/openbao/policies/tang2-realm.hcl.
set -euo pipefail
: "${DXOS_TANG2:?Thiếu DXOS_TANG2}"
REALM="${DXOS_REALM:-dxos}"
TEP="${TANG2_DIR:-/tang2}/keycloak/realm.json"
KCADM=/opt/keycloak/bin/kcadm.sh
CFG="/tmp/kcadm-$$.config"
trap 'rm -f "$CFG"' EXIT
BAO_ADDR="${BAO_ADDR:-http://openbao:8200}"
BAO_HOST="${BAO_ADDR#http://}"; BAO_PORT="${BAO_HOST##*:}"; BAO_HOST="${BAO_HOST%%:*}"
APPROLE_DIR="${BAO_APPROLE_DIR:-/run/dxos-secrets/approle}"
CRLF=$'\r\n'

# bao_http <METHOD> <đường dẫn sau /v1/> [body JSON] → đặt BAO_STATUS, BAO_BODY.
# Token (nếu có) lấy từ biến BAO_TOKEN. Không in request hay response.
bao_http() {
  local body="${3:-}" resp
  exec 3<>"/dev/tcp/$BAO_HOST/$BAO_PORT"
  printf '%s /v1/%s HTTP/1.0\r\nHost: %s\r\n%sContent-Type: application/json\r\nContent-Length: %d\r\n\r\n%s' \
    "$1" "$2" "$BAO_HOST" "${BAO_TOKEN:+X-Vault-Token: $BAO_TOKEN$CRLF}" "${#body}" "$body" >&3
  resp="$(cat <&3)"
  exec 3<&-
  BAO_STATUS="${resp:9:3}"
  BAO_BODY="${resp#*"$CRLF$CRLF"}"
}
# json_str <khóa> → giá trị chuỗi đầu tiên của khóa trong BAO_BODY (giá trị không chứa ")
json_str() {
  [[ "$BAO_BODY" =~ \"$1\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]] || return 1
  printf '%s' "${BASH_REMATCH[1]}"
}

[ -f "$TEP" ] || { echo "tang2-realm: $DXOS_TANG2 không có keycloak/realm.json, bỏ qua"; exit 0; }

BAO_TOKEN=""
bao_http POST auth/approle/login \
  "{\"role_id\":\"$(< "$APPROLE_DIR/role_id")\",\"secret_id\":\"$(< "$APPROLE_DIR/secret_id")\"}"
[ "$BAO_STATUS" = 200 ] || { echo "tang2-realm: đăng nhập OpenBao (AppRole tang2-realm) → HTTP $BAO_STATUS" >&2; exit 1; }
BAO_TOKEN="$(json_str client_token)"
bao_http GET dxos/data/core/keycloak/admin
[ "$BAO_STATUS" = 200 ] || { echo "tang2-realm: đọc mật khẩu quản trị Keycloak → HTTP $BAO_STATUS" >&2; exit 1; }
KC_ADMIN_PW="$(json_str password)"

"$KCADM" config credentials --config "$CFG" \
  --server "${KEYCLOAK_URL:-http://keycloak:8080}" --realm master \
  --user "${KEYCLOAK_ADMIN:-admin}" --password "$KC_ADMIN_PW" > /dev/null
unset KC_ADMIN_PW

ket_qua="$("$KCADM" create partialImport --config "$CFG" -r "$REALM" \
  -s ifResourceExists=SKIP -o -f "$TEP")"
# Chỉ in số lượng, không in chi tiết người dùng. Image Keycloak không có grep: dùng bash.
tom_tat=""
for k in added skipped overwritten; do
  if [[ "$ket_qua" =~ \"$k\"[[:space:]]*:[[:space:]]*([0-9]+) ]]; then
    tom_tat+="$k=${BASH_REMATCH[1]} "
  fi
done
echo "tang2-realm: $DXOS_TANG2 → realm $REALM: ${tom_tat:-không có thay đổi}"

# Client có service account (confidential) mà Tầng 2 khai báo trong realm.json: ghi
# client secret (Keycloak tự sinh khi nạp) vào OpenBao, dxos/tang2/<DXOS_TANG2>/keycloak/
# <clientId>, để backend Tầng 2 lấy token Client Credentials. Secret không nằm trong
# repo hay trên đĩa, không in ra log.
{
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
      echo "tang2-realm: không đọc được secret của client $client_id" >&2; exit 1; }
    bao_http POST "dxos/data/tang2/$DXOS_TANG2/keycloak/$client_id" "{\"data\":{\"secret\":\"${BASH_REMATCH[1]}\"}}"
    [ "$BAO_STATUS" = 200 ] || { echo "tang2-realm: ghi secret client $client_id vào OpenBao → HTTP $BAO_STATUS" >&2; exit 1; }
    echo "tang2-realm: secret của client $client_id → OpenBao dxos/tang2/$DXOS_TANG2/keycloak/$client_id"
  done
}
bao_http POST auth/token/revoke-self "{}"

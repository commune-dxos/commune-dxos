#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Dịch vụ một lần `ca-init` của lõi (#77): cấp chứng thư ký tài liệu cho dịch vụ Tầng 2 DXOS_TANG2.
# Lõi chỉ biết "dịch vụ Tầng 2 có một chứng thư ký tài liệu tên DXOS_KY_SO_TEN", không biết giấy tờ nào.
#   1. Đăng nhập OpenBao bằng AppRole ca-init (volume ca-init-secrets chỉ có role_id/secret_id).
#   2. Đã có dxos/tang2/<DXOS_TANG2>/ky-so cùng tên, cùng root CA hiện tại và còn hạn hơn
#      DXOS_KY_SO_GIA_HAN (mặc định 30 ngày) → giữ nguyên.
#   3. Không thì sinh khóa RSA 3072 mới, xin step-ca chứng thư (provisioner JWK, mật khẩu provisioner
#      từ OpenBao, mẫu nen-tang/step-ca/ky-tai-lieu.tpl) và ghi khóa + chuỗi chứng thư + root vào
#      OpenBao. Backend Tầng 2 đọc ở đó (policy dxos-tang2), khóa không bao giờ ra đĩa ngoài thư mục tạm.
# Không in khóa, mật khẩu hay token. Chạy ở mỗi `make up`, idempotent.
set -euo pipefail
: "${DXOS_TANG2:?Thiếu DXOS_TANG2}" "${DXOS_KY_SO_TEN:?Thiếu DXOS_KY_SO_TEN}"
BAO="${BAO_ADDR:-http://openbao:8200}"
CA_URL="${STEP_CA_URL:-https://step-ca:9000}"
ROOT="${STEP_CA_ROOT:-/ca/certs/root_ca.crt}"
PROV="${DXOS_CA_PROVISIONER:-dxos-ky-so}"
D="${CA_INIT_SECRETS_DIR:-/run/dxos-secrets}"
DUONG="dxos/data/tang2/$DXOS_TANG2/ky-so"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
umask 077
export STEPPATH="$T/step"

for _ in $(seq 1 60); do [ -s "$ROOT" ] && break; sleep 1; done
[ -s "$ROOT" ] || { echo "ca-init: thiếu root CA $ROOT (step-ca chưa khởi tạo?)" >&2; exit 1; }

# Token OpenBao chỉ nằm trong tệp header (curl -H @tệp), không vào tham số lệnh.
jq -n --rawfile r "$D/approle/role_id" --rawfile s "$D/approle/secret_id" \
  '{role_id: ($r | rtrimstr("\n")), secret_id: ($s | rtrimstr("\n"))}' > "$T/dang-nhap.json"
curl -sf -X POST --data @"$T/dang-nhap.json" "$BAO/v1/auth/approle/login" \
  | jq -r '"X-Vault-Token: " + .auth.client_token' > "$T/h" \
  || { echo "ca-init: đăng nhập AppRole ca-init thất bại" >&2; exit 1; }

goc_fp="$(step certificate fingerprint "$ROOT")"
ma="$(curl -s -o "$T/cu.json" -w '%{http_code}' -H @"$T/h" "$BAO/v1/$DUONG")"
if [ "$ma" = 200 ]; then
  jq -j '.data.data.chung_thu_pem' "$T/cu.json" > "$T/cu.crt"
  jq -j '.data.data.goc_pem' "$T/cu.json" > "$T/cu-goc.crt"
  if [ "$(jq -r '.data.data.ten' "$T/cu.json")" = "$DXOS_KY_SO_TEN" ] \
     && [ "$(step certificate fingerprint "$T/cu-goc.crt")" = "$goc_fp" ] \
     && step certificate verify "$T/cu.crt" --roots "$ROOT" > /dev/null 2>&1 \
     && ! step certificate needs-renewal "$T/cu.crt" --expires-in "${DXOS_KY_SO_GIA_HAN:-720h}" > /dev/null 2>&1; then
    echo "ca-init: chứng thư ký tài liệu của $DXOS_TANG2 còn hạn tới $(step certificate inspect "$T/cu.crt" --format json | jq -r .validity.end), giữ nguyên"
    exit 0
  fi
  echo "ca-init: chứng thư cũ đổi tên, đổi CA hoặc sắp hết hạn → cấp mới"
elif [ "$ma" != 404 ]; then
  echo "ca-init: đọc $DUONG → HTTP $ma" >&2; exit 1
fi

curl -sf -H @"$T/h" "$BAO/v1/dxos/data/core/step-ca/provisioner" | jq -r '.data.data.password' > "$T/pp"
[ -s "$T/pp" ] || { echo "ca-init: không đọc được mật khẩu provisioner" >&2; exit 1; }
for _ in $(seq 1 30); do
  step ca health --ca-url "$CA_URL" --root "$ROOT" > /dev/null 2>&1 && break; sleep 2
done
step ca certificate "$DXOS_KY_SO_TEN" "$T/ky.crt" "$T/ky.key" --san "ky-so.$DXOS_TANG2" \
  --ca-url "$CA_URL" --root "$ROOT" --provisioner "$PROV" --provisioner-password-file "$T/pp" \
  --not-after "${DXOS_KY_SO_THOI_HAN:-8760h}" --kty RSA --size 3072 > /dev/null 2>&1 \
  || { echo "ca-init: step-ca không cấp chứng thư" >&2; exit 1; }
thong_tin="$(step certificate inspect "$T/ky.crt" --format json)"
jq -n --rawfile k "$T/ky.key" --rawfile c "$T/ky.crt" --rawfile g "$ROOT" --arg ten "$DXOS_KY_SO_TEN" \
  --arg het_han "$(jq -r .validity.end <<<"$thong_tin")" --arg so_hieu "$(jq -r .serial_number <<<"$thong_tin")" \
  '{data: {khoa_pem: $k, chung_thu_pem: $c, goc_pem: $g, ten: $ten, het_han: $het_han, so_hieu: $so_hieu}}' > "$T/ghi.json"
curl -sf -X POST -H @"$T/h" -H 'Content-Type: application/json' --data @"$T/ghi.json" "$BAO/v1/$DUONG" > /dev/null \
  || { echo "ca-init: không ghi được $DUONG" >&2; exit 1; }
curl -s -X POST -H @"$T/h" "$BAO/v1/auth/token/revoke-self" > /dev/null || true
echo "ca-init: đã cấp chứng thư ký tài liệu \"$DXOS_KY_SO_TEN\" (số hiệu $(jq -r .serial_number <<<"$thong_tin"), hạn $(jq -r .validity.end <<<"$thong_tin")) → OpenBao $DUONG"

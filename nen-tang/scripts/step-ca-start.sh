#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Entrypoint của dịch vụ `step-ca` (#77): CA nội bộ, image gốc smallstep/step-ca, không sửa mã.
# Lần đầu (volume step-ca-data trống): `step ca init` một CA hai tầng (root + intermediate) tên
# DXOS_CA_TEN, khóa mã hóa bằng mật khẩu trong OpenBao (agent step-ca-secrets render vào
# /run/dxos-secrets, chỉ đọc), một provisioner JWK cho ký tài liệu. Mỗi lần khởi động: áp lại mẫu
# chứng thư nen-tang/step-ca/ky-tai-lieu.tpl và thời hạn (mặc định 1 năm) cho provisioner đó, rồi
# chạy step-ca. Khóa CA chỉ nằm trong volume (đã mã hóa), không bao giờ vào git hay log.
# Mật khẩu chỉ áp dụng khi khởi tạo: đổi trong OpenBao sau đó thì step-ca không mở được khóa
# (docs/architecture.md §4.7).
set -euo pipefail
export STEPPATH=/home/step
D="${STEP_CA_SECRETS_DIR:-/run/dxos-secrets}"
PROV="${DXOS_CA_PROVISIONER:-dxos-ky-so}"
for f in password provisioner_password; do
  [ -s "$D/$f" ] || { echo "step-ca-start: thiếu $D/$f (agent step-ca-secrets chưa render?)" >&2; exit 1; }
done
if [ ! -f "$STEPPATH/config/ca.json" ]; then
  step ca init --deployment-type standalone --name "${DXOS_CA_TEN:?Thiếu DXOS_CA_TEN}" \
    --dns step-ca,localhost --address :9000 --provisioner "$PROV" \
    --password-file "$D/password" --provisioner-password-file "$D/provisioner_password" > /dev/null
  echo "step-ca-start: đã khởi tạo CA \"$DXOS_CA_TEN\" (root + intermediate, provisioner $PROV)"
fi
step ca provisioner update "$PROV" --x509-template /nen-tang/step-ca/ky-tai-lieu.tpl \
  --x509-min-dur 1h --x509-default-dur "${DXOS_KY_SO_THOI_HAN:-8760h}" --x509-max-dur 8784h > /dev/null
echo "step-ca-start: root $(step certificate fingerprint "$STEPPATH/certs/root_ca.crt")"
exec step-ca --password-file "$D/password" "$STEPPATH/config/ca.json"

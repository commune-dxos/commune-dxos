#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke giấy tờ có ký số (#77), được mot-cua/tests/smoke.sh `source` ở mục 4k, sau smoke-kiem-toan.sh (dùng
# hồ sơ $WEB_HS mà congdan01 nộp từ web và cán bộ, lãnh đạo xử lý tới hoàn tất ở smoke-can-bo.sh, hồ sơ
# thủ tục khai sinh $KS_ID, token lãnh đạo $KT_LD, mật khẩu $MK, hàm lay_token của smoke.sh). Kiểm:
#   nền tảng: step-ca chạy, ca-init cấp chứng thư rồi thoát 0, step-ca và Gotenberg không mở ra host;
#   E2E: hồ sơ vừa nộp có biên nhận PDF đã ký, hoàn tất có thông báo kết quả (phát hành nền ngay khi
#   nộp/hoàn tất); công dân tải đúng tệp qua link ngắn hạn (SHA-256 khớp CSDL); xác minh qua APISIX: hợp
#   lệ, toàn vẹn, tin cậy theo CA của xã, đúng giấy tờ đã phát hành; sửa 1 byte → không toàn vẹn;
#   quyền: công dân khác 404, hồ sơ chưa vào quy trình 409; nhật ký kiểm toán có giay_to.ky đúng SHA-256.
# Không in token hay khóa.

echo "== Giấy tờ có ký số (#77)"
KS_TD="$(mktemp -d)"

kiem "step-ca healthy, ca-init thoát 0" "healthy 0" \
  "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q step-ca)") $(docker inspect -f '{{.State.ExitCode}}' "$(docker compose ps -aq ca-init | head -1)")"
kiem "step-ca, Gotenberg không mở cổng ra host" "" \
  "$(docker port "$(docker compose ps -q step-ca)")$(docker port "$(docker compose ps -q gotenberg)")"
kiem "ca-init chạy lại: giữ chứng thư còn hạn" "có" \
  "$(docker compose run --rm --no-deps ca-init 2>&1 | grep -q 'giữ nguyên' && echo có || echo không)"

KS_CD="$(lay_token congdan01 "$MK" | jq -r '.access_token // empty')"
KS_CD2="$(lay_token congdan02 "$MK" | jq -r '.access_token // empty')"
[ -n "$KS_CD2" ] || { dat_mat_khau congdan02 "$MK"; KS_CD2="$(lay_token congdan02 "$MK" | jq -r '.access_token // empty')"; }
# ks_goi <token> <POST|GET> <đường dẫn> [tham số curl…] → mã HTTP; body ở $KS_TD/b
ks_goi() { local tk="$1" m="$2" d="$3"; shift 3; curl -s -o "$KS_TD/b" -w '%{http_code}' -X "$m" -H "Authorization: Bearer $tk" "$@" "$GW$d"; }

if [ -n "${WEB_HS:-}" ]; then
  # Phát hành nền ngay khi nộp và khi hoàn tất: chờ tối đa 30 giây.
  for _ in $(seq 1 30); do
    [ "$(sql "SELECT count(*) FROM mot_cua.giay_to_ky WHERE ho_so_id = '$WEB_HS'")" = 2 ] && break
    sleep 1
  done
  kiem "hồ sơ $WEB_HS: tự phát hành biên nhận (khi nộp) và kết quả (khi hoàn tất)" "bien_nhan,ket_qua" \
    "$(sql "SELECT string_agg(loai, ',' ORDER BY loai) FROM mot_cua.giay_to_ky WHERE ho_so_id = '$WEB_HS'")"
  KS_MA="$(sql "SELECT ma_ho_so FROM mot_cua.ho_so WHERE id = '$WEB_HS'")"

  kiem "công dân POST /files/ho-so/{id}/giay-to/bien_nhan → 200 (đã có), kèm link" "200 true" \
    "$(ks_goi "$KS_CD" POST "/files/ho-so/$WEB_HS/giay-to/bien_nhan") $(jq '.link | startswith("'"$GW"'/files/s3/")' "$KS_TD/b")"
  KS_SHA="$(jq -r .sha256 "$KS_TD/b")"
  kiem "tải biên nhận qua link ngắn hạn → 200 application/pdf" "200 application/pdf" \
    "$(curl -s -o "$KS_TD/bien-nhan.pdf" -w '%{http_code} %{content_type}' "$(jq -r .link "$KS_TD/b")")"
  kiem "PDF tải về đúng SHA-256 trong CSDL" "$(sql "SELECT sha256 FROM mot_cua.giay_to_ky WHERE ho_so_id = '$WEB_HS' AND loai = 'bien_nhan'") $KS_SHA" \
    "$(shasum -a 256 "$KS_TD/bien-nhan.pdf" | cut -d' ' -f1) $KS_SHA"
  kiem "biên nhận là PDF có chữ ký PAdES (SubFilter ETSI.CAdES.detached)" "%PDF- có" \
    "$(head -c 5 "$KS_TD/bien-nhan.pdf") $(grep -qa 'ETSI.CAdES.detached' "$KS_TD/bien-nhan.pdf" && echo có || echo không)"

  kiem "POST /files/xac-minh (công dân) → 200, hợp lệ, toàn vẹn, tin cậy, phủ toàn bộ" "200 true true true true" \
    "$(ks_goi "$KS_CD" POST /files/xac-minh -H 'Content-Type: application/pdf' --data-binary @"$KS_TD/bien-nhan.pdf") $(jq -r '[.hopLe, .toanVen, .tinCay, .phuToanBo] | map(tostring) | join(" ")' "$KS_TD/b")"
  kiem "xác minh: người ký là chứng thư của xã, đúng giấy tờ đã phát hành" "${DXOS_KY_SO_TEN:-UBND xã Mẫu – Bộ phận Một cửa} bien_nhan $KS_MA" \
    "$(jq -r '"\(.nguoiKy) \(.phatHanh.loai) \(.phatHanh.maHoSo)"' "$KS_TD/b")"

  python3 -c 'import sys
d = bytearray(open(sys.argv[1], "rb").read())
i = d.index(b"/MediaBox [0 0 ") + len(b"/MediaBox [0 0 ")
d[i] = ord("7") if d[i] != ord("7") else ord("8")
open(sys.argv[2], "wb").write(d)' "$KS_TD/bien-nhan.pdf" "$KS_TD/sua.pdf"
  kiem "PDF sửa 1 byte (khổ trang) → không hợp lệ, không toàn vẹn, không khớp giấy tờ đã phát hành" \
    "200 false false null Nội dung đã bị sửa sau khi ký" \
    "$(ks_goi "$KS_CD" POST /files/xac-minh -H 'Content-Type: application/pdf' --data-binary @"$KS_TD/sua.pdf") $(jq -r '"\(.hopLe) \(.toanVen) \(.phatHanh) \(.loi)"' "$KS_TD/b")"
  printf '%%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%%%EOF\n' > "$KS_TD/trong.pdf"
  kiem "PDF không chữ ký → không hợp lệ" "200 false false" \
    "$(ks_goi "$KS_CD" POST /files/xac-minh -H 'Content-Type: application/pdf' --data-binary @"$KS_TD/trong.pdf") $(jq -r '"\(.hopLe) \(.coChuKy)"' "$KS_TD/b")"
  kiem "xác minh sai Content-Type → 415" "415" \
    "$(ks_goi "$KS_CD" POST /files/xac-minh -H 'Content-Type: text/plain' --data-binary @"$KS_TD/trong.pdf")"

  kiem "lãnh đạo lấy thông báo kết quả → 200, xác minh hợp lệ, loại ket_qua" "200 true ket_qua" \
    "$(ks_goi "${KT_LD:?}" POST "/files/ho-so/$WEB_HS/giay-to/ket_qua") $(curl -s -o "$KS_TD/ket-qua.pdf" "$(jq -r .link "$KS_TD/b")"; ks_goi "$KS_CD" POST /files/xac-minh -H 'Content-Type: application/pdf' --data-binary @"$KS_TD/ket-qua.pdf" > /dev/null; jq -r '"\(.hopLe) \(.phatHanh.loai)"' "$KS_TD/b")"
  kiem "công dân khác lấy biên nhận của hồ sơ này → 404" "404" \
    "$(ks_goi "$KS_CD2" POST "/files/ho-so/$WEB_HS/giay-to/bien_nhan")"
  kiem "danh sách giấy tờ của hồ sơ (công dân) → 2" "200 2" \
    "$(ks_goi "$KS_CD" GET "/files/ho-so/$WEB_HS/giay-to") $(jq length "$KS_TD/b")"
  kiem "nhật ký kiểm toán: giay_to.ky của hồ sơ có đúng SHA-256 biên nhận" "1" \
    "$(sql "SELECT count(*) FROM mot_cua.nhat_ky_kiem_toan WHERE hanh_dong = 'giay_to.ky' AND doi_tuong_id = '$WEB_HS'
              AND du_lieu ->> 'loai' = 'bien_nhan' AND du_lieu ->> 'sha256' = '$KS_SHA'")"
fi
# Hồ sơ vừa tạo qua /api, chưa tải tệp, chưa khởi tạo quy trình: chưa được tiếp nhận.
KS_MOI="$(curl -s -H "Authorization: Bearer $KS_CD" -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
  -d "{\"thu_tuc_id\":\"${KS_ID:?}\",\"ho_ten_nguoi_nop\":\"Người Thử Ký Số\"}" "$GW/api/ho_so" | jq -r '.[0].id // empty')"
kiem "hồ sơ chưa vào quy trình: biên nhận → 409, kết quả → 409, không phát hành gì" "409 409 0" \
  "$(ks_goi "$KS_CD" POST "/files/ho-so/$KS_MOI/giay-to/bien_nhan") $(ks_goi "$KS_CD" POST "/files/ho-so/$KS_MOI/giay-to/ket_qua") $(sql "SELECT count(*) FROM mot_cua.giay_to_ky WHERE ho_so_id = '${KS_MOI:-00000000-0000-0000-0000-000000000000}'")"
kiem "sau khi phát hành: chuỗi kiểm toán vẫn hợp lệ" "true" \
  "$(ks_goi "${KT_LD:?}" GET /api/rpc/xac_minh_kiem_toan > /dev/null; jq -r .hopLe "$KS_TD/b")"

rm -rf "$KS_TD"

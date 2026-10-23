#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke nhật ký kiểm toán chuỗi băm (#75), được mot-cua/tests/smoke.sh `source` ở mục 4j, sau smoke-can-bo.sh
# (dùng hồ sơ $WEB_HS đã đi hết quy trình, token lãnh đạo $TK_LD_WEB nếu còn) và trước khi xóa người dùng
# tạm (dùng $U_CB, $U_LD, $MK, $OTP_CB, $OTP_LD, $TT_ID, hàm ma_totp, lay_token_otp của smoke.sh). Kiểm:
#   quyền qua APISIX: lãnh đạo đọc nhật ký và gọi /api/rpc/xac_minh_kiem_toan; công dân, cán bộ → 403,
#   không token → 401;
#   hồ sơ $WEB_HS nộp và xử lý qua API thật có đủ bản ghi kiểm toán (nộp, tải tệp, từng bước quy trình
#   với đúng người xử lý), mỗi bản ghi xử lý bước khớp một sự kiện trong hộp thư đi (cùng transaction);
#   8 công dân nộp hồ sơ ĐỒNG THỜI qua /api → 8 bản ghi ho_so.nop, stt không trùng, chuỗi vẫn hợp lệ;
#   trình xác minh độc lập mot-cua/backend/kiem_toan.py đọc qua API cho cùng kết quả với RPC, nhận mốc;
#   pgAudit ghi log đối tượng (AUDIT: OBJECT) cho các lần nộp đó mà không có dữ liệu cá nhân trong log.
# Không in mật khẩu, secret OTP hay token.

echo "== Nhật ký kiểm toán chuỗi băm (#75)"
KT_TD="$(mktemp -d)"

# kt_token_otp <username> <secret OTP> → access token; mã TOTP vừa dùng ở bước trước bị Keycloak từ
# chối dùng lại trong cùng 30 giây, nên thất bại thì chờ sang chu kỳ mã mới rồi thử lại một lần.
kt_token_otp() {
  local tk
  tk="$(lay_token_otp "$1" "$MK" "$(ma_totp "$2")" | jq -r '.access_token // empty')"
  if [ -z "$tk" ]; then
    sleep $((31 - $(date +%s) % 30))
    tk="$(lay_token_otp "$1" "$MK" "$(ma_totp "$2")" | jq -r '.access_token // empty')"
  fi
  echo "$tk"
}
KT_LD="$(kt_token_otp "${U_LD:?}" "${OTP_LD:?}")"
KT_CB="$(kt_token_otp "${U_CB:?}" "${OTP_CB:?}")"
KT_CD="$(lay_token congdan01 "$MK" | jq -r '.access_token // empty')"
kiem "token mới của lãnh đạo, cán bộ, công dân" "có có có" \
  "$([ -n "$KT_LD" ] && echo có || echo không) $([ -n "$KT_CB" ] && echo có || echo không) $([ -n "$KT_CD" ] && echo có || echo không)"

# kt_api <token> <đường dẫn> → mã HTTP; body ở $KT_TD/b
kt_api() { curl -s -o "$KT_TD/b" -w '%{http_code}' -H "Authorization: Bearer $1" "$GW$2"; }

# --- Quyền qua APISIX --------------------------------------------------------------------
kiem "lãnh đạo GET /api/rpc/xac_minh_kiem_toan → 200, chuỗi hợp lệ" "200 true" \
  "$(kt_api "$KT_LD" /api/rpc/xac_minh_kiem_toan) $(jq -r .hopLe "$KT_TD/b")"
kiem "xác minh: duyệt tới đầu chuỗi trong CSDL" "$(sql "SELECT stt FROM mot_cua.dau_chuoi_kiem_toan")" \
  "$(jq -r .sttCuoi "$KT_TD/b")"
kiem "lãnh đạo đọc /api/nhat_ky_kiem_toan → 200, có bản ghi" "200 true" \
  "$(kt_api "$KT_LD" '/api/nhat_ky_kiem_toan?order=stt.desc&limit=5') $(jq 'length > 0' "$KT_TD/b")"
kiem "công dân, cán bộ gọi xac_minh_kiem_toan → 403" "403 403" \
  "$(kt_api "$KT_CD" /api/rpc/xac_minh_kiem_toan) $(kt_api "$KT_CB" /api/rpc/xac_minh_kiem_toan)"
kiem "công dân, cán bộ đọc /api/nhat_ky_kiem_toan → 403" "403 403" \
  "$(kt_api "$KT_CD" /api/nhat_ky_kiem_toan) $(kt_api "$KT_CB" /api/nhat_ky_kiem_toan)"
kiem "không token: /api/rpc/xac_minh_kiem_toan → 401, /public → 401" "401 401" \
  "$(ma_http "$GW/api/rpc/xac_minh_kiem_toan") $(ma_http "$GW/public/rpc/xac_minh_kiem_toan")"
kiem "lãnh đạo POST thêm bản ghi /api/nhat_ky_kiem_toan → 403" "403" \
  "$(ma_http -H "Authorization: Bearer $KT_LD" -H 'Content-Type: application/json' -d '{"stt": 1}' "$GW/api/nhat_ky_kiem_toan")"

# --- Hồ sơ đi hết quy trình qua API thật có đủ dấu vết -------------------------------------------
if [ -n "${WEB_HS:-}" ]; then
  kiem "hồ sơ $WEB_HS: có ho_so.nop, tep.tai_len, quy_trinh.xu_ly_buoc, ho_so.chuyen_trang_thai" "4" \
    "$(sql "SELECT count(DISTINCT hanh_dong) FROM mot_cua.nhat_ky_kiem_toan WHERE doi_tuong_id = '$WEB_HS'
              AND hanh_dong IN ('ho_so.nop', 'tep.tai_len', 'quy_trinh.xu_ly_buoc', 'ho_so.chuyen_trang_thai')")"
  kiem "hồ sơ $WEB_HS: bước phe_duyet ghi người xử lý là lãnh đạo tạm" "$(jwt_payload "$KT_LD" | jq -r .sub)" \
    "$(sql "SELECT nguoi_sub FROM mot_cua.nhat_ky_kiem_toan WHERE doi_tuong_id = '$WEB_HS'
              AND hanh_dong = 'quy_trinh.xu_ly_buoc' AND du_lieu ->> 'buoc' = 'phe_duyet' ORDER BY stt DESC LIMIT 1")"
  kiem "hồ sơ $WEB_HS: mỗi sự kiện chuyển bước trong hộp thư đi có đúng một bản ghi kiểm toán" \
    "$(sql "SELECT count(*) FROM mot_cua.hop_thu_su_kien WHERE ho_so_id = '$WEB_HS' AND loai = 'ho_so.chuyen_buoc'")" \
    "$(sql "SELECT count(*) FROM mot_cua.nhat_ky_kiem_toan k, jsonb_array_elements(k.du_lieu -> 'suKien') e
              WHERE k.doi_tuong_id = '$WEB_HS' AND e ->> 'loai' = 'ho_so.chuyen_buoc'")"
  kiem "hồ sơ $WEB_HS: kiểm toán không chứa họ tên người nộp" "0" \
    "$(sql "SELECT count(*) FROM mot_cua.nhat_ky_kiem_toan k JOIN mot_cua.ho_so h ON h.id::text = k.doi_tuong_id
              WHERE h.id = '$WEB_HS' AND position(h.ho_ten_nguoi_nop IN k.du_lieu::text) > 0")"
fi

# --- 8 công dân nộp đồng thời qua /api ----------------------------------------------------------
KT_DAU="$(sql "SELECT stt FROM mot_cua.dau_chuoi_kiem_toan")"
KT_TEN="Kiểm Toán Đồng Thời $(openssl rand -hex 3)"
for i in 1 2 3 4 5 6 7 8; do
  curl -s -o "$KT_TD/nop-$i" -w '%{http_code}\n' -H "Authorization: Bearer $KT_CD" -H 'Content-Type: application/json' \
    -H 'Prefer: return=representation' -d "{\"thu_tuc_id\":\"$TT_ID\",\"ho_ten_nguoi_nop\":\"$KT_TEN $i\"}" \
    "$GW/api/ho_so" > "$KT_TD/ma-$i" &
done
wait
kiem "8 lần nộp đồng thời → 8 × 201" "201 201 201 201 201 201 201 201" "$(cat "$KT_TD"/ma-* | xargs)"
KT_IDS="$(jq -r '.[0].id' "$KT_TD"/nop-* | sed "s/.*/'&'/" | paste -sd, -)"
kiem "8 lần nộp đồng thời → 8 bản ghi ho_so.nop, stt không trùng, sau đầu chuỗi cũ" "8 8 true" \
  "$(sql "SELECT count(*) || ' ' || count(DISTINCT stt) || ' ' || bool_and(stt > $KT_DAU) FROM mot_cua.nhat_ky_kiem_toan
            WHERE hanh_dong = 'ho_so.nop' AND doi_tuong_id IN (${KT_IDS:-''})")"
kiem "sau khi ghi đồng thời: chuỗi hợp lệ (RPC qua APISIX)" "200 true" \
  "$(kt_api "$KT_LD" /api/rpc/xac_minh_kiem_toan) $(jq -r .hopLe "$KT_TD/b")"
KT_RPC="$(jq -c '{sttCuoi, bamCuoi}' "$KT_TD/b")"

# --- Trình xác minh độc lập (Python, đọc qua API) ---------------------------------------------
if DXOS_TOKEN="$KT_LD" PYTHONDONTWRITEBYTECODE=1 python3 mot-cua/backend/kiem_toan.py --api "$GW/api" > "$KT_TD/py" 2> "$KT_TD/py-loi"; then
  ma=0
else
  ma=$?
fi
kiem "kiem_toan.py --api: hợp lệ (mã thoát 0)" "0 true" "$ma $(jq -r .hopLe "$KT_TD/py" 2>/dev/null)"
kiem "kiem_toan.py và RPC xac_minh_kiem_toan cùng stt, bam cuối" "$KT_RPC" "$(jq -c '{sttCuoi, bamCuoi}' "$KT_TD/py" 2>/dev/null)"
KT_MOC="$(jq -r '"\(.sttCuoi):\(.bamCuoi)"' "$KT_TD/py" 2>/dev/null)"
kiem "kiem_toan.py nhận mốc đã lưu; mốc sai → mã thoát 1, moc_khong_khop" "0 1 moc_khong_khop" \
  "$(DXOS_TOKEN="$KT_LD" PYTHONDONTWRITEBYTECODE=1 python3 mot-cua/backend/kiem_toan.py --api "$GW/api" --moc "$KT_MOC" > /dev/null 2>&1; echo $?) $(DXOS_TOKEN="$KT_LD" PYTHONDONTWRITEBYTECODE=1 python3 mot-cua/backend/kiem_toan.py --api "$GW/api" --moc "${KT_MOC%%:*}:$(printf 'f%.0s' $(seq 64))" > "$KT_TD/py2" 2>/dev/null; echo $?) $(jq -r .loi.loai "$KT_TD/py2" 2>/dev/null)"
kiem "RPC nhận mốc qua query string (?p_stt_moc=…&p_bam_moc=…)" "200 true" \
  "$(kt_api "$KT_LD" "/api/rpc/xac_minh_kiem_toan?p_stt_moc=${KT_MOC%%:*}&p_bam_moc=${KT_MOC#*:}") $(jq -r .hopLe "$KT_TD/b")"

# --- pgAudit: log đối tượng cho bảng có dữ liệu cá nhân, không có giá trị trong log -------------------
# Log của container tới `docker compose logs` có độ trễ: chờ tới 10 giây cho dòng của lần nộp.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  KT_LOG="$(docker compose logs --no-log-prefix --since 10m postgres 2>&1)"
  grep -q 'AUDIT: OBJECT,[0-9]*,[0-9]*,WRITE,INSERT,TABLE,mot_cua.ho_so,' <<<"$KT_LOG" && break
  sleep 1
done
kiem "pgAudit: log có AUDIT: OBJECT …WRITE,INSERT,TABLE,mot_cua.ho_so (8 lần nộp)" "có" \
  "$(grep -q 'AUDIT: OBJECT,[0-9]*,[0-9]*,WRITE,INSERT,TABLE,mot_cua.ho_so,' <<<"$KT_LOG" && echo có || echo không)"
kiem "pgAudit: log không chứa họ tên vừa nộp (không ghi tham số)" "0" "$(grep -c "$KT_TEN" <<<"$KT_LOG")"

rm -rf "$KT_TD"

#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# make du-lieu-demo (#108): dựng dữ liệu GIẢ cho buổi trình bày 15 phút (docs/trinh-bay/kich-ban-demo.md) trên
# hệ thống đang chạy, chạy sau make up (tốt nhất make up-ai + make up-bi) và trước make demo-users:
#   1. ~96 hồ sơ ĐÃ ĐÓNG rải trong 4 tháng qua (4 thủ tục, ~1/6 trễ hạn, vài hồ sơ từ chối), mã HSDEMO-0001…,
#      để dashboard Superset có số liệu theo tháng. Ghi thẳng bằng SQL như seed (không có quy trình Flowable).
#   2. Một hồ sơ khai sinh nộp THẬT qua APISIX (congdan02), hạn dời về ngày làm việc kế tiếp → mot-cua-worker
#      phát ho_so.sap_tre_han → canbo01 có thông báo ở chuông cổng cán bộ.
#   3. Kho dữ liệu (Parquet → dbt → bao_cao) nếu đã bật profile bi.
# Chạy lại an toàn: hồ sơ HSDEMO-* không tạo trùng; mỗi lần chạy thêm một hồ sơ sắp trễ mới.
# Đặt mật khẩu ngẫu nhiên cho congdan02 (không in ra): chạy make demo-users SAU lệnh này.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Thiếu .env — chạy: cp .env.example .env"; exit 1; }
set -a
# shellcheck source=.env.example
. ./.env
set +a
export COMPOSE_PROFILES=core
# shellcheck source=scripts/lib-smoke.sh
. scripts/lib-smoke.sh
GW="${DXOS_GATEWAY_URL:-http://localhost:${APISIX_PORT:-9080}}"

[ "$(sql "SELECT count(*) FROM mot_cua.thu_tuc WHERE ma IN ('KS01','CT01','KH01','DD01') AND goi IS NOT NULL")" = 4 ] \
  || { echo "LỖI: chưa có đủ 4 gói KS01, CT01, KH01, DD01 — chạy make up (DXOS_SEED=true) trước"; exit 1; }

# --- 1. Hồ sơ lịch sử đã đóng ------------------------------------------------------------------
# Hạn tính bằng đúng hàm của bộ máy; hồ sơ đúng hạn đóng sau 30–90 % thời hạn, hồ sơ trễ đóng 1–3 ngày sau hạn.
sql "
WITH v AS (
  SELECT i,
         (ARRAY['KS01','CT01','KH01','DD01'])[1 + i % 4] AS ma_tt,
         (((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - (40 + (i * 37) % 85)) + make_interval(hours => 8 + i % 8))
           AT TIME ZONE 'Asia/Ho_Chi_Minh' AS nhan,
         (ARRAY['Nguyễn Thị Mẫu','Trần Văn Thử','Lê Thị Giả Định','Phạm Văn Ví Dụ','Hoàng Thị Minh Họa','Vũ Văn Dữ Liệu'])[1 + i % 6] AS ten
    FROM generate_series(1, 96) AS i
), h AS (
  SELECT v.*, t.id AS thu_tuc_id,
         mot_cua_noi_bo.cong_ngay_lam_viec((v.nhan AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, t.so_ngay_xu_ly) AS han
    FROM v JOIN mot_cua.thu_tuc t ON t.ma = v.ma_tt
)
INSERT INTO mot_cua.ho_so (ma_ho_so, thu_tuc_id, nguoi_nop_sub, ho_ten_nguoi_nop, so_dien_thoai,
                           trang_thai, ly_do, ngay_nhan, ngay_hoan_tat)
SELECT 'HSDEMO-' || lpad(i::text, 4, '0'), thu_tuc_id, '00000000-0000-0000-0000-00000000c002', ten,
       '09000001' || lpad((i % 100)::text, 2, '0'),
       CASE WHEN i % 11 = 0 THEN 'tu_choi' ELSE 'hoan_tat' END,
       CASE WHEN i % 11 = 0 THEN 'Hồ sơ mẫu giả: không đủ điều kiện' END,
       nhan,
       least(now() - interval '1 hour',
             CASE WHEN i % 6 = 0 THEN (han + make_interval(days => 1 + i % 3, hours => 10)) AT TIME ZONE 'Asia/Ho_Chi_Minh'
                  ELSE nhan + ((han + time '16:30') AT TIME ZONE 'Asia/Ho_Chi_Minh' - nhan) * (0.3 + (i % 7) / 10.0) END)
  FROM h
ON CONFLICT (ma_ho_so) DO NOTHING" > /dev/null
echo "  hồ sơ lịch sử giả: $(sql "SELECT count(*) || ' (trễ hạn ' || count(*) FILTER (WHERE (ngay_hoan_tat AT TIME ZONE 'Asia/Ho_Chi_Minh')::date > han_xu_ly) || ')' FROM mot_cua.ho_so WHERE ma_ho_so LIKE 'HSDEMO-%'")"

# --- 2. Hồ sơ sắp trễ hạn, có thông báo tới cán bộ hộ tịch --------------------------------------
MK="demo-$(od -An -N9 -tx1 /dev/urandom | tr -d ' \n')"
dat_mat_khau congdan02 "$MK"
TK="$(lay_token congdan02 "$MK" | jq -r '.access_token // empty')"
[ -n "$TK" ] || { echo "LỖI: không lấy được token congdan02"; exit 1; }
KS="$(sql "SELECT id FROM mot_cua.thu_tuc WHERE ma = 'KS01'")"
TD="$(mktemp -d)"; trap 'rm -rf "$TD"' EXIT
# PDF tối thiểu (trang trắng) làm giấy tờ mẫu giả.
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%%%EOF\n' > "$TD/giay-to.pdf"
HS="$(curl -s -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
  -d "{\"thu_tuc_id\":\"$KS\",\"ho_ten_nguoi_nop\":\"Đỗ Thị Sắp Trễ\",\"so_dien_thoai\":\"0900000108\"}" \
  "$GW/api/ho_so?select=id,ma_ho_so" | jq -r '.[0].id // empty')"
[ -n "$HS" ] || { echo "LỖI: không tạo được hồ sơ qua /api/ho_so"; exit 1; }
curl -s "$GW/public/thanh_phan_yeu_cau?thu_tuc_id=eq.$KS&bat_buoc=is.true&select=id" | jq -r '.[].id' | while read -r yc; do
  curl -s -o /dev/null -H "Authorization: Bearer $TK" -H 'Content-Type: application/pdf' \
    --data-binary "@$TD/giay-to.pdf" "$GW/files/ho-so/$HS/tep?ten=giay-to.pdf&thanh_phan_yeu_cau_id=$yc"
done
QT="$(curl -s -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' -d '{}' "$GW/workflow/ho-so/$HS/khoi-tao" | jq -r '.quyTrinh // empty')"
[ -n "$QT" ] || { echo "LỖI: không khởi tạo được quy trình cho hồ sơ sắp trễ"; exit 1; }
MA="$(sql "UPDATE mot_cua.ho_so SET han_xu_ly = mot_cua_noi_bo.cong_ngay_lam_viec((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1, 0)
           WHERE id = '$HS' RETURNING ma_ho_so || ' hạn ' || to_char(han_xu_ly, 'DD/MM/YYYY')" | head -1)"
echo "  hồ sơ sắp trễ hạn: $MA (quy trình $QT)"
cho="${DXOS_SU_KIEN_QUET_GIAY:-300}"
for _ in $(seq 1 $(( (cho + 60) / 5 ))); do
  n="$(sql "SELECT count(*) FROM mot_cua.thong_bao tb JOIN mot_cua.can_bo cb ON cb.id = tb.can_bo_id
             WHERE tb.ho_so_id = '$HS' AND cb.sub = '00000000-0000-0000-0000-00000000b001'")"
  [ "$n" -ge 1 ] && break
  sleep 5
done
if [ "${n:-0}" -ge 1 ]; then echo "  canbo01 đã có thông báo sắp trễ hạn"; else
  echo "  CHÚ Ý: chưa thấy thông báo cho canbo01 sau $((cho + 60)) giây (mot-cua-worker quét mỗi DXOS_SU_KIEN_QUET_GIAY=$cho giây)"; fi

# --- 3. Kho dữ liệu cho Superset ---------------------------------------------------------------
if docker compose --profile core --profile bi ps --status running --services 2>/dev/null | grep -qx superset; then
  docker compose --profile core --profile bi run --rm --build --no-deps kho-du-lieu > "$TD/kho.log" 2>&1 \
    || { tail -20 "$TD/kho.log"; echo "LỖI: make kho-du-lieu"; exit 1; }
  echo "  kho dữ liệu: đã nạp bao_cao ($(sql "SELECT count(*) FROM bao_cao.fct_ho_so") hồ sơ đã đóng) cho Superset"
else
  echo "  chưa bật profile bi: chạy make up-bi rồi make kho-du-lieu để dashboard có số liệu"
fi
echo "Xong. Tiếp theo: make demo-users (mật khẩu chung), cài OTP cho canbo01, lanhdao01 trên điện thoại."

#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke sự kiện hồ sơ qua RabbitMQ (#9). Được mot-cua/tests/smoke.sh `source` sau mục 4d
# (dùng kiem, sql, gw, gw_ma, task_cua, lay_token, lay_token_otp, ma_totp, MK, U_CB, OTP_CB, CB_ID,
# LV_HT, KS_ID, WH, WMA, SUB), không chạy riêng.
# Kiểm:
#   1. Topology của ứng dụng đã khai báo trong vhost mot-cua (queue quorum + queue lỗi).
#   2. Hồ sơ WH vừa đi hết quy trình qua /workflow ở mục 4d: ho_so.moi, 5 × ho_so.chuyen_buoc,
#      ho_so.hoan_tat đã vào hộp thư đi, đã phát (RabbitMQ xác nhận) và consumer mẫu đã nhận
#      từ queue (nhat_ky_su_kien); định dạng phiên bản 1, không có dữ liệu cá nhân.
#   3. Nhánh từ chối → ho_so.tu_choi.
#   4. Sắp trễ hạn: đẩy hạn một hồ sơ về ngày làm việc kế tiếp → quét → ho_so.sap_tre_han đúng
#      MỘT lần dù quét lại nhiều lần.
#   5. Tin sai định dạng → consumer NACK → queue lỗi (dead-letter), không ghi nhật ký.
#   6. RabbitMQ dừng: request vẫn thành công, sự kiện chờ trong hộp thư; broker lên lại thì
#      được phát và nhận đúng một lần.

echo "== Sự kiện hồ sơ qua RabbitMQ (#9)"
# Token mới (token cũ có thể sắp hết 5 phút) và phân công hộ tịch cho cán bộ tạm (smoke-tep bỏ đi).
# Keycloak không cho dùng lại mã TOTP: chờ sang khung 30 giây mới so với lần lấy ở mục 4c.
sleep $((30 - $(date +%s) % 30 + 1))
TOKEN="$(lay_token congdan01 "$MK" | jq -r '.access_token // empty')"
r="$(lay_token_otp "$U_CB" "$MK" "$(ma_totp "$OTP_CB")")"
kiem "lấy lại token cán bộ tạm (mật khẩu + TOTP)" "có" "$(jq -r 'if .access_token then "có" else (.error_description // .error) end' <<<"$r")"
TK_CB="$(jq -r '.access_token // empty' <<<"$r")"
sql "INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES ('$CB_ID', '$LV_HT') ON CONFLICT DO NOTHING" > /dev/null
VH="$DXOS_TANG2"
rmq() { docker compose exec -T rabbitmq rabbitmqctl -q "$@"; }
# so_tin <queue> → số tin đang nằm trong queue (sẵn sàng + chưa ACK)
so_tin() { rmq list_queues -p "$VH" name messages --formatter json | jq -r --arg q "$1" '.[] | select(.name == $q) | .messages'; }
# cho_sql <mong đợi> <câu SQL> → kết quả SQL, chờ tối đa 30 giây cho tới khi bằng mong đợi
cho_sql() {
  local kq=""
  for _ in $(seq 1 30); do kq="$(sql "$2")"; [ "$kq" = "$1" ] && break; sleep 1; done
  printf '%s' "$kq"
}
# dem_loai <hồ sơ id> → "loại:số" của nhật ký sự kiện (consumer đã nhận), sắp theo tên loại
dem_loai() { printf "SELECT string_agg(loai || ':' || n, ' ' ORDER BY loai) FROM (SELECT loai, count(*) n FROM mot_cua.nhat_ky_su_kien WHERE ho_so_id = '%s' GROUP BY loai) x" "$1"; }

# --- 1. Topology --------------------------------------------------------------------------
kiem "vhost $VH có queue mot_cua.nhat_ky (quorum) và mot_cua.nhat_ky.loi" "mot_cua.nhat_ky:quorum mot_cua.nhat_ky.loi:classic" \
  "$(rmq list_queues -p "$VH" name type --formatter json | jq -r 'sort_by(.name) | map("\(.name):\(.type)") | join(" ")')"
kiem "exchange mot_cua.su_kien kiểu topic, bền vững" "topic true" \
  "$(rmq list_exchanges -p "$VH" name type durable --formatter json | jq -r '.[] | select(.name == "mot_cua.su_kien") | "\(.type) \(.durable)"')"
LOI_TRUOC="$(so_tin mot_cua.nhat_ky.loi)"

# --- 2. Hồ sơ WH (mục 4d): mới → chuyển bước → hoàn tất ------------------------------------
kiem "WH $WMA: consumer nhận ho_so.moi, 5 chuyen_buoc, hoan_tat" "ho_so.chuyen_buoc:5 ho_so.hoan_tat:1 ho_so.moi:1" \
  "$(cho_sql "ho_so.chuyen_buoc:5 ho_so.hoan_tat:1 ho_so.moi:1" "$(dem_loai "$WH")")"
kiem "WH: 7 sự kiện trong hộp thư đi, tất cả đã phát (RabbitMQ xác nhận)" "7 7" \
  "$(sql "SELECT count(*) || ' ' || count(da_phat_luc) FROM mot_cua.hop_thu_su_kien WHERE ho_so_id = '$WH'")"
kiem "WH: mỗi sự kiện phát đi đúng một lần tới consumer (id khớp hộp thư)" "7" \
  "$(sql "SELECT count(*) FROM mot_cua.hop_thu_su_kien h JOIN mot_cua.nhat_ky_su_kien n ON n.su_kien_id = h.id WHERE h.ho_so_id = '$WH'")"
ev="$(sql "SELECT noi_dung FROM mot_cua.nhat_ky_su_kien WHERE ho_so_id = '$WH' AND loai = 'ho_so.moi'")"
kiem "ho_so.moi: phienBan 1, mã hồ sơ, lĩnh vực ho_tich, thủ tục KS01, bước tiep_nhan" "1 $WMA ho_tich KS01 tiep_nhan" \
  "$(jq -r '"\(.phienBan) \(.maHoSo) \(.linhVuc) \(.thuTuc) \(.duLieu.buocDangMo | join(","))"' <<<"$ev")"
kiem "ho_so.moi: có id uuid, thời điểm giờ Việt Nam" "có +07:00" \
  "$(jq -r '"\(if (.id | test("^[0-9a-f-]{36}$")) then "có" else "không" end) \(.luc[-6:])"' <<<"$ev")"
kiem "chuyển bước theo đúng thứ tự tiep_nhan→bo_sung→tiep_nhan→tham_dinh→phe_duyet" \
  "tiep_nhan>bo_sung bo_sung>tiep_nhan tiep_nhan>tham_dinh tham_dinh>phe_duyet phe_duyet>" \
  "$(sql "SELECT string_agg((noi_dung->'duLieu'->>'tuBuoc') || '>' || coalesce(noi_dung->'duLieu'->'denBuoc'->>0, ''), ' ' ORDER BY tao_luc, id)
          FROM mot_cua.hop_thu_su_kien WHERE ho_so_id = '$WH' AND loai = 'ho_so.chuyen_buoc'")"
kiem "bước bổ sung do công dân hoàn thành: vaiTroXuLy cong_dan" "cong_dan" \
  "$(sql "SELECT noi_dung->'duLieu'->>'vaiTroXuLy' FROM mot_cua.hop_thu_su_kien WHERE ho_so_id = '$WH' AND noi_dung->'duLieu'->>'tuBuoc' = 'bo_sung'")"
kiem "ho_so.hoan_tat: ketQua hoan_tat, điểm kết thúc ket_thuc_hoan_tat" "hoan_tat ket_thuc_hoan_tat" \
  "$(sql "SELECT noi_dung->'duLieu'->>'ketQua' || ' ' || (noi_dung->'duLieu'->>'diemKetThuc') FROM mot_cua.nhat_ky_su_kien WHERE ho_so_id = '$WH' AND loai = 'ho_so.hoan_tat'")"
kiem "sự kiện không chứa dữ liệu cá nhân (họ tên, số điện thoại, sub người nộp)" "0" \
  "$(sql "SELECT count(*) FROM mot_cua.hop_thu_su_kien WHERE ho_so_id = '$WH'
          AND (noi_dung::text LIKE '%Người Thử Workflow%' OR noi_dung::text LIKE '%0900000098%' OR noi_dung::text LIKE '%$SUB%')")"

# --- 3. Nhánh từ chối ---------------------------------------------------------------------
r="$(nop_du "$TOKEN" "{\"thu_tuc_id\":\"$KS_ID\",\"ho_ten_nguoi_nop\":\"Người Thử Sự Kiện\"}")"
HTC="$(jq -r '.hoSo.id // empty' <<<"$r")"
gw "$TK_CB" "/tasks/$(task_cua "$TK_CB" "$HTC" tiep_nhan)/complete" '{"bien":{"hopLe":true}}' > /dev/null
gw "$TK_CB" "/tasks/$(task_cua "$TK_CB" "$HTC" tham_dinh)/complete" '{"bien":{"datYeuCau":false,"ghiChu":"không đạt"}}' > /dev/null
kiem "thẩm định không đạt qua /workflow → consumer nhận ho_so.tu_choi" "ho_so.chuyen_buoc:2 ho_so.moi:1 ho_so.tu_choi:1" \
  "$(cho_sql "ho_so.chuyen_buoc:2 ho_so.moi:1 ho_so.tu_choi:1" "$(dem_loai "${HTC:-00000000-0000-0000-0000-000000000000}")")"

# --- 4. Sắp trễ hạn: đúng một lần -----------------------------------------------------------
r="$(nop_du "$TOKEN" "{\"thu_tuc_id\":\"$KS_ID\",\"ho_ten_nguoi_nop\":\"Người Thử Sắp Trễ\"}")"
HST="$(jq -r '.hoSo.id // empty' <<<"$r")"; HST="${HST:-00000000-0000-0000-0000-000000000000}"
# Hạn = ngày làm việc kế tiếp (giờ Việt Nam): còn đúng 1 ngày làm việc.
HAN_MOI="$(sql "UPDATE mot_cua.ho_so SET han_xu_ly = mot_cua_noi_bo.cong_ngay_lam_viec((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1, 0)
                WHERE id = '$HST' RETURNING han_xu_ly" | head -1)"
quet() { docker compose exec -T mot-cua-worker python /mot-cua/backend/worker.py quet-mot-lan 2>/dev/null | tail -1; }
q1="$(quet)" || q1=lỗi; q2="$(quet)" || q2=lỗi; q3="$(quet)" || q3=lỗi
kiem "quét lần 1 tạo cảnh báo; lần 2, 3 không tạo thêm" "có 0 0" "$([ "${q1:-0}" -ge 1 ] 2>/dev/null && echo có || echo "không($q1)") $q2 $q3"
kiem "hồ sơ hạn $HAN_MOI: đúng 1 ho_so.sap_tre_han trong hộp thư đi" "1" \
  "$(sql "SELECT count(*) FROM mot_cua.hop_thu_su_kien WHERE ho_so_id = '$HST' AND loai = 'ho_so.sap_tre_han'")"
kiem "consumer nhận ho_so.sap_tre_han đúng 1 lần, còn 1 ngày làm việc, khóa theo hạn" "1 1 $HAN_MOI" \
  "$(cho_sql "1 1 $HAN_MOI" "SELECT count(*) || ' ' || min(noi_dung->'duLieu'->>'conLaiNgayLamViec') || ' ' || min(noi_dung->'duLieu'->>'hanXuLy')
                             FROM mot_cua.nhat_ky_su_kien WHERE ho_so_id = '$HST' AND loai = 'ho_so.sap_tre_han'")"
kiem "ghi trùng khóa chống trùng bị CSDL bỏ qua (ON CONFLICT DO NOTHING)" "0" \
  "$(sql "INSERT INTO mot_cua.hop_thu_su_kien (id, loai, ho_so_id, khoa_chong_trung, noi_dung)
          SELECT m.u, loai, ho_so_id, khoa_chong_trung, jsonb_set(noi_dung, '{id}', to_jsonb(m.u::text))
            FROM mot_cua.hop_thu_su_kien, (SELECT gen_random_uuid() AS u) m
           WHERE ho_so_id = '$HST' AND loai = 'ho_so.sap_tre_han' ON CONFLICT (khoa_chong_trung) DO NOTHING RETURNING 1" | grep -c 1 || true)"
HQH="$(sql "SELECT id FROM mot_cua.ho_so WHERE id <> '$HST' AND han_xu_ly < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date LIMIT 1")"
if [ -n "$HQH" ]; then
  kiem "hồ sơ đã quá hạn không nhận cảnh báo sắp trễ hạn" "0" \
    "$(sql "SELECT count(*) FROM mot_cua.hop_thu_su_kien WHERE ho_so_id = '$HQH' AND loai = 'ho_so.sap_tre_han'")"
fi

# --- 5. Tin sai định dạng → queue lỗi -----------------------------------------------------------
# Phát bằng chính user ứng dụng (thông tin kết nối đọc từ OpenBao trong container mot-cua-worker).
docker compose exec -T mot-cua-worker python -c 'import sys; sys.path.insert(0, "/mot-cua/backend")
import worker
k = worker.rabbitmq(); k.phat("/exchange/mot_cua.su_kien/ho_so.moi", "{\"loai\": \"ho_so.moi\"}"); k.dong()'
kiem "tin sai định dạng → consumer NACK → queue lỗi mot_cua.nhat_ky.loi (+1)" "$((LOI_TRUOC + 1))" \
  "$(for _ in $(seq 1 20); do n="$(so_tin mot_cua.nhat_ky.loi)"; [ "$n" = "$((LOI_TRUOC + 1))" ] && break; sleep 1; done; echo "$n")"
rmq purge_queue -p "$VH" mot_cua.nhat_ky.loi > /dev/null

# --- 6. RabbitMQ dừng: sự kiện chờ trong hộp thư, phát khi broker lên lại ------------------------
# Mọi lệnh ở đây không được làm smoke dừng giữa chừng (set -e) khi broker đang tắt.
docker compose stop rabbitmq > /dev/null 2>&1 || true
TID="$(task_cua "$TK_CB" "$HST" tiep_nhan)" || TID=""
kiem "RabbitMQ dừng: cán bộ vẫn hoàn thành task (sự kiện vào hộp thư đi)" "200" \
  "$(gw_ma "$TK_CB" "/tasks/$TID/complete" '{"bien":{"hopLe":true}}')"
sleep 3
kiem "RabbitMQ dừng: ho_so.chuyen_buoc chờ trong hộp thư, chưa phát" "1 0" \
  "$(sql "SELECT count(*) || ' ' || count(da_phat_luc) FROM mot_cua.hop_thu_su_kien WHERE ho_so_id = '$HST' AND loai = 'ho_so.chuyen_buoc'")"
docker compose start rabbitmq > /dev/null 2>&1 || true
kiem "RabbitMQ lên lại: sự kiện được phát và consumer nhận đúng 1 lần" "1 1" \
  "$(for _ in $(seq 1 60); do kq="$(sql "SELECT (SELECT count(da_phat_luc) FROM mot_cua.hop_thu_su_kien WHERE ho_so_id = '$HST' AND loai = 'ho_so.chuyen_buoc') || ' ' ||
                                         (SELECT count(*) FROM mot_cua.nhat_ky_su_kien WHERE ho_so_id = '$HST' AND loai = 'ho_so.chuyen_buoc')")"
     [ "$kq" = "1 1" ] && break; sleep 2; done; echo "$kq")"
kiem "queue mot_cua.nhat_ky trống sau khi consumer xử lý xong" "0" "$(so_tin mot_cua.nhat_ky)"
kiem "hộp thư đi: không còn sự kiện nào chưa phát" "0" \
  "$(cho_sql 0 "SELECT count(*) FROM mot_cua.hop_thu_su_kien WHERE da_phat_luc IS NULL")"

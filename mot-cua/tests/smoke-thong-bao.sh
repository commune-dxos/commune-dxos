#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke thông báo sắp trễ hạn tới cán bộ (#56). Được mot-cua/tests/smoke.sh `source` ngay sau
# tests/smoke-su-kien.sh (dùng kiem, sql, ma_http, lay_token, lay_token_otp, ma_totp, MK, U_CB, OTP_CB, CB_ID,
# LV_HT, GW, HST, VH, rmq, so_tin, cho_sql), không chạy riêng.
# Kiểm:
#   1. Topology: queue mot_cua.thong_bao (quorum, dead-letter) nhận ho_so.sap_tre_han.
#   2. Hồ sơ HST (cảnh báo sắp trễ ở smoke-su-kien mục 4): consumer thông báo ghi mỗi cán bộ phụ trách
#      hộ tịch đúng một thông báo, kênh email/SMS chỉ giả lập; không có dữ liệu cá nhân người nộp.
#   3. Qua APISIX /api: cán bộ chỉ thấy thông báo của mình, chỉ đánh dấu được đã đọc; công dân bị chặn.
#   4. Luồng SSE /workflow/thong-bao/luong qua APISIX: sự kiện đầu đúng số chưa đọc; đánh dấu đã đọc
#      trong lúc luồng mở → luồng đẩy số mới; công dân → 403, không token → 401.
#   5. Phát lại cùng sự kiện → không thêm thông báo; tin sai định dạng → queue lỗi mot_cua.thong_bao.loi.

echo "== Thông báo sắp trễ hạn tới cán bộ (#56)"
sleep $((30 - $(date +%s) % 30 + 1))  # mã TOTP mới (Keycloak không cho dùng lại mã cũ)
TK_CB="$(lay_token_otp "$U_CB" "$MK" "$(ma_totp "$OTP_CB")" | jq -r '.access_token // empty')"
TK_CD="$(lay_token congdan01 "$MK" | jq -r '.access_token // empty')"
A_TB=(-H "Authorization: Bearer $TK_CB" -H 'Content-Type: application/json')
TB_TD="$(mktemp -d)"

# --- 1. Topology --------------------------------------------------------------------------
kiem "vhost $VH có queue mot_cua.thong_bao (quorum, dead-letter mot_cua.thong_bao.loi) và mot_cua.thong_bao.loi" \
  "quorum mot_cua.thong_bao.loi classic" \
  "$(rmq list_queues -p "$VH" name type arguments --formatter json | jq -r '
     (.[] | select(.name == "mot_cua.thong_bao")
      | "\(.type) \(.arguments | if type == "array" then map({(.[0]): .[-1]}) | add else . end | .["x-dead-letter-exchange"])"),
     (.[] | select(.name == "mot_cua.thong_bao.loi") | .type)' | paste -sd' ' -)"
kiem "binding mot_cua.su_kien → mot_cua.thong_bao chỉ khóa ho_so.sap_tre_han" "ho_so.sap_tre_han" \
  "$(rmq list_bindings -p "$VH" source_name destination_name routing_key --formatter json |
     jq -r '[.[] | select(.source_name == "mot_cua.su_kien" and .destination_name == "mot_cua.thong_bao") | .routing_key] | join(",")')"

# --- 2. Consumer thông báo ghi cho cán bộ phụ trách ----------------------------------------
SO_CB_HT="$(sql "SELECT count(*) FROM mot_cua.can_bo c JOIN mot_cua.can_bo_linh_vuc l ON l.can_bo_id = c.id
                 WHERE l.linh_vuc_id = '$LV_HT' AND c.dang_lam_viec")"
kiem "HST: mỗi cán bộ hộ tịch đang làm việc ($SO_CB_HT người) đúng 1 thông báo sắp trễ hạn" "$SO_CB_HT $SO_CB_HT" \
  "$(cho_sql "$SO_CB_HT $SO_CB_HT" "SELECT count(*) || ' ' || count(DISTINCT can_bo_id) FROM mot_cua.thong_bao WHERE ho_so_id = '$HST'")"
kiem "thông báo trỏ về đúng sự kiện ho_so.sap_tre_han trong hộp thư đi, mốc = hạn xử lý" "có" \
  "$(sql "SELECT CASE WHEN bool_and(t.su_kien_id = h.id AND t.moc = s.han_xu_ly) THEN 'có' ELSE 'không' END
            FROM mot_cua.thong_bao t JOIN mot_cua.ho_so s ON s.id = t.ho_so_id
            JOIN mot_cua.hop_thu_su_kien h ON h.ho_so_id = t.ho_so_id AND h.loai = 'ho_so.sap_tre_han'
           WHERE t.ho_so_id = '$HST'")"
kiem "kênh email, sms ghi trạng thái giả lập (không gửi thật)" "email:gia_lap sms:gia_lap" \
  "$(sql "SELECT string_agg(k.kenh || ':' || k.trang_thai, ' ' ORDER BY k.kenh) FROM mot_cua.thong_bao_kenh k
            JOIN mot_cua.thong_bao t ON t.id = k.thong_bao_id WHERE t.ho_so_id = '$HST' AND t.can_bo_id = '$CB_ID'")"

# --- 3. Qua APISIX /api: RLS và quyền cột --------------------------------------------------
curl -s "${A_TB[@]}" "$GW/api/thong_bao?select=id,can_bo_id,ho_so_id,tieu_de,noi_dung,da_doc_luc,thong_bao_kenh(kenh,trang_thai)&order=tao_luc.desc" > "$TB_TD/ds"
kiem "cán bộ tạm qua /api/thong_bao chỉ thấy thông báo của mình (RLS)" \
  "$(sql "SELECT count(*) FROM mot_cua.thong_bao WHERE can_bo_id = '$CB_ID'") true" \
  "$(jq -r --arg c "$CB_ID" '"\(length) \(all(.[]; .can_bo_id == $c))"' "$TB_TD/ds")"
MA_HST="$(sql "SELECT ma_ho_so FROM mot_cua.ho_so WHERE id = '$HST'")"
TB_HST="$(jq -r --arg h "$HST" '[.[] | select(.ho_so_id == $h)][0].id // empty' "$TB_TD/ds")"
kiem "thông báo HST: tiêu đề có mã hồ sơ, nội dung có hạn, kèm 2 kênh giả lập, chưa đọc" \
  "Hồ sơ $MA_HST sắp trễ hạn|có hạn|2|null" \
  "$(jq -r --arg h "$HST" '[.[] | select(.ho_so_id == $h)][0] |
     "\(.tieu_de)|\(if (.noi_dung | test("hạn 17:00")) then "có hạn" else .noi_dung end)|\(.thong_bao_kenh | length)|\(.da_doc_luc)"' "$TB_TD/ds")"
# grep không -q: đọc hết log, tránh SIGPIPE làm `docker compose logs` lỗi dưới pipefail.
kiem "worker ghi log giả lập gửi email, sms cho $MA_HST (không gửi ra ngoài)" "2" \
  "$({ docker compose logs --since 30m mot-cua-worker 2>/dev/null || true; } | grep -c "giả lập gửi [a-z]*: [0-9]* thông báo hồ sơ $MA_HST" || true)"
kiem "thông báo không chứa họ tên người nộp" "0" \
  "$(sql "SELECT count(*) FROM mot_cua.thong_bao WHERE ho_so_id = '$HST' AND (tieu_de || noi_dung) LIKE '%Người Thử Sắp Trễ%'")"
kiem "công dân đọc /api/thong_bao → 403" "403" \
  "$(ma_http -H "Authorization: Bearer $TK_CD" "$GW/api/thong_bao")"
kiem "cán bộ sửa tiêu đề thông báo → 403 (chỉ được đánh dấu đã đọc)" "403" \
  "$(ma_http -X PATCH "${A_TB[@]}" -d '{"tieu_de":"x"}' "$GW/api/thong_bao?id=eq.${TB_HST:-00000000-0000-0000-0000-000000000000}")"
TB_KHAC="$(sql "SELECT id FROM mot_cua.thong_bao WHERE can_bo_id <> '$CB_ID' AND da_doc_luc IS NULL LIMIT 1")"
if [ -n "$TB_KHAC" ]; then
  curl -s -o /dev/null -X PATCH "${A_TB[@]}" -d '{"da_doc_luc":"2026-01-01T00:00:00Z"}' "$GW/api/thong_bao?id=eq.$TB_KHAC"
  kiem "cán bộ đánh dấu đã đọc thông báo của người khác → không đổi (RLS)" "" \
    "$(sql "SELECT da_doc_luc FROM mot_cua.thong_bao WHERE id = '$TB_KHAC'")"
fi

# --- 4. Luồng SSE qua APISIX ---------------------------------------------------------------
CHUA_DOC="$(sql "SELECT count(*) FROM mot_cua.thong_bao WHERE can_bo_id = '$CB_ID' AND da_doc_luc IS NULL")"
# Mở luồng 10 giây ở nền; giữa chừng đánh dấu đã đọc thông báo HST → luồng phải đẩy số chưa đọc mới.
curl -s -N --max-time 10 -D "$TB_TD/h" -H "Authorization: Bearer $TK_CB" "$GW/workflow/thong-bao/luong" > "$TB_TD/sse" || true &
PID_SSE=$!
sleep 3
kiem "cán bộ đánh dấu đã đọc qua PATCH /api/thong_bao → 204, CSDL tự đặt giờ đọc" "204 có" \
  "$(ma_http -X PATCH "${A_TB[@]}" -d '{"da_doc_luc":"2000-01-01T00:00:00Z"}' "$GW/api/thong_bao?id=eq.${TB_HST:-00000000-0000-0000-0000-000000000000}&da_doc_luc=is.null") $(
     sql "SELECT CASE WHEN da_doc_luc > now() - interval '1 minute' THEN 'có' ELSE da_doc_luc::text END FROM mot_cua.thong_bao WHERE id = '${TB_HST:-00000000-0000-0000-0000-000000000000}'")"
wait "$PID_SSE" 2>/dev/null || true
kiem "luồng SSE qua APISIX: 200, Content-Type text/event-stream" "200 text/event-stream" \
  "$(awk 'NR == 1 {c = $2} tolower($1) == "content-type:" {split($2, t, ";"); ct = t[1]} END {print c, ct}' "$TB_TD/h" | tr -d '\r')"
kiem "luồng SSE: sự kiện đầu = $CHUA_DOC chưa đọc, sau khi đọc đẩy $((CHUA_DOC - 1))" "$CHUA_DOC $((CHUA_DOC - 1))" \
  "$(grep -A1 '^event: thong-bao' "$TB_TD/sse" | sed -n 's/^data: //p' | jq -r .chuaDoc | paste -sd' ' -)"
kiem "luồng SSE: công dân → 403, không token → 401" "403 401" \
  "$(ma_http --max-time 5 -H "Authorization: Bearer $TK_CD" "$GW/workflow/thong-bao/luong") $(ma_http --max-time 5 "$GW/workflow/thong-bao/luong")"

# --- 5. Phát lại cùng sự kiện, tin hỏng ----------------------------------------------------
LOI_TB="$(so_tin mot_cua.thong_bao.loi)"; LOI_NK="$(so_tin mot_cua.nhat_ky.loi)"
sql "SELECT noi_dung FROM mot_cua.hop_thu_su_kien WHERE ho_so_id = '$HST' AND loai = 'ho_so.sap_tre_han'" > "$TB_TD/ev"
gioi_han 60 docker compose exec -T mot-cua-worker python -c 'import sys; sys.path.insert(0, "/mot-cua/backend")
import worker
k = worker.rabbitmq(); k.phat("/exchange/mot_cua.su_kien/ho_so.sap_tre_han", sys.stdin.read().strip())
k.phat("/exchange/mot_cua.su_kien/ho_so.sap_tre_han", "{\"loai\": \"ho_so.sap_tre_han\"}"); k.dong()' < "$TB_TD/ev"
kiem "tin sai định dạng → consumer thông báo NACK → mot_cua.thong_bao.loi (+1)" "$((LOI_TB + 1))" \
  "$(for _ in $(seq 1 20); do n="$(so_tin mot_cua.thong_bao.loi)"; [ "$n" = "$((LOI_TB + 1))" ] && break; sleep 1; done; echo "$n")"
kiem "phát lại cùng sự kiện: queue thông báo xử lý xong, không thêm thông báo" "0 $SO_CB_HT" \
  "$(for _ in $(seq 1 20); do n="$(so_tin mot_cua.thong_bao)"; [ "$n" = 0 ] && break; sleep 1; done; echo "$n") $(
     sql "SELECT count(*) FROM mot_cua.thong_bao WHERE ho_so_id = '$HST'")"
for _ in $(seq 1 20); do [ "$(so_tin mot_cua.nhat_ky.loi)" -gt "$LOI_NK" ] && break; sleep 1; done
rmq purge_queue -p "$VH" mot_cua.thong_bao.loi > /dev/null || true
rmq purge_queue -p "$VH" mot_cua.nhat_ky.loi > /dev/null || true
rm -rf "$TB_TD"

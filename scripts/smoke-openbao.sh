#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Smoke OpenBao (#10), được scripts/smoke.sh `source` (dùng kiem, cong_host, FLOWABLE_ADMIN_PASSWORD).
#   - két đã khởi tạo, đã unseal; tệp unseal key trên máy quyền 600 và bị git bỏ qua;
#   - policy: mỗi danh tính chỉ đọc/ghi đúng phần của mình (đăng nhập bằng AppRole thật của
#     dịch vụ, core/openbao/kiem-quyen.py), ứng dụng không đọc được nhánh của ứng dụng khác;
#   - không còn mật khẩu nào trong cấu hình container (docker inspect) hay .env.example;
#   - nhật ký kiểm toán có ghi, không chứa bí mật dạng rõ; bao-init chạy lại không đổi gì.
# Không in giá trị bí mật.

echo "== OpenBao (#10)"
kiem "OpenBao đã khởi tạo, không seal" "true false" \
  "$(docker compose exec -T openbao bao status -format=json 2>/dev/null | jq -r '"\(.initialized) \(.sealed)"')"
tep_init="${BAO_INIT_DIR:-./.data/openbao}/${COMPOSE_PROJECT_NAME:-commune}.json"
kiem "tệp unseal key + root token trên máy, quyền 600" "600" \
  "$(python3 -c 'import os, sys; print(oct(os.stat(sys.argv[1]).st_mode)[-3:])' "$tep_init" 2>/dev/null || echo thieu)"
kiem "tệp unseal key bị git bỏ qua (.gitignore)" "có" "$(git check-ignore -q "$tep_init" && echo có || echo không)"

# Ma trận quyền: <danh tính>:<read|write>:<đường dẫn KV> → mã mong đợi.
# read 200 = đọc được, 403 = bị chặn; write 400 = policy cho ghi (cas chặn), 403 = bị chặn.
A="apps/$DXOS_APP"
MA_TRAN=(
  "db:read:core/db/postgres 200"
  "db:read:core/keycloak/admin 403"
  "db:read:core/garage 403"
  "postgrest:read:core/db/authenticator 200"
  "postgrest:read:core/db/postgres 403"
  "postgrest:read:core/db/keycloak 403"
  "keycloak:read:core/keycloak/admin 200"
  "keycloak:read:core/db/flowable 403"
  "keycloak:write:core/keycloak/admin 403"
  "flowable:read:core/flowable/rest-admin 200"
  "flowable:read:core/db/keycloak 403"
  "garage:read:core/garage 200"
  "garage:read:$A/s3 403"
  "garage-init:read:$A/s3 200"
  "garage-init:write:$A/s3 400"
  "garage-init:read:core/db/postgres 403"
  "garage-init:write:core/garage 403"
  "app-realm:read:core/keycloak/admin 200"
  "app-realm:read:$A/s3 403"
  "app-realm:write:core/keycloak/admin 403"
  "app:read:$A/s3 200"
  "app:read:core/flowable/rest-admin 200"
  "app:read:core/db/postgres 403"
  "app:read:core/keycloak/admin 403"
  "app:read:core/garage 403"
  "app:write:$A/s3 403"
  "app:read:apps/ung-dung-khac/s3 403"
  "app:read:$A/rabbitmq 200"
  "app:read:core/rabbitmq/admin 403"
  "app:write:$A/rabbitmq 403"
  "rabbitmq:read:core/rabbitmq/admin 200"
  "rabbitmq:read:core/garage 403"
  "rabbitmq:read:$A/rabbitmq 403"
  "rabbitmq-init:read:core/rabbitmq/admin 200"
  "rabbitmq-init:write:$A/rabbitmq 400"
  "rabbitmq-init:write:core/rabbitmq/admin 403"
  "rabbitmq-init:read:core/db/postgres 403"
  "rabbitmq-init:read:$A/s3 403"
)
muc=(); for m in "${MA_TRAN[@]}"; do muc+=("${m% *}"); done
kq="$(docker compose run --rm --no-deps --entrypoint python bao-init /core/openbao/kiem-quyen.py "${muc[@]}" 2>&1)"
for m in "${MA_TRAN[@]}"; do
  kiem "policy ${m% *} → ${m##* }" "${m##* }" "$(awk -v k="${m% *}" '$1 == k {print $2}' <<<"$kq")"
done

# Không còn mật khẩu/secret/token dạng giá trị trong biến môi trường của container
# (cho phép *_FILE, *_URL và giá trị "@/đường dẫn tệp" như PGRST_JWT_SECRET=@/jwks/jwks.json là
# khóa CÔNG KHAI). bao-init chỉ nhận biến LEGACY_* khi .env cũ còn mật khẩu.
for svc in postgres keycloak postgrest flowable app-backend app-realm garage-init db-init app-migrate \
           rabbitmq rabbitmq-init app-worker; do
  id="$(docker compose ps -aq "$svc" | head -1)"
  kiem "$svc: không có mật khẩu/secret trong biến môi trường" "0" \
    "$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$id" \
       | grep -E '^[A-Z0-9_]*(PASSWORD|SECRET|TOKEN)[A-Z0-9_]*=' | grep -vcE '_(FILE|URL)=|=@/' || true)"
done
kiem ".env.example không có biến mật khẩu" "0" \
  "$(grep -cE '^[A-Z0-9_]*(PASSWORD|SECRET|TOKEN)[A-Z0-9_]*=' .env.example || true)"
kiem "tệp bí mật agent render: quyền 0400" "400" \
  "$(docker compose exec -T keycloak stat -c %a /run/dxos-secrets/admin_password)"

# Nhật ký kiểm toán: có ghi lượt đọc bí mật, và giá trị bí mật được băm (không ghi rõ).
nk="$(docker compose logs --no-log-prefix openbao 2>/dev/null)"
kiem "nhật ký kiểm toán ghi lượt đọc dxos/data/core/flowable/rest-admin" "có" \
  "$(grep -q '"path":"dxos/data/core/flowable/rest-admin"' <<<"$nk" && echo có || echo không)"
kiem "nhật ký kiểm toán không chứa mật khẩu rest-admin dạng rõ" "0" \
  "$(grep -cF -- "$FLOWABLE_ADMIN_PASSWORD" <<<"$nk" || true)"

# bao-init chạy lại: không sinh bí mật mới, không cấp secret_id mới.
if out="$(docker compose run --rm --no-deps bao-init 2>&1)"; then ma=0; else ma=$?; fi
kiem "bao-init lần 2: mã thoát" "0" "$ma"
kiem "bao-init lần 2: không đổi bí mật, không cấp secret_id mới" "0" "$(grep -cE '←|secret_id mới|đã (khởi tạo|bật)' <<<"$out" || true)"

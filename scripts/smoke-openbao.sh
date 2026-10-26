#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke OpenBao (#10), được scripts/smoke.sh `source` (dùng kiem, cong_host, FLOWABLE_ADMIN_PASSWORD).
#   - két đã khởi tạo, đã unseal; tệp unseal key trên máy quyền 600 và bị git bỏ qua;
#   - policy: mỗi danh tính chỉ đọc/ghi đúng phần của mình (đăng nhập bằng AppRole thật của
#     dịch vụ, nen-tang/openbao/kiem-quyen.py), Tầng 2 không đọc được nhánh của dịch vụ Tầng 2 khác;
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
A="tang2/$DXOS_TANG2"
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
  "tang2-realm:read:core/keycloak/admin 200"
  "tang2-realm:read:$A/s3 403"
  "tang2-realm:write:core/keycloak/admin 403"
  "tang2:read:$A/s3 200"
  "tang2:read:core/flowable/rest-admin 200"
  "tang2:read:core/db/postgres 403"
  "tang2:read:core/keycloak/admin 403"
  "tang2:read:core/garage 403"
  "tang2:write:$A/s3 403"
  "tang2:read:tang2/dich-vu-khac/s3 403"
  "tang2:read:$A/rabbitmq 200"
  "tang2:read:core/rabbitmq/admin 403"
  "tang2:write:$A/rabbitmq 403"
  "rabbitmq:read:core/rabbitmq/admin 200"
  "rabbitmq:read:core/garage 403"
  "rabbitmq:read:$A/rabbitmq 403"
  "rabbitmq-init:read:core/rabbitmq/admin 200"
  "rabbitmq-init:write:$A/rabbitmq 400"
  "rabbitmq-init:write:core/rabbitmq/admin 403"
  "rabbitmq-init:read:core/db/postgres 403"
  "rabbitmq-init:read:$A/s3 403"
  "step-ca:read:core/step-ca/ca 200"
  "step-ca:read:core/step-ca/provisioner 200"
  "step-ca:read:$A/ky-so 403"
  "step-ca:write:core/step-ca/ca 403"
  "ca-init:read:core/step-ca/provisioner 200"
  "ca-init:read:core/step-ca/ca 403"
  "ca-init:write:$A/ky-so 400"
  "ca-init:read:$A/s3 403"
  "tang2:read:$A/ky-so 200"
  "tang2:write:$A/ky-so 403"
  "tang2:read:core/step-ca/provisioner 403"
  "superset:read:core/superset 200"
  "superset:read:core/db/superset 200"
  "superset:read:core/db/bao_cao_doc 200"
  "superset:read:core/db/postgres 403"
  "superset:read:core/db/authenticator 403"
  "superset:read:$A/s3 403"
  "superset:write:core/superset 403"
  "tang2:read:core/superset 403"
  "meilisearch:read:core/meilisearch 200"
  "meilisearch:read:$A/meilisearch 403"
  "meilisearch:write:core/meilisearch 403"
  "meili-init:read:core/meilisearch 200"
  "meili-init:write:$A/meilisearch 400"
  "meili-init:read:core/db/postgres 403"
  "meili-init:read:$A/s3 403"
  "tang2:read:$A/meilisearch 200"
  "tang2:read:core/meilisearch 403"
  "tang2:write:$A/meilisearch 403"
)
muc=(); for m in "${MA_TRAN[@]}"; do muc+=("${m% *}"); done
kq="$(docker compose run --rm --no-deps --entrypoint python bao-init /nen-tang/openbao/kiem-quyen.py "${muc[@]}" 2>&1)"
for m in "${MA_TRAN[@]}"; do
  kiem "policy ${m% *} → ${m##* }" "${m##* }" "$(awk -v k="${m% *}" '$1 == k {print $2}' <<<"$kq")"
done

# Không còn mật khẩu/secret/token dạng giá trị trong biến môi trường của container
# (cho phép *_FILE, *_URL và giá trị "@/đường dẫn tệp" như PGRST_JWT_SECRET=@/jwks/jwks.json là
# khóa CÔNG KHAI). bao-init chỉ nhận biến LEGACY_* khi .env cũ còn mật khẩu.
for svc in postgres keycloak postgrest flowable mot-cua-api tang2-realm garage-init db-init tang2-migrate \
           rabbitmq rabbitmq-init mot-cua-worker step-ca ca-init gotenberg meilisearch meili-init nap-tri-thuc tro-ly; do
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

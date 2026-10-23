# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Cổng công dân trong compose (#57): dịch vụ mot-cua-web, APISIX phục vụ ở route / (cổng 9080).
# Hai tầng: node build bản tĩnh theo lockfile → nginx không đặc quyền (uid 101) chỉ phục vụ tệp.
# Không có bí mật nào trong image (client OIDC public + PKCE). Địa chỉ Keycloak nhận lúc chạy:
# entrypoint của nginx thay biến DXOS_* vào nginx/*.template, sinh /cau-hinh.js và CSP; gateway
# là chính origin của trang (đường dẫn tương đối /public, /api, /files, /workflow).

FROM node:22.23.4-alpine3.24 AS build
WORKDIR /web
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24
COPY --from=build /web/dist /usr/share/nginx/html
COPY nginx/ /etc/nginx/templates/
# Image gốc đã chạy bằng user nginx (uid 101), nghe cổng 8080; ghi lại cho rõ.
USER 101
EXPOSE 8080

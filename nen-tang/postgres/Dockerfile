# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# PostgreSQL của nền tảng = image gốc postgres:17.6-alpine + pgAudit 17.1 (PostgreSQL License,
# https://github.com/pgaudit/pgaudit), #75 + pgvector 0.8.7 (PostgreSQL License,
# https://github.com/pgvector/pgvector), #91. Image gốc không có hai extension này và Alpine không
# đóng gói chúng cho bản PostgreSQL tự biên dịch của image, nên biên dịch mã nguồn đã ghim (kiểm
# SHA-256) ở bước riêng rồi chỉ chép thư viện + tệp extension sang image gốc: không sửa PostgreSQL,
# không để lại công cụ biên dịch. pgAudit bật bằng tham số khởi động trong docker-compose.yml (dịch
# vụ postgres); pgvector là extension thường, dịch vụ Tầng 2 cần thì CREATE EXTENSION vector.
ARG POSTGRES_IMAGE=postgres:17.6-alpine

FROM ${POSTGRES_IMAGE} AS bien-dich
ARG PGAUDIT_VERSION=17.1
ARG PGAUDIT_SHA256=9c5f37504d393486cc75d2ced83f75f5899be64fa85f689d6babb833b4361e6c
# Header máy chủ PostgreSQL kéo theo header OpenSSL, GSSAPI, ICU.
RUN apk add --no-cache build-base curl icu-dev krb5-dev openssl-dev
RUN curl -fsSL -o /tmp/pgaudit.tar.gz "https://github.com/pgaudit/pgaudit/archive/refs/tags/${PGAUDIT_VERSION}.tar.gz" \
    && echo "${PGAUDIT_SHA256}  /tmp/pgaudit.tar.gz" | sha256sum -c - \
    && mkdir /tmp/pgaudit && tar -xzf /tmp/pgaudit.tar.gz -C /tmp/pgaudit --strip-components=1 \
    # with_llvm=no: không sinh bitcode JIT (cần clang), pgAudit không cần JIT.
    && make -C /tmp/pgaudit USE_PGXS=1 with_llvm=no \
    && make -C /tmp/pgaudit USE_PGXS=1 with_llvm=no install DESTDIR=/out \
    && install -Dm644 /tmp/pgaudit/LICENSE /out/usr/local/share/doc/pgaudit/LICENSE
ARG PGVECTOR_VERSION=0.8.7
ARG PGVECTOR_SHA256=cac0b10c360f05b2d521200105ba3697e773d4cd3731f5a915a7e37ebe0bea85
RUN curl -fsSL -o /tmp/pgvector.tar.gz "https://github.com/pgvector/pgvector/archive/refs/tags/v${PGVECTOR_VERSION}.tar.gz" \
    && echo "${PGVECTOR_SHA256}  /tmp/pgvector.tar.gz" | sha256sum -c - \
    && mkdir /tmp/pgvector && tar -xzf /tmp/pgvector.tar.gz -C /tmp/pgvector --strip-components=1 \
    # OPTFLAGS rỗng: không tối ưu theo CPU của máy build (-march=native), image chạy được trên máy khác.
    && make -C /tmp/pgvector USE_PGXS=1 with_llvm=no OPTFLAGS="" \
    && make -C /tmp/pgvector USE_PGXS=1 with_llvm=no OPTFLAGS="" install DESTDIR=/out \
    && install -Dm644 /tmp/pgvector/LICENSE /out/usr/local/share/doc/pgvector/LICENSE

FROM ${POSTGRES_IMAGE}
COPY --from=bien-dich /out/usr/local/ /usr/local/

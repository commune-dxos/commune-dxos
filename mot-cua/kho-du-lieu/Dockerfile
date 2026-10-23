# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Image của dịch vụ một lần kho-du-lieu (#80): python gốc bản slim (Debian: DuckDB có wheel dựng sẵn,
# Alpine/musl thì không chắc) + duckdb, dbt-core, dbt-duckdb ghim trong requirements.txt. Mã nguồn
# KHÔNG chép vào image: compose mount ./mot-cua chỉ đọc, sửa chay.py hay model dbt không cần build lại.
FROM python:3.13.16-slim-bookworm
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --no-compile --only-binary=:all: -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt
ENV DBT_SEND_ANONYMOUS_USAGE_STATS=false \
    PYTHONDONTWRITEBYTECODE=1

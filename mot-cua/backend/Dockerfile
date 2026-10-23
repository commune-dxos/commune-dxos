# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Image của mot-cua-api: python gốc + thư viện trong requirements.txt (jsonschema cho Poka-yoke
# phía máy chủ, #59). Mã nguồn KHÔNG chép vào image: compose mount ./mot-cua chỉ đọc như trước,
# nên sửa main.py chỉ cần khởi động lại dịch vụ; đổi requirements.txt thì `make up` build lại.
FROM python:3.13.16-alpine3.24
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --no-compile --only-binary=:all: -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

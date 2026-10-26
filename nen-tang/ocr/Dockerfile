# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Image của dịch vụ OCR (#93, profile ai): python gốc bản slim (Debian: PaddlePaddle và PyTorch có wheel dựng sẵn
# cho glibc, cả amd64 và arm64) + PaddleOCR, PaddlePaddle, VietOCR, PyTorch bản CPU. Không sửa mã thư viện nào.
# Trọng số mô hình KHÔNG nằm trong image: may_doc.py tải lúc chạy vào volume /models (kiểm SHA-256).
FROM python:3.13.16-slim-bookworm
# OpenCV (paddlex kéo theo) cần libGL, glib; PaddlePaddle cần OpenMP.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
# PyTorch từ chỉ mục CPU chính thức: bản trên PyPI cho amd64 kéo theo thư viện CUDA vài GB không dùng tới.
RUN pip install --no-cache-dir --no-compile --index-url https://download.pytorch.org/whl/cpu \
      torch==2.14.1 torchvision==0.29.1
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --no-compile --only-binary=:all: -r /tmp/requirements.txt \
    && pip install --no-cache-dir --no-compile --no-deps vietocr==0.3.13 \
    && rm /tmp/requirements.txt
COPY may_doc.py /nen-tang/ocr/may_doc.py
# Volume /models nhận chủ sở hữu từ thư mục này khi tạo lần đầu: dịch vụ chạy user không đặc quyền vẫn ghi được.
RUN mkdir -p /models/home && chown -R 1000:1000 /models
# Mô hình PaddleX ở volume; không kiểm "nguồn mô hình nhanh nhất" (gọi ra ngoài mỗi lần khởi động); không gửi gì
# về máy chủ của Paddle ngoài việc tải mô hình lần đầu.
ENV OCR_THU_MUC_MO_HINH=/models \
    PADDLE_PDX_CACHE_HOME=/models/paddlex \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    HF_HUB_DISABLE_TELEMETRY=1 \
    HOME=/models/home \
    PYTHONDONTWRITEBYTECODE=1
USER 1000:1000
EXPOSE 8000
CMD ["python", "-u", "/nen-tang/ocr/may_doc.py"]

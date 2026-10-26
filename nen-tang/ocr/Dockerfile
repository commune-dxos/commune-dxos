# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Image của dịch vụ OCR (#93, profile ai). Ba stage, chỉ stage cuối thành image chạy thật:
#   xuat-mo-hinh  tải PP-OCRv5_mobile_det (ONNX của RapidOCR) và trọng số VietOCR vgg_transformer, kiểm SHA-256,
#                 xuất VietOCR sang ONNX bằng PyTorch CPU (xuat_mo_hinh.py). Chạy trên kiến trúc của máy build
#                 ($BUILDPLATFORM): tệp ONNX không phụ thuộc kiến trúc.
#   opencv        biên dịch OpenCV 4.10.0 (Apache-2.0) từ mã nguồn đã kiểm SHA-256, chỉ core + imgproc + python3,
#                 tắt FFmpeg, OpenSSL, Intel IPP/ippicv, ITT, OpenCL, KleidiCV và mọi bộ đọc ảnh: wheel
#                 opencv-python(-headless) trên PyPI kèm OpenSSL 1.1 (giấy phép OpenSSL/SSLeay) và bản amd64 liên kết
#                 tĩnh Intel IPP ICV, đều không OSI. Kết quả là một tệp cv2*.so (thư viện tĩnh gộp vào).
#   image cuối    python slim + onnxruntime, numpy, pillow (requirements.txt) + cv2 tự biên dịch + tệp .onnx. Không có
#                 PyTorch, PaddlePaddle, VietOCR, trình biên dịch hay mã nào khác của hai stage trên.
# Trọng số không nằm trong repo: tải lúc build, ghim SHA-256 (xuat_mo_hinh.py), nguồn và giấy phép ở
# DEPENDENCIES.md mục 4. Không sửa mã thư viện nào.
FROM --platform=$BUILDPLATFORM python:3.13.16-slim-bookworm AS moi-truong-xuat
# PyTorch từ chỉ mục CPU chính thức (bản PyPI cho amd64 kéo theo thư viện CUDA vài GB không dùng tới).
RUN pip install --no-cache-dir --no-compile --index-url https://download.pytorch.org/whl/cpu \
      torch==2.14.1 torchvision==0.29.1
COPY requirements-xuat.txt /tmp/requirements-xuat.txt
RUN pip install --no-cache-dir --no-compile --only-binary=:all: -r /tmp/requirements-xuat.txt \
    && pip install --no-cache-dir --no-compile --no-deps vietocr==0.3.13

FROM moi-truong-xuat AS xuat-mo-hinh
ENV ORT_DISABLE_TELEMETRY=1
COPY xuat_mo_hinh.py /xuat/xuat_mo_hinh.py
RUN python /xuat/xuat_mo_hinh.py /mo-hinh

FROM python:3.13.16-slim-bookworm AS opencv
ARG OPENCV_PHIEN_BAN=4.10.0
ARG OPENCV_SHA256=b2171af5be6b26f7a06b1229948bbb2bdaa74fcf5cd097e0af6378fce50a6eb9
RUN apt-get update \
    && apt-get install -y --no-install-recommends cmake g++ make \
    && rm -rf /var/lib/apt/lists/*
# numpy cùng phiên bản với image cuối: cv2 biên dịch theo header của nó.
RUN pip install --no-cache-dir --no-compile --only-binary=:all: numpy==2.3.5
RUN python -c "import hashlib, sys, urllib.request; \
d = urllib.request.urlopen('https://github.com/opencv/opencv/archive/refs/tags/${OPENCV_PHIEN_BAN}.tar.gz', timeout=600).read(); \
h = hashlib.sha256(d).hexdigest(); \
sys.exit(f'opencv: SHA-256 {h} khác bản đã kiểm') if h != '${OPENCV_SHA256}' else open('/tmp/opencv.tar.gz', 'wb').write(d)" \
    && mkdir /src && tar -xzf /tmp/opencv.tar.gz -C /src --strip-components=1 && rm /tmp/opencv.tar.gz
# Cờ CMake ghi lại ở DEPENDENCIES.md mục 3. BUILD_SHARED_LIBS=OFF: core, imgproc, zlib gộp vào một module cv2.
# Carotene (NVIDIA, BSD-3-Clause, trong mã nguồn OpenCV) giữ mặc định trên arm64, như wheel PyPI.
RUN cmake -S /src -B /build \
      -D CMAKE_BUILD_TYPE=Release \
      -D BUILD_LIST=core,imgproc,python3 \
      -D BUILD_SHARED_LIBS=OFF \
      -D BUILD_opencv_python3=ON \
      -D PYTHON3_EXECUTABLE=/usr/local/bin/python \
      -D OPENCV_PYTHON3_INSTALL_PATH=/opt/cv2 \
      -D OPENCV_SKIP_PYTHON_LOADER=ON \
      -D BUILD_ZLIB=ON \
      -D WITH_FFMPEG=OFF -D WITH_GSTREAMER=OFF -D WITH_V4L=OFF -D WITH_1394=OFF \
      -D WITH_IPP=OFF -D BUILD_IPP_IW=OFF -D WITH_ITT=OFF -D WITH_KLEIDICV=OFF \
      -D WITH_OPENCL=OFF -D WITH_VA=OFF -D WITH_VA_INTEL=OFF -D WITH_OPENVX=OFF \
      -D WITH_LAPACK=OFF -D WITH_EIGEN=OFF -D WITH_TBB=OFF -D WITH_OPENMP=OFF -D WITH_PROTOBUF=OFF \
      -D WITH_FLATBUFFERS=OFF -D WITH_ADE=OFF -D WITH_QUIRC=OFF \
      -D WITH_GTK=OFF -D WITH_QT=OFF -D WITH_OPENGL=OFF \
      -D WITH_JPEG=OFF -D WITH_PNG=OFF -D WITH_SPNG=OFF -D WITH_TIFF=OFF -D WITH_WEBP=OFF -D WITH_OPENJPEG=OFF \
      -D WITH_JASPER=OFF -D WITH_OPENEXR=OFF -D WITH_IMGCODEC_HDR=OFF -D WITH_IMGCODEC_SUNRASTER=OFF \
      -D WITH_IMGCODEC_PXM=OFF -D WITH_IMGCODEC_PFM=OFF \
      -D BUILD_TESTS=OFF -D BUILD_PERF_TESTS=OFF -D BUILD_EXAMPLES=OFF -D BUILD_DOCS=OFF -D BUILD_JAVA=OFF \
      -D BUILD_opencv_apps=OFF -D INSTALL_PYTHON_EXAMPLES=OFF -D OPENCV_GENERATE_PKGCONFIG=OFF \
    && cmake --build /build -j"$(nproc)" \
    && cmake --install /build > /dev/null \
    && mkdir -p /opt/cv2-doc \
    && cp /src/LICENSE /opt/cv2-doc/LICENSE \
    && cp /src/3rdparty/zlib/LICENSE /opt/cv2-doc/LICENSE.zlib \
    && PYTHONPATH=/opt/cv2 python -c "import cv2; print(cv2.getBuildInformation())" > /opt/cv2-doc/build-info.txt \
    && ! grep -iE 'ippicv|Intel IPP|ittnotify|openssl|kleidicv|FFMPEG:[[:space:]]+YES|OpenCL:[[:space:]]+YES' \
         /opt/cv2-doc/build-info.txt \
    && ls -la /opt/cv2

FROM python:3.13.16-slim-bookworm
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --no-compile --only-binary=:all: -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt
COPY --from=opencv /opt/cv2/ /usr/local/lib/python3.13/site-packages/
COPY --from=opencv /opt/cv2-doc/ /usr/local/share/doc/opencv/
COPY --from=xuat-mo-hinh /mo-hinh /nen-tang/ocr/mo-hinh
COPY may_doc.py /nen-tang/ocr/may_doc.py
# ORT_DISABLE_TELEMETRY: ONNX Runtime bản Linux có mô-đun gửi số liệu sử dụng (1DS); biến này tắt ngay lúc import.
ENV OCR_THU_MUC_MO_HINH=/nen-tang/ocr/mo-hinh \
    ORT_DISABLE_TELEMETRY=1 \
    PYTHONDONTWRITEBYTECODE=1
USER 1000:1000
EXPOSE 8000
CMD ["python", "-u", "/nen-tang/ocr/may_doc.py"]

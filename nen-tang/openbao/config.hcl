# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# OpenBao (MPL-2.0) – két sắt bí mật của lõi Tầng 1 (#10). Dịch vụ riêng, image gốc
# openbao/openbao, không sửa mã (D-004, NOTICE). Chế độ server thường, KHÔNG dùng -dev.
# Khởi tạo, unseal, policy, AppRole: nen-tang/openbao/bao-init.py (make bao-init).
# Thiết kế: docs/architecture.md §4.4.

# Headless: không bật web UI. Quản trị bằng CLI `bao` trong container hoặc HTTP API.
ui = false

# Container không có quyền IPC_LOCK; bộ nhớ không bị khóa thì có thể bị swap ra đĩa.
# Raft khuyến nghị tắt mlock. Triển khai thật: tắt swap trên máy chủ.
disable_mlock = true

# Integrated storage (raft) một nút: dữ liệu mã hóa bằng khóa gốc, nằm trong volume
# bao-data (/openbao/file, thư mục image đã cấp cho user openbao). Thêm nút sau này
# bằng retry_join mà không đổi storage; có `bao operator raft snapshot` để sao lưu.
storage "raft" {
  path    = "/openbao/file"
  node_id = "dxos-bao-1"
}

# Chỉ nghe trong mạng nội bộ Docker (không publish cổng ra host, không qua APISIX).
# TLS tắt cho máy local; triển khai thật bật TLS (tls_cert_file, tls_key_file) bằng
# chứng thư từ step-ca của lõi.
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}

api_addr     = "http://openbao:8200"
cluster_addr = "http://openbao:8201"

# Nhật ký kiểm toán: mọi request/response (ai đọc bí mật nào, lúc nào) ra stdout của
# container (`docker compose logs openbao`). Giá trị bí mật và token được băm HMAC, không
# ghi rõ. OpenBao chỉ cho khai báo audit device trong tệp cấu hình, không qua API.
audit "file" "stdout" {
  description = "Nhật ký kiểm toán ra stdout"
  options {
    file_path = "/dev/stdout"
  }
}

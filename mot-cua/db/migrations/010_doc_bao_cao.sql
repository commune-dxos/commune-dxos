-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Bộ máy một cửa – quyền đọc báo cáo cho Superset (#82).
-- nen-tang/scripts/tang2-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- Lõi (db-init) tạo role đăng nhập `bao_cao_doc` cho Superset với mật khẩu từ OpenBao nhưng không cấp
-- quyền đọc gì; bộ máy quyết định role đó đọc được gì: CHỈ schema bao_cao (bảng mart đã khử định danh
-- do kho dữ liệu #80 nạp). Không USAGE trên mot_cua, không ghi, không gọi RPC. Role được tạo NOLOGIN ở
-- đây nếu migration chạy trước db-init (volume mới); db-init chạy sau sẽ bật LOGIN và đặt mật khẩu.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bao_cao_doc') THEN
    CREATE ROLE bao_cao_doc NOLOGIN;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA bao_cao TO bao_cao_doc;
GRANT SELECT ON bao_cao.fct_ho_so, bao_cao.hieu_suat_thang, bao_cao.lan_nap TO bao_cao_doc;
-- Bảng mart thêm sau trong schema này (migration mới) cũng đọc được.
ALTER DEFAULT PRIVILEGES IN SCHEMA bao_cao GRANT SELECT ON TABLES TO bao_cao_doc;
COMMENT ON SCHEMA bao_cao IS 'Bảng mart của kho dữ liệu (#80), khử định danh, nạp bằng RPC mot_cua.nap_bao_cao; Superset đọc bằng role bao_cao_doc (#82). Không có dữ liệu cá nhân';

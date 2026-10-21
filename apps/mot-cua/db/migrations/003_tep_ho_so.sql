-- SPDX-License-Identifier: Apache-2.0
-- Ứng dụng mot-cua – tệp thành phần hồ sơ trên Garage, quét ClamAV trước khi lưu (#7).
-- core/scripts/app-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- Từ migration này, metadata tệp chỉ được ghi qua API tệp (APISIX /files → app-backend):
-- backend kiểm quyền của người dùng (token của họ, RLS), quét ClamAV, lưu Garage rồi mới
-- ghi dòng thanh_phan_ho_so bằng tài khoản dịch vụ `dich_vu_tep` (client Keycloak
-- mot_cua_tep). Công dân không còn tự INSERT metadata qua /api, nên không ai khai được
-- object_key, sha256 hay kết quả quét giả.

-- 1. Role dịch vụ ----------------------------------------------------------------
-- Trùng tên client role `dich_vu_tep` của dxos_api (apps/mot-cua/keycloak/realm.json),
-- chỉ gán cho service account của client mot_cua_tep, không gán cho người.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dich_vu_tep') THEN
    CREATE ROLE dich_vu_tep NOLOGIN;
  END IF;
END
$$;
GRANT dich_vu_tep TO authenticator;

-- 2. Cột kết quả lưu trữ và quét -------------------------------------------------------
ALTER TABLE mot_cua.thanh_phan_ho_so
  ADD COLUMN nguoi_tai_sub text,
  ADD COLUMN ket_qua_quet  text CHECK (ket_qua_quet = 'sach'),
  ADD COLUMN may_quet      text,
  ADD COLUMN quet_luc      timestamptz,
  -- Có tệp trên Garage thì phải có đủ dấu vết: ai tải, sha256, đã quét sạch.
  ADD CONSTRAINT thanh_phan_ho_so_co_tep_da_quet CHECK (
    object_key IS NULL
    OR (nguoi_tai_sub IS NOT NULL AND sha256 IS NOT NULL AND ket_qua_quet IS NOT NULL AND quet_luc IS NOT NULL)),
  -- Khóa object nằm dưới tiền tố của chính hồ sơ: không trỏ được sang tệp của hồ sơ khác.
  ADD CONSTRAINT thanh_phan_ho_so_object_key_cua_ho_so CHECK (
    object_key IS NULL OR object_key LIKE 'ho-so/' || ho_so_id::text || '/%');
COMMENT ON COLUMN mot_cua.thanh_phan_ho_so.object_key IS 'Khóa object trong bucket mot-cua-ho-so (Garage), dạng ho-so/<ho_so_id>/<uuid>.<đuôi>';
COMMENT ON COLUMN mot_cua.thanh_phan_ho_so.nguoi_tai_sub IS 'sub Keycloak của người tải tệp lên';
COMMENT ON COLUMN mot_cua.thanh_phan_ho_so.ket_qua_quet IS 'Kết quả quét ClamAV; tệp nhiễm bị từ chối, không bao giờ được lưu nên chỉ có giá trị sach';
COMMENT ON COLUMN mot_cua.thanh_phan_ho_so.may_quet IS 'Phiên bản ClamAV và CSDL virus lúc quét';

-- 3. Nhật ký tệp (chỉ thêm, không sửa, không xóa) ------------------------------------------
-- Ghi mọi lần tải lên, mọi tệp bị từ chối (mã độc, sai loại) và mọi lần cấp link xem.
-- Log kiểm toán chuỗi băm của toàn hệ thống là việc riêng (tuần 4, [D]).
CREATE TABLE mot_cua.nhat_ky_tep (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  luc                 timestamptz NOT NULL DEFAULT now(),
  hanh_dong           text NOT NULL CHECK (hanh_dong IN ('tai_len', 'tu_choi_ma_doc', 'tu_choi_loai_tep', 'cap_link')),
  nguoi_sub           text NOT NULL,
  vai_tro             text NOT NULL,
  ho_so_id            uuid,
  thanh_phan_ho_so_id uuid,
  ten_tep             text,
  kich_thuoc          bigint,
  sha256              text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  chi_tiet            text
);
CREATE INDEX ON mot_cua.nhat_ky_tep (ho_so_id);
COMMENT ON TABLE mot_cua.nhat_ky_tep IS 'Nhật ký tệp hồ sơ: tải lên, từ chối (mã độc/sai loại), cấp link xem. Chỉ thêm';

CREATE FUNCTION mot_cua_noi_bo.chan_sua_nhat_ky() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Nhật ký tệp chỉ được thêm, không sửa hay xóa' USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER chan_sua_nhat_ky BEFORE UPDATE OR DELETE ON mot_cua.nhat_ky_tep
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.chan_sua_nhat_ky();
CREATE TRIGGER chan_xoa_het_nhat_ky BEFORE TRUNCATE ON mot_cua.nhat_ky_tep
  FOR EACH STATEMENT EXECUTE FUNCTION mot_cua_noi_bo.chan_sua_nhat_ky();

-- 4. Quyền ---------------------------------------------------------------------------
-- Công dân: bỏ quyền INSERT metadata trực tiếp (thu hồi ở mức bảng thu hồi cả quyền cột).
REVOKE INSERT ON mot_cua.thanh_phan_ho_so FROM cong_dan;
DROP POLICY cong_dan_dinh_kem ON mot_cua.thanh_phan_ho_so;

-- Dịch vụ tệp: đọc hồ sơ/thành phần để kiểm và trả metadata, ghi metadata + nhật ký.
GRANT USAGE ON SCHEMA mot_cua, mot_cua_noi_bo TO dich_vu_tep;
GRANT SELECT ON mot_cua.ho_so, mot_cua.thu_tuc, mot_cua.thanh_phan_yeu_cau, mot_cua.thanh_phan_ho_so
  TO dich_vu_tep;
GRANT INSERT (ho_so_id, thanh_phan_yeu_cau_id, ten_tep, loai_mime, kich_thuoc, sha256, object_key,
              nguoi_tai_sub, ket_qua_quet, may_quet, quet_luc)
  ON mot_cua.thanh_phan_ho_so TO dich_vu_tep;
GRANT INSERT (hanh_dong, nguoi_sub, vai_tro, ho_so_id, thanh_phan_ho_so_id, ten_tep, kich_thuoc, sha256, chi_tiet)
  ON mot_cua.nhat_ky_tep TO dich_vu_tep;
GRANT SELECT ON mot_cua.nhat_ky_tep TO lanh_dao;

-- 5. RLS ----------------------------------------------------------------------------
ALTER TABLE mot_cua.nhat_ky_tep ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.nhat_ky_tep FORCE ROW LEVEL SECURITY;

CREATE POLICY dich_vu_tep_doc_ho_so ON mot_cua.ho_so
  FOR SELECT TO dich_vu_tep USING (true);
CREATE POLICY dich_vu_tep_doc_thu_tuc ON mot_cua.thu_tuc
  FOR SELECT TO dich_vu_tep USING (true);
CREATE POLICY dich_vu_tep_doc_thanh_phan_yeu_cau ON mot_cua.thanh_phan_yeu_cau
  FOR SELECT TO dich_vu_tep USING (true);
CREATE POLICY dich_vu_tep_doc_thanh_phan_ho_so ON mot_cua.thanh_phan_ho_so
  FOR SELECT TO dich_vu_tep USING (true);
-- Kể cả dịch vụ cũng chỉ gắn được tệp đã quét sạch, do chính người nộp tải lên, vào hồ sơ
-- đang mới nộp hoặc chờ bổ sung (backend đã kiểm bằng token người dùng; đây là lớp thứ hai).
CREATE POLICY dich_vu_tep_ghi_thanh_phan_ho_so ON mot_cua.thanh_phan_ho_so
  FOR INSERT TO dich_vu_tep
  WITH CHECK (object_key IS NOT NULL
              AND trang_thai_kiem_tra = 'chua_kiem_tra'
              AND EXISTS (SELECT 1 FROM mot_cua.ho_so h
                           WHERE h.id = ho_so_id
                             AND h.nguoi_nop_sub = nguoi_tai_sub
                             AND h.trang_thai IN ('moi', 'cho_bo_sung')));

CREATE POLICY dich_vu_tep_ghi_nhat_ky ON mot_cua.nhat_ky_tep
  FOR INSERT TO dich_vu_tep WITH CHECK (true);
CREATE POLICY lanh_dao_xem_nhat_ky ON mot_cua.nhat_ky_tep
  FOR SELECT TO lanh_dao USING (true);

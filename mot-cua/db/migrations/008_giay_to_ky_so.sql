-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Bộ máy một cửa – giấy tờ có ký số của hồ sơ: biên nhận, thông báo kết quả (#77).
-- nen-tang/scripts/tang2-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- mot-cua-api sinh PDF từ mẫu mot-cua/mau-giay-to/ (Gotenberg), ký PAdES bằng chứng thư của bộ
-- máy (step-ca cấp, ca-init ghi vào OpenBao, pyHanko ký), lưu lên Garage rồi mới ghi một dòng ở
-- đây bằng tài khoản dịch vụ `dich_vu_tep` (như tệp hồ sơ, #7): người dùng không tự khai được
-- object_key hay SHA-256. Mỗi hồ sơ tối đa một giấy tờ mỗi loại; dòng không sửa được. Trigger ghi
-- nhật ký kiểm toán (#75) `giay_to.ky` kèm SHA-256 của PDF đã ký, cùng transaction.

-- 1. Bảng ----------------------------------------------------------------------------
CREATE TABLE mot_cua.giay_to_ky (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ho_so_id           uuid NOT NULL REFERENCES mot_cua.ho_so (id) ON DELETE CASCADE,
  loai               text NOT NULL CHECK (loai IN ('bien_nhan', 'ket_qua')),
  object_key         text NOT NULL UNIQUE,
  sha256             text NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  kich_thuoc         bigint NOT NULL CHECK (kich_thuoc > 0),
  chung_thu_ten      text NOT NULL,
  chung_thu_so_hieu  text NOT NULL,
  nguoi_yeu_cau_sub  text NOT NULL,
  ky_luc             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ho_so_id, loai),
  -- Như tệp hồ sơ (003): khóa object nằm dưới tiền tố của chính hồ sơ.
  CHECK (object_key LIKE 'ho-so/' || ho_so_id::text || '/giay-to/%')
);
COMMENT ON TABLE mot_cua.giay_to_ky IS
  'Giấy tờ PDF có ký số PAdES của hồ sơ (#77): biên nhận khi tiếp nhận, thông báo kết quả khi hoàn tất. Chỉ thêm; ghi bằng dich_vu_tep';
COMMENT ON COLUMN mot_cua.giay_to_ky.sha256 IS 'SHA-256 của PDF ĐÃ KÝ (đúng tệp trên Garage); cũng nằm trong nhật ký kiểm toán giay_to.ky';
COMMENT ON COLUMN mot_cua.giay_to_ky.chung_thu_so_hieu IS 'Số hiệu (serial, thập phân) chứng thư ký tài liệu step-ca đã cấp';
COMMENT ON COLUMN mot_cua.giay_to_ky.nguoi_yeu_cau_sub IS 'sub Keycloak của người có thao tác dẫn tới việc phát hành (nộp, hoàn thành bước, bấm tải)';
CREATE INDEX ON mot_cua.giay_to_ky (ho_so_id);

CREATE FUNCTION mot_cua_noi_bo.chan_sua_giay_to() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Giấy tờ đã ký không sửa được' USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER chan_sua_giay_to BEFORE UPDATE ON mot_cua.giay_to_ky
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.chan_sua_giay_to();
CREATE TRIGGER chan_xoa_het_giay_to BEFORE TRUNCATE ON mot_cua.giay_to_ky
  FOR EACH STATEMENT EXECUTE FUNCTION mot_cua_noi_bo.chan_sua_giay_to();

-- 2. Kiểm toán ---------------------------------------------------------------------------
CREATE FUNCTION mot_cua_noi_bo.kiem_toan_giay_to() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM mot_cua_noi_bo.ghi_kiem_toan('giay_to.ky', 'ho_so', NEW.ho_so_id::text,
    jsonb_build_object('maHoSo', (SELECT h.ma_ho_so FROM mot_cua.ho_so h WHERE h.id = NEW.ho_so_id),
                       'giayToId', NEW.id, 'loai', NEW.loai, 'sha256', NEW.sha256,
                       'kichThuoc', NEW.kich_thuoc, 'chungThu', NEW.chung_thu_so_hieu),
    NEW.nguoi_yeu_cau_sub);
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION mot_cua_noi_bo.kiem_toan_giay_to() FROM PUBLIC;
CREATE TRIGGER kiem_toan AFTER INSERT ON mot_cua.giay_to_ky
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.kiem_toan_giay_to();
COMMENT ON COLUMN mot_cua.nhat_ky_kiem_toan.hanh_dong IS
  'ho_so.nop · ho_so.chuyen_trang_thai · ho_so.cap_nhat · ho_so.xoa · quy_trinh.xu_ly_buoc · quy_trinh.dong_bo · tep.tai_len · tep.kiem_tra · giay_to.ky · thu_tuc.them · thu_tuc.nap_goi · thu_tuc.rut_goi · can_bo.them_linh_vuc · can_bo.bo_linh_vuc · kiem_toan.khoi_tao';

-- 3. Quyền và RLS --------------------------------------------------------------------------
GRANT SELECT ON mot_cua.giay_to_ky TO cong_dan, can_bo, lanh_dao, dich_vu_tep;
GRANT INSERT (ho_so_id, loai, object_key, sha256, kich_thuoc, chung_thu_ten, chung_thu_so_hieu, nguoi_yeu_cau_sub)
  ON mot_cua.giay_to_ky TO dich_vu_tep;

ALTER TABLE mot_cua.giay_to_ky ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.giay_to_ky FORCE ROW LEVEL SECURITY;
-- Theo quyền xem hồ sơ (truy vấn con chịu RLS của ho_so).
CREATE POLICY xem_giay_to_ky ON mot_cua.giay_to_ky
  FOR SELECT TO cong_dan, can_bo, lanh_dao
  USING (EXISTS (SELECT 1 FROM mot_cua.ho_so h WHERE h.id = ho_so_id));
-- Dịch vụ tệp đọc mọi dòng (đối chiếu SHA-256 khi xác minh một PDF bất kỳ).
CREATE POLICY dich_vu_tep_doc_giay_to ON mot_cua.giay_to_ky
  FOR SELECT TO dich_vu_tep USING (true);
-- Lớp thứ hai sau kiểm tra của mot-cua-api: kết quả chỉ ghi được khi hồ sơ đã hoàn tất.
CREATE POLICY dich_vu_tep_ghi_giay_to ON mot_cua.giay_to_ky
  FOR INSERT TO dich_vu_tep
  WITH CHECK (EXISTS (SELECT 1 FROM mot_cua.ho_so h
                       WHERE h.id = ho_so_id
                         AND (loai = 'bien_nhan' OR h.trang_thai = 'hoan_tat')));

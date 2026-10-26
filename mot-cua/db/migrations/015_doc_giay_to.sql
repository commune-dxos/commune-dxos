-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Bộ máy một cửa – đọc giấy tờ bằng OCR và cán bộ xác nhận (Human-in-the-loop, #93).
-- nen-tang/scripts/tang2-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- Luồng (mot-cua/backend/doc_giay_to.py, main.py; docs/architecture.md §4.15):
--   1. Công dân chọn ảnh giấy tờ ở bước nộp → mot-cua-api đọc thử (không lưu) để tự điền; công dân sửa nếu sai.
--   2. Sau khi tải tệp lên: công dân gửi các trường đã khai (truong_cong_dan); mot-cua-api đọc lại TỆP ĐÃ LƯU ở
--      luồng nền bằng dịch vụ OCR của nền tảng (truong_may: máy đề xuất, kèm độ tin cậy) – không tin kết quả do
--      trình duyệt gửi.
--   3. Cán bộ so ảnh gốc, kết quả máy, thông tin công dân khai; xác nhận hoặc sửa → truong_xac_nhan. Từ đó dòng
--      không sửa được. Mỗi bước ghi nhật ký kiểm toán chuỗi băm (#75): giay_to.khai, giay_to.doc, giay_to.xac_nhan
--      (số trường và TÊN trường bị sửa, không ghi giá trị – giấy tờ có dữ liệu cá nhân).
-- Mọi lần ghi đi qua mot-cua-api bằng tài khoản dịch vụ `dich_vu_tep` sau khi API kiểm vai và quyền xem hồ sơ của
-- người gọi; người dùng đọc qua /api theo RLS của hồ sơ.

-- 1. Bảng ----------------------------------------------------------------------------
CREATE TABLE mot_cua.doc_giay_to (
  tep_id            uuid PRIMARY KEY REFERENCES mot_cua.thanh_phan_ho_so (id) ON DELETE CASCADE,
  ho_so_id          uuid NOT NULL REFERENCES mot_cua.ho_so (id) ON DELETE CASCADE,
  loai              text NOT NULL CHECK (loai ~ '^[a-z][a-z0-9_]{1,62}$'),
  trang_thai        text NOT NULL DEFAULT 'chua_doc'
                    CHECK (trang_thai IN ('chua_doc', 'cho_xac_nhan', 'da_xac_nhan')),
  truong_may        jsonb CHECK (truong_may IS NULL OR jsonb_typeof(truong_may) = 'object'),
  dong_may          jsonb CHECK (dong_may IS NULL OR jsonb_typeof(dong_may) = 'array'),
  mo_hinh           jsonb,
  doc_luc           timestamptz,
  loi_doc           text,
  truong_cong_dan   jsonb CHECK (truong_cong_dan IS NULL OR jsonb_typeof(truong_cong_dan) = 'object'),
  khai_luc          timestamptz,
  truong_xac_nhan   jsonb CHECK (truong_xac_nhan IS NULL OR jsonb_typeof(truong_xac_nhan) = 'object'),
  truong_da_sua     text[],
  xac_nhan_boi_sub  text,
  xac_nhan_luc      timestamptz,
  tao_luc           timestamptz NOT NULL DEFAULT now(),
  CHECK ((trang_thai = 'da_xac_nhan') = (truong_xac_nhan IS NOT NULL AND xac_nhan_boi_sub IS NOT NULL)),
  CHECK (trang_thai <> 'cho_xac_nhan' OR truong_may IS NOT NULL)
);
CREATE INDEX ON mot_cua.doc_giay_to (ho_so_id);
COMMENT ON TABLE mot_cua.doc_giay_to IS
  'Kết quả đọc giấy tờ bằng OCR (#93): máy đề xuất (truong_may), công dân khai (truong_cong_dan), cán bộ xác nhận (truong_xac_nhan, HITL). Ghi bằng dich_vu_tep qua mot-cua-api; xác nhận rồi không sửa được';
COMMENT ON COLUMN mot_cua.doc_giay_to.truong_may IS '{mã trường: {gia_tri, tin_cay, can_kiem_tra, dong}} do mot-cua-api trích từ chữ dịch vụ OCR đọc trên tệp đã lưu';
COMMENT ON COLUMN mot_cua.doc_giay_to.truong_cong_dan IS '{mã trường: giá trị} công dân xem và sửa trên form nộp hồ sơ';
COMMENT ON COLUMN mot_cua.doc_giay_to.truong_xac_nhan IS '{mã trường: giá trị} cán bộ chốt sau khi so với ảnh gốc – chỉ giá trị này được dùng';
COMMENT ON COLUMN mot_cua.doc_giay_to.truong_da_sua IS 'Trường cán bộ chốt khác máy đọc (CSDL tự tính) – đo độ chính xác OCR';

-- 2. Ràng buộc luồng -------------------------------------------------------------------------
CREATE FUNCTION mot_cua_noi_bo.doc_giay_to_truoc_ghi() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Hồ sơ lấy theo tệp, không theo dữ liệu gửi lên.
  SELECT t.ho_so_id INTO STRICT NEW.ho_so_id FROM mot_cua.thanh_phan_ho_so t WHERE t.id = NEW.tep_id;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.trang_thai = 'da_xac_nhan' THEN
      RAISE EXCEPTION 'Kết quả đọc giấy tờ đã được cán bộ xác nhận, không sửa được' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.loai IS DISTINCT FROM OLD.loai OR NEW.tep_id IS DISTINCT FROM OLD.tep_id THEN
      RAISE EXCEPTION 'Không đổi được tệp hay loại giấy tờ' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF NEW.truong_may IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.truong_may END) AND NEW.truong_may IS NOT NULL THEN
    NEW.doc_luc := now();
    NEW.loi_doc := NULL;
    IF NEW.trang_thai = 'chua_doc' THEN
      NEW.trang_thai := 'cho_xac_nhan';
    END IF;
  END IF;
  IF NEW.truong_cong_dan IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.truong_cong_dan END) THEN
    NEW.khai_luc := now();
  END IF;
  IF NEW.trang_thai = 'da_xac_nhan' THEN
    NEW.xac_nhan_luc := now();
    NEW.truong_da_sua := ARRAY(
      SELECT k FROM (SELECT jsonb_object_keys(coalesce(NEW.truong_may, '{}')) AS k
                     UNION SELECT jsonb_object_keys(NEW.truong_xac_nhan)) ks
       WHERE (NEW.truong_may -> k ->> 'gia_tri') IS DISTINCT FROM (NEW.truong_xac_nhan ->> k)
       ORDER BY k);
  ELSE
    NEW.xac_nhan_luc := NULL;
    NEW.truong_da_sua := NULL;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER truoc_ghi BEFORE INSERT OR UPDATE ON mot_cua.doc_giay_to
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.doc_giay_to_truoc_ghi();
CREATE FUNCTION mot_cua_noi_bo.chan_xoa_doc_giay_to() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Không xóa trực tiếp kết quả đọc giấy tờ' USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER chan_xoa_het BEFORE TRUNCATE ON mot_cua.doc_giay_to
  FOR EACH STATEMENT EXECUTE FUNCTION mot_cua_noi_bo.chan_xoa_doc_giay_to();

-- 3. Kiểm toán -------------------------------------------------------------------------------
CREATE FUNCTION mot_cua_noi_bo.kiem_toan_doc_giay_to() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ma text;
  v_cu mot_cua.doc_giay_to;
BEGIN
  SELECT h.ma_ho_so INTO v_ma FROM mot_cua.ho_so h WHERE h.id = NEW.ho_so_id;
  IF TG_OP = 'UPDATE' THEN
    v_cu := OLD;
  END IF;
  IF NEW.truong_cong_dan IS DISTINCT FROM v_cu.truong_cong_dan THEN
    PERFORM mot_cua_noi_bo.ghi_kiem_toan('giay_to.khai', 'ho_so', NEW.ho_so_id::text,
      jsonb_build_object('maHoSo', v_ma, 'tepId', NEW.tep_id, 'loai', NEW.loai,
                         'soTruong', (SELECT count(*) FROM jsonb_object_keys(coalesce(NEW.truong_cong_dan, '{}')))));
  END IF;
  IF NEW.truong_may IS DISTINCT FROM v_cu.truong_may AND NEW.truong_may IS NOT NULL THEN
    PERFORM mot_cua_noi_bo.ghi_kiem_toan('giay_to.doc', 'ho_so', NEW.ho_so_id::text,
      jsonb_build_object('maHoSo', v_ma, 'tepId', NEW.tep_id, 'loai', NEW.loai, 'moHinh', NEW.mo_hinh,
                         'soTruong', (SELECT count(*) FROM jsonb_object_keys(NEW.truong_may)),
                         'canKiemTra', (SELECT count(*) FROM jsonb_each(NEW.truong_may) e
                                         WHERE (e.value ->> 'can_kiem_tra')::boolean)));
  END IF;
  IF NEW.trang_thai = 'da_xac_nhan' AND v_cu.trang_thai IS DISTINCT FROM 'da_xac_nhan' THEN
    PERFORM mot_cua_noi_bo.ghi_kiem_toan('giay_to.xac_nhan', 'ho_so', NEW.ho_so_id::text,
      jsonb_build_object('maHoSo', v_ma, 'tepId', NEW.tep_id, 'loai', NEW.loai,
                         'soTruong', (SELECT count(*) FROM jsonb_object_keys(NEW.truong_xac_nhan)),
                         'truongDaSua', to_jsonb(NEW.truong_da_sua)),
      NEW.xac_nhan_boi_sub);
  END IF;
  RETURN NULL;
END
$$;
CREATE TRIGGER kiem_toan AFTER INSERT OR UPDATE ON mot_cua.doc_giay_to
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.kiem_toan_doc_giay_to();
REVOKE ALL ON FUNCTION mot_cua_noi_bo.kiem_toan_doc_giay_to(), mot_cua_noi_bo.doc_giay_to_truoc_ghi(),
  mot_cua_noi_bo.chan_xoa_doc_giay_to() FROM PUBLIC;
COMMENT ON COLUMN mot_cua.nhat_ky_kiem_toan.hanh_dong IS
  'ho_so.nop · ho_so.chuyen_trang_thai · ho_so.cap_nhat · ho_so.xoa · quy_trinh.xu_ly_buoc · quy_trinh.dong_bo · tep.tai_len · tep.kiem_tra · giay_to.ky · giay_to.khai · giay_to.doc · giay_to.xac_nhan · van_ban.vao_so · van_ban.du_thao · van_ban.ky · thu_tuc.them · thu_tuc.nap_goi · thu_tuc.rut_goi · can_bo.them_linh_vuc · can_bo.bo_linh_vuc · kiem_toan.khoi_tao';

-- 4. Quyền và RLS ----------------------------------------------------------------------------
GRANT SELECT ON mot_cua.doc_giay_to TO cong_dan, can_bo, lanh_dao, dich_vu_tep;
GRANT INSERT (tep_id, ho_so_id, loai, truong_may, dong_may, mo_hinh, loi_doc, truong_cong_dan)
  ON mot_cua.doc_giay_to TO dich_vu_tep;
GRANT UPDATE (trang_thai, truong_may, dong_may, mo_hinh, loi_doc, truong_cong_dan, truong_xac_nhan, xac_nhan_boi_sub)
  ON mot_cua.doc_giay_to TO dich_vu_tep;

ALTER TABLE mot_cua.doc_giay_to ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.doc_giay_to FORCE ROW LEVEL SECURITY;
-- Theo quyền xem hồ sơ (truy vấn con chịu RLS của ho_so): công dân hồ sơ của mình, cán bộ theo lĩnh vực.
CREATE POLICY xem_doc_giay_to ON mot_cua.doc_giay_to
  FOR SELECT TO cong_dan, can_bo, lanh_dao
  USING (EXISTS (SELECT 1 FROM mot_cua.ho_so h WHERE h.id = ho_so_id));
CREATE POLICY dich_vu_tep_doc_giay_to_ocr ON mot_cua.doc_giay_to
  FOR SELECT TO dich_vu_tep USING (true);
CREATE POLICY dich_vu_tep_ghi_doc_giay_to ON mot_cua.doc_giay_to
  FOR INSERT TO dich_vu_tep WITH CHECK (true);
CREATE POLICY dich_vu_tep_sua_doc_giay_to ON mot_cua.doc_giay_to
  FOR UPDATE TO dich_vu_tep USING (true) WITH CHECK (true);

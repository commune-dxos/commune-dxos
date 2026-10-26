-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Bộ máy một cửa – thông báo sắp trễ hạn tới cán bộ (#56).
-- nen-tang/scripts/tang2-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- mot-cua-worker phát ho_so.sap_tre_han lên RabbitMQ (#9). Consumer thông báo của mot-cua-worker nhận
-- từ queue mot_cua.thong_bao rồi gọi RPC ghi_thong_bao_sap_tre bằng tài khoản dịch vụ sự kiện: CSDL tìm
-- cán bộ đang làm việc phụ trách lĩnh vực của hồ sơ và ghi mỗi người một thông báo. Idempotent theo
-- (cán bộ, hồ sơ, loại, mốc hạn): nhận lại cùng sự kiện, chạy lại worker, quét lại đều không thêm dòng.
-- Kênh ngoài (email, SMS) ở chế độ giả lập: chỉ ghi dòng "đã gửi giả lập", không gửi gì ra ngoài.
-- Cán bộ đọc thông báo của chính mình qua /api/thong_bao (RLS) và chỉ được đánh dấu đã đọc.
-- Nội dung thông báo không có dữ liệu cá nhân của người nộp (chỉ mã hồ sơ, thủ tục, hạn).

CREATE TABLE mot_cua.thong_bao (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  can_bo_id   uuid NOT NULL REFERENCES mot_cua.can_bo (id) ON DELETE CASCADE,
  ho_so_id    uuid NOT NULL REFERENCES mot_cua.ho_so (id) ON DELETE CASCADE,
  loai        text NOT NULL CHECK (loai IN ('sap_tre_han')),
  moc         date NOT NULL,
  su_kien_id  uuid NOT NULL,
  tieu_de     text NOT NULL,
  noi_dung    text NOT NULL,
  tao_luc     timestamptz NOT NULL DEFAULT now(),
  da_doc_luc  timestamptz,
  UNIQUE (can_bo_id, ho_so_id, loai, moc)
);
CREATE INDEX thong_bao_chua_doc ON mot_cua.thong_bao (can_bo_id, tao_luc DESC) WHERE da_doc_luc IS NULL;
CREATE INDEX ON mot_cua.thong_bao (ho_so_id);
COMMENT ON TABLE mot_cua.thong_bao IS 'Thông báo tới cán bộ (#56). RLS: cán bộ chỉ thấy và đánh dấu đã đọc thông báo của mình';
COMMENT ON COLUMN mot_cua.thong_bao.moc IS 'Hạn xử lý (ho_so.han_xu_ly) mà thông báo nói tới: hạn đổi thì cảnh báo lại một lần';
COMMENT ON COLUMN mot_cua.thong_bao.su_kien_id IS 'id sự kiện RabbitMQ đã sinh ra thông báo (đối chiếu hop_thu_su_kien, nhat_ky_su_kien)';

CREATE TABLE mot_cua.thong_bao_kenh (
  thong_bao_id uuid NOT NULL REFERENCES mot_cua.thong_bao (id) ON DELETE CASCADE,
  kenh         text NOT NULL CHECK (kenh IN ('email', 'sms')),
  trang_thai   text NOT NULL DEFAULT 'gia_lap' CHECK (trang_thai IN ('gia_lap')),
  luc          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thong_bao_id, kenh)
);
COMMENT ON TABLE mot_cua.thong_bao_kenh IS 'Kênh ngoài của thông báo (#56). Chế độ giả lập: ghi lại, không gửi email/SMS thật';

-- Đã đọc: chỉ từ chưa đọc sang đã đọc, giờ do CSDL đặt; không sửa được cột nào khác.
CREATE FUNCTION mot_cua_noi_bo.thong_bao_truoc_sua() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.can_bo_id, NEW.ho_so_id, NEW.loai, NEW.moc, NEW.su_kien_id, NEW.tieu_de, NEW.noi_dung, NEW.tao_luc)
     IS DISTINCT FROM
     (OLD.can_bo_id, OLD.ho_so_id, OLD.loai, OLD.moc, OLD.su_kien_id, OLD.tieu_de, OLD.noi_dung, OLD.tao_luc) THEN
    RAISE EXCEPTION 'Thông báo chỉ được đánh dấu đã đọc' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.da_doc_luc := CASE WHEN OLD.da_doc_luc IS NOT NULL THEN OLD.da_doc_luc
                         WHEN NEW.da_doc_luc IS NOT NULL THEN now() END;
  RETURN NEW;
END
$$;
CREATE TRIGGER thong_bao_truoc_sua BEFORE UPDATE ON mot_cua.thong_bao
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.thong_bao_truoc_sua();

-- Ghi thông báo cho một sự kiện ho_so.sap_tre_han (định dạng mot-cua/backend/su_kien.py). Người nhận:
-- cán bộ đang làm việc phụ trách lĩnh vực của thủ tục. Hồ sơ đã đóng thì không ghi. → {moi, nguoiNhan}.
CREATE FUNCTION mot_cua.ghi_thong_bao_sap_tre(p_su_kien jsonb, p_kenh text[] DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ho_so mot_cua.ho_so%ROWTYPE;
  v_thu_tuc mot_cua.thu_tuc%ROWTYPE;
  v_moc date;
  v_con_lai text := p_su_kien -> 'duLieu' ->> 'conLaiNgayLamViec';
  v_nguoi_nhan integer;
  v_moi uuid[];
BEGIN
  IF p_su_kien ->> 'loai' IS DISTINCT FROM 'ho_so.sap_tre_han' THEN
    RAISE EXCEPTION 'Chỉ nhận sự kiện ho_so.sap_tre_han' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  BEGIN
    v_moc := (p_su_kien -> 'duLieu' ->> 'hanXuLy')::date;
    SELECT * INTO v_ho_so FROM mot_cua.ho_so WHERE id = (p_su_kien ->> 'hoSoId')::uuid;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Sự kiện thiếu hoSoId hoặc duLieu.hanXuLy hợp lệ' USING ERRCODE = 'invalid_parameter_value';
  END;
  IF v_moc IS NULL OR v_ho_so.id IS NULL THEN
    RAISE EXCEPTION 'Sự kiện thiếu hoSoId hoặc duLieu.hanXuLy hợp lệ' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_ho_so.trang_thai IN ('hoan_tat', 'tu_choi') THEN
    RETURN jsonb_build_object('moi', 0, 'nguoiNhan', 0, 'boQua', 'hồ sơ đã đóng');
  END IF;
  SELECT * INTO v_thu_tuc FROM mot_cua.thu_tuc WHERE id = v_ho_so.thu_tuc_id;

  SELECT count(*) INTO v_nguoi_nhan
    FROM mot_cua.can_bo c JOIN mot_cua.can_bo_linh_vuc l ON l.can_bo_id = c.id
   WHERE l.linh_vuc_id = v_thu_tuc.linh_vuc_id AND c.dang_lam_viec;

  WITH moi AS (
    INSERT INTO mot_cua.thong_bao (can_bo_id, ho_so_id, loai, moc, su_kien_id, tieu_de, noi_dung)
    SELECT c.id, v_ho_so.id, 'sap_tre_han', v_moc, (p_su_kien ->> 'id')::uuid,
           'Hồ sơ ' || v_ho_so.ma_ho_so || ' sắp trễ hạn',
           v_thu_tuc.ten || ' · hạn 17:00 ' || to_char(v_moc, 'DD/MM/YYYY')
             || coalesce(' · còn ' || v_con_lai || ' ngày làm việc', '')
      FROM mot_cua.can_bo c JOIN mot_cua.can_bo_linh_vuc l ON l.can_bo_id = c.id
     WHERE l.linh_vuc_id = v_thu_tuc.linh_vuc_id AND c.dang_lam_viec
    ON CONFLICT (can_bo_id, ho_so_id, loai, moc) DO NOTHING
    RETURNING id
  )
  SELECT coalesce(array_agg(id), '{}') INTO v_moi FROM moi;

  INSERT INTO mot_cua.thong_bao_kenh (thong_bao_id, kenh)
  SELECT t, k FROM unnest(v_moi) t CROSS JOIN (SELECT DISTINCT unnest(p_kenh) k) kk
   WHERE k IN ('email', 'sms');

  RETURN jsonb_build_object('moi', cardinality(v_moi), 'nguoiNhan', v_nguoi_nhan);
END
$$;
COMMENT ON FUNCTION mot_cua.ghi_thong_bao_sap_tre(jsonb, text[]) IS
  'Consumer thông báo (#56): sự kiện ho_so.sap_tre_han → mỗi cán bộ phụ trách lĩnh vực một thông báo, chống trùng theo mốc hạn';
REVOKE EXECUTE ON FUNCTION mot_cua.ghi_thong_bao_sap_tre(jsonb, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mot_cua.ghi_thong_bao_sap_tre(jsonb, text[]) TO dich_vu_su_kien;

-- Quyền ----------------------------------------------------------------------------
GRANT SELECT ON mot_cua.thong_bao, mot_cua.thong_bao_kenh TO can_bo, lanh_dao;
GRANT UPDATE (da_doc_luc) ON mot_cua.thong_bao TO can_bo, lanh_dao;
GRANT EXECUTE ON FUNCTION mot_cua_noi_bo.can_bo_hien_tai() TO lanh_dao;

ALTER TABLE mot_cua.thong_bao ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.thong_bao FORCE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.thong_bao_kenh ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.thong_bao_kenh FORCE ROW LEVEL SECURITY;

CREATE POLICY xem_thong_bao_cua_minh ON mot_cua.thong_bao
  FOR SELECT TO can_bo, lanh_dao USING (can_bo_id = mot_cua_noi_bo.can_bo_hien_tai());
CREATE POLICY doc_thong_bao_cua_minh ON mot_cua.thong_bao
  FOR UPDATE TO can_bo, lanh_dao
  USING (can_bo_id = mot_cua_noi_bo.can_bo_hien_tai()) WITH CHECK (can_bo_id = mot_cua_noi_bo.can_bo_hien_tai());
CREATE POLICY xem_kenh_thong_bao_cua_minh ON mot_cua.thong_bao_kenh
  FOR SELECT TO can_bo, lanh_dao
  USING (EXISTS (SELECT 1 FROM mot_cua.thong_bao t
                  WHERE t.id = thong_bao_id AND t.can_bo_id = mot_cua_noi_bo.can_bo_hien_tai()));

-- pgAudit: theo dõi ghi vào bảng thông báo ở mức câu lệnh (#75); role có từ migration 007.
GRANT INSERT, UPDATE, DELETE ON mot_cua.thong_bao TO dxos_kiem_toan;

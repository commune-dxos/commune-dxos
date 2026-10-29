-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Bộ máy một cửa – lịch công tác của xã trong cổng cán bộ (#117).
-- nen-tang/scripts/tang2-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- Lịch họp, tiếp công dân, trực, đi công tác của Ủy ban xã. Cổng /can-bo đọc và ghi thẳng qua PostgREST
-- (/api/lich_cong_tac) bằng token của người gọi; CSDL quyết định ai thấy gì và ai được làm gì.
--
-- Vòng đời (trang_thai):
--   du_kien   văn thư hoặc lãnh đạo soạn; cán bộ chưa thấy
--   da_duyet  lãnh đạo duyệt (CSDL ghi người duyệt, giờ duyệt); mọi cán bộ thấy
--   da_huy    hủy, bắt buộc ghi lý do; không sửa được nữa. Lịch đã duyệt rồi hủy vẫn hiện cho cán bộ (gạch bỏ)
-- Văn thư soạn, sửa, hủy lịch dự kiến; không duyệt, không đụng lịch đã duyệt. Lãnh đạo làm được mọi bước.
-- Không xóa. Poka-yoke: hai lịch chưa hủy không được trùng địa điểm (không phân biệt hoa thường, khoảng trắng)
-- và chồng giờ → lỗi exclusion_violation (PostgREST trả 400, mã 23P01). Nhật ký kiểm toán chuỗi băm (#75): lich.them,
-- lich.sua, lich.duyet, lich.huy, ghi loại, giờ, trạng thái, trường đổi; KHÔNG ghi tiêu đề, thành phần, ghi chú.

-- 1. Bảng ----------------------------------------------------------------------------
CREATE TABLE mot_cua.lich_cong_tac (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tieu_de          text NOT NULL CHECK (length(btrim(tieu_de)) BETWEEN 3 AND 300),
  loai             text NOT NULL CHECK (loai IN ('hop', 'tiep_dan', 'truc', 'cong_tac', 'khac')),
  bat_dau          timestamptz NOT NULL,
  ket_thuc         timestamptz NOT NULL,
  dia_diem         text CHECK (dia_diem IS NULL OR length(dia_diem) BETWEEN 1 AND 200),
  chu_tri          text CHECK (chu_tri IS NULL OR length(chu_tri) BETWEEN 1 AND 200),
  thanh_phan       text CHECK (thanh_phan IS NULL OR length(thanh_phan) BETWEEN 1 AND 1000),
  ghi_chu          text CHECK (ghi_chu IS NULL OR length(ghi_chu) BETWEEN 1 AND 2000),
  trang_thai       text NOT NULL DEFAULT 'du_kien' CHECK (trang_thai IN ('du_kien', 'da_duyet', 'da_huy')),
  ly_do_huy        text CHECK (ly_do_huy IS NULL OR length(btrim(ly_do_huy)) BETWEEN 3 AND 500),
  nguoi_tao_sub    text NOT NULL,
  tao_luc          timestamptz NOT NULL DEFAULT now(),
  nguoi_sua_sub    text NOT NULL,
  sua_luc          timestamptz NOT NULL DEFAULT now(),
  nguoi_duyet_sub  text,
  duyet_luc        timestamptz,
  CHECK (ket_thuc > bat_dau),
  CHECK (ket_thuc - bat_dau <= interval '7 days'),
  CHECK ((trang_thai = 'da_huy') = (ly_do_huy IS NOT NULL)),
  CHECK ((nguoi_duyet_sub IS NULL) = (duyet_luc IS NULL)),
  CHECK (trang_thai <> 'da_duyet' OR duyet_luc IS NOT NULL)
);
CREATE INDEX ON mot_cua.lich_cong_tac (bat_dau, ket_thuc);
COMMENT ON TABLE mot_cua.lich_cong_tac IS
  'Lịch công tác của xã (#117): du_kien → da_duyet (lãnh đạo) hoặc da_huy (có lý do). Cán bộ chỉ thấy lịch đã duyệt; '
  'văn thư, lãnh đạo thấy hết. Không xóa. Không cho hai lịch chưa hủy trùng địa điểm và chồng giờ';

-- 2. Trigger: chuẩn hóa, người ghi, duyệt, hủy, chặn trùng địa điểm ------------------------------
CREATE FUNCTION mot_cua_noi_bo.lich_truoc_ghi() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sub text := coalesce(dxos.jwt_sub(), CASE WHEN TG_OP = 'INSERT' THEN NEW.nguoi_tao_sub END);
  v_trung mot_cua.lich_cong_tac%ROWTYPE;
BEGIN
  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'Không xác định được người ghi lịch công tác' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.tieu_de := btrim(NEW.tieu_de);
  NEW.dia_diem := nullif(btrim(NEW.dia_diem), '');
  NEW.chu_tri := nullif(btrim(NEW.chu_tri), '');
  NEW.thanh_phan := nullif(btrim(NEW.thanh_phan), '');
  NEW.ghi_chu := nullif(btrim(NEW.ghi_chu), '');
  NEW.ly_do_huy := nullif(btrim(NEW.ly_do_huy), '');

  IF TG_OP = 'INSERT' THEN
    IF NEW.trang_thai = 'da_huy' THEN
      RAISE EXCEPTION 'Lịch mới phải ở trạng thái dự kiến hoặc đã duyệt' USING ERRCODE = 'check_violation';
    END IF;
    NEW.nguoi_tao_sub := v_sub;
    NEW.nguoi_sua_sub := v_sub;
    NEW.tao_luc := now();
    NEW.sua_luc := NEW.tao_luc;
    IF NEW.trang_thai = 'da_duyet' THEN
      NEW.nguoi_duyet_sub := v_sub;
      NEW.duyet_luc := NEW.tao_luc;
    ELSE
      NEW.nguoi_duyet_sub := NULL;
      NEW.duyet_luc := NULL;
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.nguoi_tao_sub IS DISTINCT FROM OLD.nguoi_tao_sub
       OR NEW.tao_luc IS DISTINCT FROM OLD.tao_luc THEN
      RAISE EXCEPTION 'Không đổi được mã, người tạo của lịch công tác' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.trang_thai = 'da_huy' THEN
      RAISE EXCEPTION 'Lịch đã hủy, không sửa được' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.trang_thai = 'da_duyet' AND NEW.trang_thai = 'du_kien' THEN
      RAISE EXCEPTION 'Lịch đã duyệt không trở lại dự kiến được: sửa trực tiếp hoặc hủy' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.trang_thai = 'da_duyet' AND OLD.trang_thai <> 'da_duyet' THEN
      NEW.nguoi_duyet_sub := v_sub;
      NEW.duyet_luc := now();
    ELSE
      NEW.nguoi_duyet_sub := OLD.nguoi_duyet_sub;
      NEW.duyet_luc := OLD.duyet_luc;
    END IF;
    IF (NEW.tieu_de, NEW.loai, NEW.bat_dau, NEW.ket_thuc, NEW.dia_diem, NEW.chu_tri, NEW.thanh_phan, NEW.ghi_chu,
        NEW.trang_thai, NEW.ly_do_huy)
       IS NOT DISTINCT FROM
       (OLD.tieu_de, OLD.loai, OLD.bat_dau, OLD.ket_thuc, OLD.dia_diem, OLD.chu_tri, OLD.thanh_phan, OLD.ghi_chu,
        OLD.trang_thai, OLD.ly_do_huy) THEN
      -- Không đổi gì: giữ nguyên người sửa, giờ sửa.
      NEW.nguoi_sua_sub := OLD.nguoi_sua_sub; NEW.sua_luc := OLD.sua_luc;
      RETURN NEW;
    END IF;
    NEW.nguoi_sua_sub := v_sub;
    NEW.sua_luc := now();
  END IF;

  IF NEW.ket_thuc <= NEW.bat_dau THEN
    RAISE EXCEPTION 'Giờ kết thúc phải sau giờ bắt đầu' USING ERRCODE = 'check_violation';
  END IF;

  -- Poka-yoke: trùng địa điểm và chồng giờ. Khóa theo địa điểm để hai lần ghi đồng thời không cùng lọt.
  IF NEW.trang_thai <> 'da_huy' AND NEW.dia_diem IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('lich_cong_tac:' || lower(NEW.dia_diem)));
    SELECT * INTO v_trung
      FROM mot_cua.lich_cong_tac l
     WHERE l.id <> NEW.id
       AND l.trang_thai <> 'da_huy'
       AND lower(l.dia_diem) = lower(NEW.dia_diem)
       AND tstzrange(l.bat_dau, l.ket_thuc) && tstzrange(NEW.bat_dau, NEW.ket_thuc)
     ORDER BY l.bat_dau
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Trùng địa điểm: "%" đã có lịch từ % đến %', NEW.dia_diem,
        to_char(v_trung.bat_dau AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY'),
        to_char(v_trung.ket_thuc AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')
        USING ERRCODE = 'exclusion_violation', DETAIL = 'lich_trung=' || v_trung.id;
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER truoc_ghi BEFORE INSERT OR UPDATE ON mot_cua.lich_cong_tac
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.lich_truoc_ghi();

CREATE FUNCTION mot_cua_noi_bo.chan_xoa_lich() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Không xóa lịch công tác: hủy lịch và ghi lý do' USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER chan_xoa BEFORE DELETE ON mot_cua.lich_cong_tac
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.chan_xoa_lich();
CREATE TRIGGER chan_xoa_het BEFORE TRUNCATE ON mot_cua.lich_cong_tac
  FOR EACH STATEMENT EXECUTE FUNCTION mot_cua_noi_bo.chan_xoa_lich();

-- 3. Kiểm toán ------------------------------------------------------------------------------
CREATE FUNCTION mot_cua_noi_bo.kiem_toan_lich() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hanh_dong text;
  v_doi text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_hanh_dong := 'lich.them';
  ELSIF (NEW.tieu_de, NEW.loai, NEW.bat_dau, NEW.ket_thuc, NEW.dia_diem, NEW.chu_tri, NEW.thanh_phan, NEW.ghi_chu,
         NEW.trang_thai, NEW.ly_do_huy)
        IS NOT DISTINCT FROM
        (OLD.tieu_de, OLD.loai, OLD.bat_dau, OLD.ket_thuc, OLD.dia_diem, OLD.chu_tri, OLD.thanh_phan, OLD.ghi_chu,
         OLD.trang_thai, OLD.ly_do_huy) THEN
    RETURN NULL;  -- không đổi gì
  ELSIF NEW.trang_thai = 'da_huy' THEN
    v_hanh_dong := 'lich.huy';
  ELSIF NEW.trang_thai = 'da_duyet' AND OLD.trang_thai <> 'da_duyet' THEN
    v_hanh_dong := 'lich.duyet';
  ELSE
    v_hanh_dong := 'lich.sua';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_doi := ARRAY(
      SELECT n.key FROM jsonb_each(to_jsonb(NEW)) n JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
       WHERE n.value IS DISTINCT FROM o.value
         AND n.key NOT IN ('nguoi_sua_sub', 'sua_luc', 'nguoi_duyet_sub', 'duyet_luc')
       ORDER BY n.key);
  END IF;
  PERFORM mot_cua_noi_bo.ghi_kiem_toan(v_hanh_dong, 'lich_cong_tac', NEW.id::text,
    jsonb_build_object('loai', NEW.loai, 'trangThai', NEW.trang_thai, 'batDau', NEW.bat_dau, 'ketThuc', NEW.ket_thuc)
      || CASE WHEN v_doi IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('truongDoi', to_jsonb(v_doi)) END,
    NEW.nguoi_sua_sub);
  RETURN NULL;
END
$$;
CREATE TRIGGER kiem_toan AFTER INSERT OR UPDATE ON mot_cua.lich_cong_tac
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.kiem_toan_lich();
REVOKE ALL ON FUNCTION mot_cua_noi_bo.lich_truoc_ghi(), mot_cua_noi_bo.chan_xoa_lich(),
  mot_cua_noi_bo.kiem_toan_lich() FROM PUBLIC;
COMMENT ON COLUMN mot_cua.nhat_ky_kiem_toan.hanh_dong IS
  'ho_so.nop · ho_so.chuyen_trang_thai · ho_so.cap_nhat · ho_so.xoa · quy_trinh.xu_ly_buoc · quy_trinh.dong_bo · tep.tai_len · tep.kiem_tra · giay_to.ky · giay_to.khai · giay_to.doc · giay_to.xac_nhan · van_ban.vao_so · van_ban.du_thao · van_ban.ky · wiki.them · wiki.sua · wiki.ngung_hieu_luc · wiki.hieu_luc_lai · lich.them · lich.sua · lich.duyet · lich.huy · thu_tuc.them · thu_tuc.nap_goi · thu_tuc.rut_goi · can_bo.them_linh_vuc · can_bo.bo_linh_vuc · kiem_toan.khoi_tao';

-- 4. Quyền và RLS ----------------------------------------------------------------------------
GRANT SELECT ON mot_cua.lich_cong_tac TO can_bo, lanh_dao, van_thu;
GRANT INSERT (tieu_de, loai, bat_dau, ket_thuc, dia_diem, chu_tri, thanh_phan, ghi_chu, trang_thai)
  ON mot_cua.lich_cong_tac TO van_thu, lanh_dao;
GRANT UPDATE (tieu_de, loai, bat_dau, ket_thuc, dia_diem, chu_tri, thanh_phan, ghi_chu, trang_thai, ly_do_huy)
  ON mot_cua.lich_cong_tac TO van_thu, lanh_dao;
-- pgAudit: theo dõi ghi vào lịch công tác ở mức câu lệnh (#75).
GRANT INSERT, UPDATE, DELETE ON mot_cua.lich_cong_tac TO dxos_kiem_toan;

ALTER TABLE mot_cua.lich_cong_tac ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.lich_cong_tac FORCE ROW LEVEL SECURITY;

CREATE POLICY can_bo_xem_lich ON mot_cua.lich_cong_tac FOR SELECT TO can_bo
  USING (duyet_luc IS NOT NULL);
CREATE POLICY van_thu_lanh_dao_xem_lich ON mot_cua.lich_cong_tac FOR SELECT TO van_thu, lanh_dao USING (true);
CREATE POLICY van_thu_them_lich ON mot_cua.lich_cong_tac FOR INSERT TO van_thu WITH CHECK (trang_thai = 'du_kien');
CREATE POLICY lanh_dao_them_lich ON mot_cua.lich_cong_tac FOR INSERT TO lanh_dao WITH CHECK (true);
CREATE POLICY van_thu_sua_lich ON mot_cua.lich_cong_tac FOR UPDATE TO van_thu
  USING (trang_thai = 'du_kien') WITH CHECK (trang_thai IN ('du_kien', 'da_huy') AND duyet_luc IS NULL);
CREATE POLICY lanh_dao_sua_lich ON mot_cua.lich_cong_tac FOR UPDATE TO lanh_dao USING (true) WITH CHECK (true);

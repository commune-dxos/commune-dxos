-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Bộ máy một cửa – wiki văn bản nội bộ cho cán bộ (#95).
-- nen-tang/scripts/tang2-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- Văn bản nội bộ của xã (quy chế, hướng dẫn nghiệp vụ, quy trình, biểu mẫu, thông báo nội bộ) để cán bộ tra cứu
-- trong cổng /can-bo. CSDL là nguồn sự thật và quyết định ai thấy gì (RLS); Meilisearch CE chỉ là chỉ mục tìm kiếm
-- dựng lại được, mot-cua-api lọc theo quyền khi tìm rồi đối chiếu lại với CSDL bằng token của người gọi
-- (mot-cua/backend/wiki.py, docs/architecture.md §4.16).
--
-- Phạm vi xem (pham_vi):
--   toan_xa   mọi cán bộ, lãnh đạo, văn thư
--   linh_vuc  cán bộ đang phụ trách lĩnh vực đó, lãnh đạo, văn thư
--   lanh_dao  chỉ lãnh đạo
-- Ghi: văn thư (trừ phạm vi lanh_dao) và lãnh đạo, qua mot-cua-api bằng token của chính họ. Công dân, anon không
-- đọc được. Không xóa: văn bản hết dùng thì chuyển het_hieu_luc. Mỗi lần sửa lưu bản cũ vào wiki_van_ban_lich_su
-- và tăng phien_ban. Nhật ký kiểm toán chuỗi băm (#75): wiki.them, wiki.sua, wiki.ngung_hieu_luc, wiki.hieu_luc_lai,
-- ghi SHA-256 nội dung, KHÔNG ghi tiêu đề hay nội dung.

-- 1. Bảng ----------------------------------------------------------------------------
CREATE TABLE mot_cua.wiki_van_ban (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tieu_de        text NOT NULL CHECK (length(btrim(tieu_de)) BETWEEN 3 AND 300),
  loai           text NOT NULL
                 CHECK (loai IN ('quy_che', 'huong_dan', 'quy_trinh', 'bieu_mau', 'thong_bao_noi_bo', 'khac')),
  so_ky_hieu     text CHECK (so_ky_hieu IS NULL OR length(so_ky_hieu) BETWEEN 1 AND 60),
  ngay_ban_hanh  date,
  tom_tat        text CHECK (tom_tat IS NULL OR length(tom_tat) <= 1000),
  noi_dung       text NOT NULL CHECK (length(btrim(noi_dung)) BETWEEN 1 AND 100000),
  pham_vi        text NOT NULL DEFAULT 'toan_xa' CHECK (pham_vi IN ('toan_xa', 'linh_vuc', 'lanh_dao')),
  linh_vuc_id    uuid REFERENCES mot_cua.linh_vuc (id),
  trang_thai     text NOT NULL DEFAULT 'hieu_luc' CHECK (trang_thai IN ('hieu_luc', 'het_hieu_luc')),
  phien_ban      integer NOT NULL DEFAULT 1 CHECK (phien_ban >= 1),
  nguoi_tao_sub  text NOT NULL,
  tao_luc        timestamptz NOT NULL DEFAULT now(),
  nguoi_sua_sub  text NOT NULL,
  sua_luc        timestamptz NOT NULL DEFAULT now(),
  CHECK ((pham_vi = 'linh_vuc') = (linh_vuc_id IS NOT NULL))
);
CREATE INDEX ON mot_cua.wiki_van_ban (sua_luc DESC);
COMMENT ON TABLE mot_cua.wiki_van_ban IS
  'Wiki văn bản nội bộ cho cán bộ (#95). RLS theo pham_vi: toan_xa, linh_vuc (cán bộ phụ trách), lanh_dao. Văn thư, lãnh đạo ghi; không xóa. Meilisearch index mot-cua-wiki-van-ban chỉ là bản sao để tìm';

CREATE TABLE mot_cua.wiki_van_ban_lich_su (
  van_ban_id     uuid NOT NULL REFERENCES mot_cua.wiki_van_ban (id) ON DELETE CASCADE,
  phien_ban      integer NOT NULL,
  tieu_de        text NOT NULL,
  loai           text NOT NULL,
  so_ky_hieu     text,
  ngay_ban_hanh  date,
  tom_tat        text,
  noi_dung       text NOT NULL,
  pham_vi        text NOT NULL,
  linh_vuc_id    uuid,
  trang_thai     text NOT NULL,
  nguoi_sua_sub  text NOT NULL,
  sua_luc        timestamptz NOT NULL,
  PRIMARY KEY (van_ban_id, phien_ban)
);
COMMENT ON TABLE mot_cua.wiki_van_ban_lich_su IS
  'Các phiên bản cũ của văn bản wiki (#95): trigger chép dòng cũ trước mỗi lần sửa; chỉ thêm, không sửa, không xóa';

-- 2. Hàm quyền --------------------------------------------------------------------------
-- Cán bộ đang gọi (theo sub) có đang phụ trách lĩnh vực này không. Đọc bảng phân công với quyền chủ hàm như
-- phu_trach_thu_tuc (002).
CREATE FUNCTION mot_cua_noi_bo.phu_trach_linh_vuc(p_linh_vuc_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
      FROM mot_cua.can_bo_linh_vuc cl
      JOIN mot_cua.can_bo c ON c.id = cl.can_bo_id
     WHERE cl.linh_vuc_id = p_linh_vuc_id
       AND c.sub = dxos.jwt_sub()
       AND c.dang_lam_viec)
$$;
REVOKE ALL ON FUNCTION mot_cua_noi_bo.phu_trach_linh_vuc(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mot_cua_noi_bo.phu_trach_linh_vuc(uuid) TO can_bo;

-- 3. Trigger: người tạo/sửa, phiên bản, lịch sử, chặn xóa ----------------------------------
CREATE FUNCTION mot_cua_noi_bo.wiki_truoc_ghi() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sub text := coalesce(dxos.jwt_sub(), CASE WHEN TG_OP = 'INSERT' THEN NEW.nguoi_tao_sub END);
BEGIN
  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'Không xác định được người ghi văn bản wiki' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.tieu_de := btrim(NEW.tieu_de);
  IF TG_OP = 'INSERT' THEN
    NEW.nguoi_tao_sub := v_sub;
    NEW.nguoi_sua_sub := v_sub;
    NEW.phien_ban := 1;
    NEW.tao_luc := now();
    NEW.sua_luc := NEW.tao_luc;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.nguoi_tao_sub IS DISTINCT FROM OLD.nguoi_tao_sub
     OR NEW.tao_luc IS DISTINCT FROM OLD.tao_luc THEN
    RAISE EXCEPTION 'Không đổi được mã, người tạo của văn bản wiki' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.tieu_de, NEW.loai, NEW.so_ky_hieu, NEW.ngay_ban_hanh, NEW.tom_tat, NEW.noi_dung, NEW.pham_vi,
      NEW.linh_vuc_id, NEW.trang_thai)
     IS NOT DISTINCT FROM
     (OLD.tieu_de, OLD.loai, OLD.so_ky_hieu, OLD.ngay_ban_hanh, OLD.tom_tat, OLD.noi_dung, OLD.pham_vi,
      OLD.linh_vuc_id, OLD.trang_thai) THEN
    -- Không đổi gì: giữ nguyên phiên bản, người sửa, giờ sửa.
    NEW.phien_ban := OLD.phien_ban; NEW.nguoi_sua_sub := OLD.nguoi_sua_sub; NEW.sua_luc := OLD.sua_luc;
    RETURN NEW;
  END IF;
  INSERT INTO mot_cua.wiki_van_ban_lich_su (van_ban_id, phien_ban, tieu_de, loai, so_ky_hieu, ngay_ban_hanh, tom_tat,
                                            noi_dung, pham_vi, linh_vuc_id, trang_thai, nguoi_sua_sub, sua_luc)
  VALUES (OLD.id, OLD.phien_ban, OLD.tieu_de, OLD.loai, OLD.so_ky_hieu, OLD.ngay_ban_hanh, OLD.tom_tat, OLD.noi_dung,
          OLD.pham_vi, OLD.linh_vuc_id, OLD.trang_thai, OLD.nguoi_sua_sub, OLD.sua_luc);
  NEW.phien_ban := OLD.phien_ban + 1;
  NEW.nguoi_sua_sub := v_sub;
  NEW.sua_luc := now();
  RETURN NEW;
END
$$;
CREATE TRIGGER truoc_ghi BEFORE INSERT OR UPDATE ON mot_cua.wiki_van_ban
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.wiki_truoc_ghi();

CREATE FUNCTION mot_cua_noi_bo.chan_xoa_wiki() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Không xóa văn bản wiki hay lịch sử của nó: chuyển văn bản sang hết hiệu lực'
    USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER chan_xoa BEFORE DELETE ON mot_cua.wiki_van_ban
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.chan_xoa_wiki();
CREATE TRIGGER chan_xoa_het BEFORE TRUNCATE ON mot_cua.wiki_van_ban
  FOR EACH STATEMENT EXECUTE FUNCTION mot_cua_noi_bo.chan_xoa_wiki();
CREATE TRIGGER chan_sua_xoa BEFORE UPDATE OR DELETE ON mot_cua.wiki_van_ban_lich_su
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.chan_xoa_wiki();
CREATE TRIGGER chan_xoa_het BEFORE TRUNCATE ON mot_cua.wiki_van_ban_lich_su
  FOR EACH STATEMENT EXECUTE FUNCTION mot_cua_noi_bo.chan_xoa_wiki();

-- 4. Kiểm toán ------------------------------------------------------------------------------
CREATE FUNCTION mot_cua_noi_bo.kiem_toan_wiki() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hanh_dong text;
  v_doi text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_hanh_dong := 'wiki.them';
  ELSIF NEW.phien_ban = OLD.phien_ban THEN
    RETURN NULL;  -- không đổi gì
  ELSIF NEW.trang_thai <> OLD.trang_thai THEN
    v_hanh_dong := CASE WHEN NEW.trang_thai = 'het_hieu_luc' THEN 'wiki.ngung_hieu_luc' ELSE 'wiki.hieu_luc_lai' END;
  ELSE
    v_hanh_dong := 'wiki.sua';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_doi := ARRAY(
      SELECT n.key FROM jsonb_each(to_jsonb(NEW)) n JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
       WHERE n.value IS DISTINCT FROM o.value
         AND n.key NOT IN ('phien_ban', 'nguoi_sua_sub', 'sua_luc')
       ORDER BY n.key);
  END IF;
  PERFORM mot_cua_noi_bo.ghi_kiem_toan(v_hanh_dong, 'wiki_van_ban', NEW.id::text,
    jsonb_build_object('loai', NEW.loai, 'phamVi', NEW.pham_vi, 'linhVucId', NEW.linh_vuc_id,
                       'trangThai', NEW.trang_thai, 'phienBan', NEW.phien_ban,
                       'sha256NoiDung', encode(sha256(convert_to(NEW.noi_dung, 'UTF8')), 'hex'))
      || CASE WHEN v_doi IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('truongDoi', to_jsonb(v_doi)) END,
    NEW.nguoi_sua_sub);
  RETURN NULL;
END
$$;
CREATE TRIGGER kiem_toan AFTER INSERT OR UPDATE ON mot_cua.wiki_van_ban
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.kiem_toan_wiki();
REVOKE ALL ON FUNCTION mot_cua_noi_bo.wiki_truoc_ghi(), mot_cua_noi_bo.chan_xoa_wiki(),
  mot_cua_noi_bo.kiem_toan_wiki() FROM PUBLIC;
COMMENT ON COLUMN mot_cua.nhat_ky_kiem_toan.hanh_dong IS
  'ho_so.nop · ho_so.chuyen_trang_thai · ho_so.cap_nhat · ho_so.xoa · quy_trinh.xu_ly_buoc · quy_trinh.dong_bo · tep.tai_len · tep.kiem_tra · giay_to.ky · giay_to.khai · giay_to.doc · giay_to.xac_nhan · van_ban.vao_so · van_ban.du_thao · van_ban.ky · wiki.them · wiki.sua · wiki.ngung_hieu_luc · wiki.hieu_luc_lai · thu_tuc.them · thu_tuc.nap_goi · thu_tuc.rut_goi · can_bo.them_linh_vuc · can_bo.bo_linh_vuc · kiem_toan.khoi_tao';

-- 5. Tìm dự phòng khi Meilisearch không chạy ------------------------------------------------------
-- Chạy với quyền người gọi (RLS áp dụng). So khớp không phân biệt hoa thường và dấu tiếng Việt (bỏ dấu bằng
-- translate, không cần extension unaccent).
CREATE FUNCTION mot_cua.tim_wiki(p_q text DEFAULT '', p_tat_ca boolean DEFAULT false, p_so_luong integer DEFAULT 20)
RETURNS SETOF mot_cua.wiki_van_ban
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH t AS (
    SELECT 'àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸ'::text AS co,
           'aaaaeeeiioooouuyadiuouaaaaaaaaaaaaeeeeeeeeiioooooooooooouuuuuuuyyyyaaaaeeeiioooouuyadiuouaaaaaaaaaaaaeeeeeeeeiioooooooooooouuuuuuuyyyy'::text AS khong)
  SELECT w.*
    FROM mot_cua.wiki_van_ban w, t
   WHERE (p_tat_ca OR w.trang_thai = 'hieu_luc')
     AND strpos(lower(translate(w.tieu_de || ' ' || coalesce(w.so_ky_hieu, '') || ' ' || coalesce(w.tom_tat, '')
                                || ' ' || w.noi_dung, t.co, t.khong)),
                lower(translate(btrim(coalesce(p_q, '')), t.co, t.khong))) > 0
   ORDER BY w.sua_luc DESC, w.id
   LIMIT least(greatest(coalesce(p_so_luong, 20), 1), 100)
$$;
REVOKE ALL ON FUNCTION mot_cua.tim_wiki(text, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mot_cua.tim_wiki(text, boolean, integer) TO can_bo, lanh_dao, van_thu;

-- 6. Quyền và RLS ----------------------------------------------------------------------------
GRANT SELECT ON mot_cua.wiki_van_ban, mot_cua.wiki_van_ban_lich_su TO can_bo, lanh_dao, van_thu;
GRANT SELECT ON mot_cua.wiki_van_ban TO dich_vu_tep;  -- mot-cua-api dựng lại chỉ mục Meilisearch
GRANT INSERT (tieu_de, loai, so_ky_hieu, ngay_ban_hanh, tom_tat, noi_dung, pham_vi, linh_vuc_id, trang_thai)
  ON mot_cua.wiki_van_ban TO van_thu, lanh_dao;
GRANT UPDATE (tieu_de, loai, so_ky_hieu, ngay_ban_hanh, tom_tat, noi_dung, pham_vi, linh_vuc_id, trang_thai)
  ON mot_cua.wiki_van_ban TO van_thu, lanh_dao;
-- pgAudit: theo dõi ghi vào wiki ở mức câu lệnh (#75).
GRANT INSERT, UPDATE, DELETE ON mot_cua.wiki_van_ban, mot_cua.wiki_van_ban_lich_su TO dxos_kiem_toan;
-- Văn thư chọn lĩnh vực khi soạn văn bản wiki.
GRANT SELECT ON mot_cua.linh_vuc TO van_thu;
CREATE POLICY van_thu_doc_linh_vuc ON mot_cua.linh_vuc FOR SELECT TO van_thu USING (true);

ALTER TABLE mot_cua.wiki_van_ban ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.wiki_van_ban FORCE ROW LEVEL SECURITY;
-- Lịch sử chỉ được thêm bởi trigger wiki_truoc_ghi (SECURITY DEFINER, chủ là role chạy migration, bỏ qua RLS như
-- ghi_kiem_toan của 007); role API không có quyền ghi.
ALTER TABLE mot_cua.wiki_van_ban_lich_su ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.wiki_van_ban_lich_su FORCE ROW LEVEL SECURITY;

CREATE POLICY can_bo_xem_wiki ON mot_cua.wiki_van_ban FOR SELECT TO can_bo
  USING (pham_vi = 'toan_xa' OR (pham_vi = 'linh_vuc' AND mot_cua_noi_bo.phu_trach_linh_vuc(linh_vuc_id)));
CREATE POLICY van_thu_xem_wiki ON mot_cua.wiki_van_ban FOR SELECT TO van_thu USING (pham_vi <> 'lanh_dao');
CREATE POLICY lanh_dao_xem_wiki ON mot_cua.wiki_van_ban FOR SELECT TO lanh_dao USING (true);
CREATE POLICY dich_vu_tep_xem_wiki ON mot_cua.wiki_van_ban FOR SELECT TO dich_vu_tep USING (true);
CREATE POLICY van_thu_them_wiki ON mot_cua.wiki_van_ban FOR INSERT TO van_thu WITH CHECK (pham_vi <> 'lanh_dao');
CREATE POLICY lanh_dao_them_wiki ON mot_cua.wiki_van_ban FOR INSERT TO lanh_dao WITH CHECK (true);
CREATE POLICY van_thu_sua_wiki ON mot_cua.wiki_van_ban FOR UPDATE TO van_thu
  USING (pham_vi <> 'lanh_dao') WITH CHECK (pham_vi <> 'lanh_dao');
CREATE POLICY lanh_dao_sua_wiki ON mot_cua.wiki_van_ban FOR UPDATE TO lanh_dao USING (true) WITH CHECK (true);
-- Lịch sử: ai thấy văn bản thì thấy các phiên bản cũ của nó (truy vấn con chịu RLS của wiki_van_ban).
CREATE POLICY xem_lich_su_wiki ON mot_cua.wiki_van_ban_lich_su FOR SELECT TO can_bo, lanh_dao, van_thu
  USING (EXISTS (SELECT 1 FROM mot_cua.wiki_van_ban w WHERE w.id = van_ban_id));

-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Bộ máy một cửa – sổ văn bản đến/đi của xã có ký số (#78).
-- nen-tang/scripts/tang2-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- Nghiệp vụ hành chính của xã (không phải thủ tục công dân, nên ở bộ máy, không ở thu-tuc/):
--   đến  văn thư vào sổ văn bản nhận được: tệp quét đi qua ClamAV, lưu Garage (như tệp hồ sơ), PDF có
--        chữ ký số thì xác minh và lưu kết quả; số đến cấp ngay khi vào sổ.
--   đi   văn thư soạn dự thảo; lãnh đạo ký: số đi cấp lúc ký (không cấp cho dự thảo bị bỏ), PDF sinh từ
--        mẫu bằng Gotenberg, ký PAdES bằng lớp ký số của #77, lưu Garage.
-- Ghi bằng tài khoản dịch vụ `dich_vu_tep` của mot-cua-api sau khi kiểm vai người gọi (văn thư nhập, lãnh
-- đạo ký); cán bộ, lãnh đạo, văn thư đọc sổ qua /api (RLS). Văn bản đã vào sổ/đã ký không sửa được.
-- Số văn bản: liền theo năm và chiều, không trùng khi ghi đồng thời (bảng đếm, khóa dòng).

-- 1. Vai văn thư -------------------------------------------------------------------
-- Trùng tên client role `van_thu` của dxos_api (mot-cua/keycloak/realm.json, nhóm /van-thu, bắt OTP).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'van_thu') THEN
    CREATE ROLE van_thu NOLOGIN;
  END IF;
END
$$;
GRANT van_thu TO authenticator;

-- Vai văn thư là role API: kiểm toán ghi nguồn "api" cho thay đổi của nó (006, 007).
CREATE OR REPLACE FUNCTION mot_cua_noi_bo.la_role_api(r name) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT r IN ('authenticator', 'anon', 'cong_dan', 'can_bo', 'lanh_dao', 'van_thu',
               'dich_vu_tep', 'dich_vu_su_kien', 'dich_vu_danh_muc', 'dich_vu_bao_cao')
$$;

-- 2. Bảng ---------------------------------------------------------------------------
CREATE TABLE mot_cua.van_ban (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chieu               text NOT NULL CHECK (chieu IN ('den', 'di')),
  trang_thai          text NOT NULL CHECK (trang_thai IN ('da_vao_so', 'du_thao', 'da_ky')),
  nam                 integer,
  so                  integer CHECK (so > 0),
  ky_hieu             text CHECK (length(btrim(ky_hieu)) BETWEEN 1 AND 60),
  loai                text NOT NULL CHECK (length(btrim(loai)) BETWEEN 1 AND 60),
  ngay_van_ban        date,
  trich_yeu           text NOT NULL CHECK (length(btrim(trich_yeu)) BETWEEN 1 AND 500),
  noi_gui             text CHECK (length(noi_gui) <= 300),
  noi_nhan            text CHECK (length(noi_nhan) <= 1000),
  nguoi_ky            text CHECK (length(nguoi_ky) <= 200),
  nguoi_ky_sub        text,
  noi_dung            text CHECK (length(noi_dung) <= 20000),
  ten_tep             text CHECK (length(btrim(ten_tep)) BETWEEN 1 AND 255),
  loai_mime           text,
  kich_thuoc          bigint CHECK (kich_thuoc > 0),
  sha256              text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  object_key          text UNIQUE CHECK (object_key LIKE 'van-ban/%'),
  chung_thu_so_hieu   text,
  xac_minh_chu_ky     jsonb,
  nguoi_tao_sub       text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  ky_luc              timestamptz,
  UNIQUE (chieu, nam, so),
  -- Văn bản đến: vào sổ là xong (có số, có tệp). Văn bản đi: dự thảo chưa có tệp; đã ký thì đủ số,
  -- ngày, người ký, PDF đã ký.
  CHECK (chieu = 'di' OR (trang_thai = 'da_vao_so' AND so IS NOT NULL AND object_key IS NOT NULL
                          AND sha256 IS NOT NULL AND noi_gui IS NOT NULL AND ngay_van_ban IS NOT NULL)),
  CHECK (chieu = 'den' OR trang_thai IN ('du_thao', 'da_ky')),
  CHECK (trang_thai <> 'da_ky' OR (so IS NOT NULL AND ngay_van_ban IS NOT NULL AND nguoi_ky_sub IS NOT NULL
                                   AND object_key IS NOT NULL AND sha256 IS NOT NULL AND ky_luc IS NOT NULL))
);
CREATE INDEX ON mot_cua.van_ban (chieu, nam, so);
COMMENT ON TABLE mot_cua.van_ban IS
  'Sổ văn bản đến/đi của xã (#78). Ghi qua mot-cua-api (dich_vu_tep); đã vào sổ hoặc đã ký thì không sửa';
COMMENT ON COLUMN mot_cua.van_ban.so IS 'Số thứ tự trong sổ theo năm và chiều, liền từ 1; văn bản đi cấp lúc ký';
COMMENT ON COLUMN mot_cua.van_ban.ky_hieu IS 'Văn bản đi: "<số>/<ký hiệu loại>-<cơ quan>" do CSDL ghép lúc cấp số; văn bản đến: ký hiệu của văn bản nhận được';
COMMENT ON COLUMN mot_cua.van_ban.xac_minh_chu_ky IS 'Văn bản đến là PDF: kết quả xác minh chữ ký số lúc vào sổ (pyHanko, theo CA của xã)';
COMMENT ON COLUMN mot_cua.van_ban.sha256 IS 'SHA-256 của tệp đã lưu (văn bản đi: PDF ĐÃ KÝ); cũng nằm trong nhật ký kiểm toán';

-- Bộ đếm số theo năm và chiều: một dòng mỗi (chiều, năm), cập nhật bằng UPSERT nên hai giao dịch cấp số
-- cùng lúc thì một cái chờ cái kia (khóa dòng) và nhận số kế tiếp.
CREATE TABLE mot_cua.so_van_ban_dem (
  chieu   text NOT NULL CHECK (chieu IN ('den', 'di')),
  nam     integer NOT NULL,
  so_cuoi integer NOT NULL CHECK (so_cuoi > 0),
  PRIMARY KEY (chieu, nam)
);
COMMENT ON TABLE mot_cua.so_van_ban_dem IS 'Số cuối đã cấp trong sổ văn bản theo (chiều, năm) (#78)';

CREATE FUNCTION mot_cua_noi_bo.cap_so_van_ban(p_chieu text, p_nam integer) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO mot_cua.so_van_ban_dem AS d (chieu, nam, so_cuoi) VALUES (p_chieu, p_nam, 1)
  ON CONFLICT (chieu, nam) DO UPDATE SET so_cuoi = d.so_cuoi + 1
  RETURNING so_cuoi
$$;
REVOKE ALL ON FUNCTION mot_cua_noi_bo.cap_so_van_ban(text, integer) FROM PUBLIC;

-- 3. Trigger: cấp số, chặn sửa ---------------------------------------------------------
CREATE FUNCTION mot_cua_noi_bo.van_ban_truoc_ghi() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ngay date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.chieu = 'den' THEN
      NEW.trang_thai := 'da_vao_so';
      NEW.nam := extract(year FROM v_ngay)::integer;
      NEW.so := mot_cua_noi_bo.cap_so_van_ban('den', NEW.nam);
    ELSE
      -- Dự thảo không có số, ngày, tệp, người ký: chỉ lúc ký mới có.
      NEW.trang_thai := 'du_thao';
      NEW.nam := NULL; NEW.so := NULL; NEW.ngay_van_ban := NULL; NEW.object_key := NULL; NEW.sha256 := NULL;
      NEW.nguoi_ky_sub := NULL; NEW.ky_luc := NULL;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.trang_thai IN ('da_vao_so', 'da_ky') THEN
    RAISE EXCEPTION 'Văn bản % đã vào sổ/đã ký, không sửa được', coalesce(OLD.ky_hieu, OLD.id::text)
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.chieu IS DISTINCT FROM OLD.chieu OR NEW.nguoi_tao_sub IS DISTINCT FROM OLD.nguoi_tao_sub
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Không đổi được chiều, người tạo của văn bản' USING ERRCODE = 'check_violation';
  END IF;
  -- Giữ số: lần chuẩn bị ký cấp một lần; ký lại sau lỗi dùng đúng số đó (không hở, không trùng).
  IF OLD.so IS NOT NULL AND (NEW.so IS DISTINCT FROM OLD.so OR NEW.nam IS DISTINCT FROM OLD.nam) THEN
    RAISE EXCEPTION 'Văn bản đã được cấp số %, không đổi được', OLD.so USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER truoc_ghi BEFORE INSERT OR UPDATE ON mot_cua.van_ban
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.van_ban_truoc_ghi();

CREATE FUNCTION mot_cua_noi_bo.chan_xoa_van_ban() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' OR OLD.trang_thai <> 'du_thao' THEN
    RAISE EXCEPTION 'Văn bản đã vào sổ/đã ký không xóa được' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END
$$;
CREATE TRIGGER chan_xoa BEFORE DELETE ON mot_cua.van_ban
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.chan_xoa_van_ban();
CREATE TRIGGER chan_xoa_het BEFORE TRUNCATE ON mot_cua.van_ban
  FOR EACH STATEMENT EXECUTE FUNCTION mot_cua_noi_bo.chan_xoa_van_ban();

-- 4. RPC chuẩn bị ký văn bản đi --------------------------------------------------------
-- POST /rpc/cap_so_van_ban_di {"p_id": …, "p_ky_hieu_loai": "TB", "p_co_quan": "UBND"} (chỉ dich_vu_tep,
-- sau khi mot-cua-api kiểm người gọi là lãnh đạo). Khóa dòng; chưa có số thì cấp số đi của năm hiện
-- tại, ghép ký hiệu "<số>/<loại>-<cơ quan>", đặt ngày văn bản = hôm nay; đã có số (lần ký trước lỗi
-- giữa chừng) thì trả lại đúng số đó. → {so, nam, kyHieu, ngayVanBan}. PDF in số này rồi mới ký.
CREATE FUNCTION mot_cua.cap_so_van_ban_di(p_id uuid, p_ky_hieu_loai text, p_co_quan text DEFAULT 'UBND')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v mot_cua.van_ban%ROWTYPE;
  v_ngay date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF p_ky_hieu_loai !~ '^[A-ZĐ][A-ZĐa-zđ]{0,9}$' OR p_co_quan !~ '^[A-ZĐ][A-ZĐa-zđ]{0,19}$' THEN
    RAISE EXCEPTION 'Ký hiệu loại/cơ quan chỉ gồm chữ cái, bắt đầu bằng chữ in hoa' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT * INTO v FROM mot_cua.van_ban WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v.chieu <> 'di' THEN
    RAISE EXCEPTION 'Không thấy văn bản đi %', p_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v.trang_thai <> 'du_thao' THEN
    RAISE EXCEPTION 'Văn bản % đã ký', v.ky_hieu USING ERRCODE = 'check_violation';
  END IF;
  IF v.so IS NULL THEN
    v.nam := extract(year FROM v_ngay)::integer;
    v.so := mot_cua_noi_bo.cap_so_van_ban('di', v.nam);
    v.ky_hieu := v.so || '/' || p_ky_hieu_loai || '-' || p_co_quan;
    UPDATE mot_cua.van_ban SET nam = v.nam, so = v.so, ky_hieu = v.ky_hieu, ngay_van_ban = v_ngay WHERE id = p_id;
    v.ngay_van_ban := v_ngay;
  END IF;
  RETURN jsonb_build_object('so', v.so, 'nam', v.nam, 'kyHieu', v.ky_hieu, 'ngayVanBan', v.ngay_van_ban);
END
$$;
COMMENT ON FUNCTION mot_cua.cap_so_van_ban_di(uuid, text, text) IS
  'Cấp (hoặc trả lại) số văn bản đi trước khi sinh PDF và ký (#78, chỉ dich_vu_tep)';

-- 5. Kiểm toán -------------------------------------------------------------------------
CREATE FUNCTION mot_cua_noi_bo.kiem_toan_van_ban() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM mot_cua_noi_bo.ghi_kiem_toan(
      CASE WHEN NEW.chieu = 'den' THEN 'van_ban.vao_so' ELSE 'van_ban.du_thao' END, 'van_ban', NEW.id::text,
      jsonb_build_object('chieu', NEW.chieu, 'nam', NEW.nam, 'so', NEW.so, 'kyHieu', NEW.ky_hieu, 'loai', NEW.loai,
                         'sha256', NEW.sha256, 'chuKyHopLe', NEW.xac_minh_chu_ky -> 'hopLe'),
      NEW.nguoi_tao_sub);
  ELSIF NEW.trang_thai = 'da_ky' AND OLD.trang_thai = 'du_thao' THEN
    PERFORM mot_cua_noi_bo.ghi_kiem_toan('van_ban.ky', 'van_ban', NEW.id::text,
      jsonb_build_object('chieu', 'di', 'nam', NEW.nam, 'so', NEW.so, 'kyHieu', NEW.ky_hieu, 'loai', NEW.loai,
                         'sha256', NEW.sha256, 'chungThu', NEW.chung_thu_so_hieu),
      NEW.nguoi_ky_sub);
  END IF;
  RETURN NULL;
END
$$;
CREATE TRIGGER kiem_toan AFTER INSERT OR UPDATE ON mot_cua.van_ban
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.kiem_toan_van_ban();
REVOKE ALL ON FUNCTION mot_cua_noi_bo.kiem_toan_van_ban(), mot_cua_noi_bo.van_ban_truoc_ghi() FROM PUBLIC;
COMMENT ON COLUMN mot_cua.nhat_ky_kiem_toan.hanh_dong IS
  'ho_so.nop · ho_so.chuyen_trang_thai · ho_so.cap_nhat · ho_so.xoa · quy_trinh.xu_ly_buoc · quy_trinh.dong_bo · tep.tai_len · tep.kiem_tra · giay_to.ky · van_ban.vao_so · van_ban.du_thao · van_ban.ky · thu_tuc.them · thu_tuc.nap_goi · thu_tuc.rut_goi · can_bo.them_linh_vuc · can_bo.bo_linh_vuc · kiem_toan.khoi_tao';

-- 6. Quyền và RLS ------------------------------------------------------------------------
GRANT USAGE ON SCHEMA mot_cua TO van_thu;
GRANT SELECT ON mot_cua.van_ban TO can_bo, lanh_dao, van_thu, dich_vu_tep;
GRANT INSERT (chieu, ky_hieu, loai, ngay_van_ban, trich_yeu, noi_gui, noi_nhan, nguoi_ky, noi_dung, ten_tep,
              loai_mime, kich_thuoc, sha256, object_key, xac_minh_chu_ky, nguoi_tao_sub)
  ON mot_cua.van_ban TO dich_vu_tep;
GRANT UPDATE (trang_thai, nguoi_ky, nguoi_ky_sub, ten_tep, loai_mime, kich_thuoc, sha256, object_key,
              chung_thu_so_hieu, ky_luc)
  ON mot_cua.van_ban TO dich_vu_tep;
REVOKE ALL ON FUNCTION mot_cua.cap_so_van_ban_di(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mot_cua.cap_so_van_ban_di(uuid, text, text) TO dich_vu_tep;
-- pgAudit: theo dõi ghi vào sổ văn bản ở mức câu lệnh (#75).
GRANT INSERT, UPDATE, DELETE ON mot_cua.van_ban TO dxos_kiem_toan;

ALTER TABLE mot_cua.van_ban ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.van_ban FORCE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.so_van_ban_dem ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.so_van_ban_dem FORCE ROW LEVEL SECURITY;
-- Sổ văn bản là công việc chung của cơ quan: cán bộ, lãnh đạo, văn thư đều xem; công dân thì không.
CREATE POLICY xem_van_ban ON mot_cua.van_ban
  FOR SELECT TO can_bo, lanh_dao, van_thu, dich_vu_tep USING (true);
CREATE POLICY dich_vu_tep_ghi_van_ban ON mot_cua.van_ban
  FOR INSERT TO dich_vu_tep WITH CHECK (true);
-- Dịch vụ chỉ cập nhật dự thảo (ký); trigger chặn mọi sửa sau khi vào sổ/ký, kể cả superuser.
CREATE POLICY dich_vu_tep_ky_van_ban ON mot_cua.van_ban
  FOR UPDATE TO dich_vu_tep USING (trang_thai = 'du_thao') WITH CHECK (true);

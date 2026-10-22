-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Ứng dụng Tầng 2 "mot-cua": schema đầy đủ tuần 2 (#5) – lĩnh vực, thủ tục, thành phần
-- yêu cầu, cán bộ và lĩnh vực phụ trách, hồ sơ, thành phần hồ sơ, ngày nghỉ; RLS theo
-- vai trò JWT và theo lĩnh vực cán bộ phụ trách.
--
-- core/scripts/app-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
-- Role cong_dan/can_bo/lanh_dao và quyền chuyển role cho authenticator đã có từ 001.
-- RLS dùng cơ chế chung của lõi: PostgREST SET ROLE theo claim JWT, policy đọc
-- dxos.jwt_sub() (core/postgres/initdb/10-core.sql).
--
-- Dữ liệu cá nhân của công dân ở mức tối thiểu: chỉ `sub` Keycloak (định danh), họ tên
-- và số điện thoại liên hệ (không bắt buộc). KHÔNG lưu số CCCD, ngày sinh, địa chỉ trong
-- CSDL: giấy tờ tùy thân là một thành phần hồ sơ (tệp ở Garage, #7), chỉ cán bộ phụ trách
-- lĩnh vực của hồ sơ được xem.

-- 0. Thay bảng mẫu tuần 1 ---------------------------------------------------------
-- Bản 001 (v0.0.1) chỉ là bảng giữ chỗ với dữ liệu giả: khóa `text`/`bigint`, lĩnh vực
-- dạng chữ, không có cán bộ hay thành phần hồ sơ. Không có triển khai thật nào dùng
-- v0.0.1, nên thay hẳn thay vì ALTER từng cột. Seed 001 bị bỏ, thay bằng seed 002.
DROP TABLE IF EXISTS mot_cua.ho_so;
DROP TABLE IF EXISTS mot_cua.thu_tuc;
DROP FUNCTION IF EXISTS mot_cua.ho_so_truoc_ghi();

COMMENT ON SCHEMA mot_cua IS 'Một cửa cấp xã: danh mục thủ tục, cán bộ, hồ sơ hành chính. Phơi ra PostgREST';

-- Schema nội bộ: hàm phụ trợ cho trigger và policy RLS. Không nằm trong
-- PGRST_DB_SCHEMAS (app.env) nên không thành RPC trên API.
CREATE SCHEMA mot_cua_noi_bo;
COMMENT ON SCHEMA mot_cua_noi_bo IS 'Một cửa: hàm nội bộ cho trigger và RLS. Không phơi ra PostgREST';

-- Trigger chung: cột updated_at do CSDL ghi, client không tự đặt.
CREATE FUNCTION mot_cua_noi_bo.dat_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- 1. Danh mục ---------------------------------------------------------------------
CREATE TABLE mot_cua.linh_vuc (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ma         text NOT NULL UNIQUE CHECK (ma ~ '^[a-z][a-z0-9_]{1,39}$'),
  ten        text NOT NULL CHECK (length(btrim(ten)) > 0),
  mo_ta      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE mot_cua.linh_vuc IS 'Lĩnh vực thủ tục (hộ tịch, chứng thực, đất đai…). Công khai';

CREATE TABLE mot_cua.thu_tuc (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ma            text NOT NULL UNIQUE CHECK (ma ~ '^[A-Z0-9][A-Z0-9_-]{1,29}$'),
  ten           text NOT NULL CHECK (length(btrim(ten)) > 0),
  linh_vuc_id   uuid NOT NULL REFERENCES mot_cua.linh_vuc (id),
  so_ngay_xu_ly integer NOT NULL CHECK (so_ngay_xu_ly BETWEEN 1 AND 365),
  le_phi        integer NOT NULL DEFAULT 0 CHECK (le_phi >= 0),
  ghi_chu_le_phi text,
  can_cu_phap_ly text,
  cong_khai     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON mot_cua.thu_tuc (linh_vuc_id);
COMMENT ON TABLE mot_cua.thu_tuc IS 'Danh mục thủ tục hành chính. Thủ tục cong_khai = true đọc được không cần đăng nhập';
COMMENT ON COLUMN mot_cua.thu_tuc.so_ngay_xu_ly IS 'Thời hạn giải quyết, tính bằng NGÀY LÀM VIỆC (bỏ thứ Bảy, Chủ nhật, mot_cua.ngay_nghi)';
COMMENT ON COLUMN mot_cua.thu_tuc.le_phi IS 'Phí/lệ phí (đồng). Cách tính chi tiết (theo trang, theo bản…) ở ghi_chu_le_phi';

-- Thành phần hồ sơ mà thủ tục yêu cầu. Bảng (không phải JSON trong cột) để kiểm
-- "đủ thành phần bắt buộc" bằng một truy vấn và sinh JSON Schema cho Poka-yoke (tuần 3):
-- xem mot_cua.json_schema_thu_tuc() bên dưới.
CREATE TABLE mot_cua.thanh_phan_yeu_cau (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thu_tuc_id  uuid NOT NULL REFERENCES mot_cua.thu_tuc (id) ON DELETE CASCADE,
  ma          text NOT NULL CHECK (ma ~ '^[a-z][a-z0-9_]{1,59}$'),
  ten         text NOT NULL CHECK (length(btrim(ten)) > 0),
  bat_buoc    boolean NOT NULL DEFAULT true,
  so_luong    integer NOT NULL DEFAULT 1 CHECK (so_luong BETWEEN 1 AND 20),
  ghi_chu     text,
  thu_tu      integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thu_tuc_id, ma)
);
COMMENT ON TABLE mot_cua.thanh_phan_yeu_cau IS 'Thành phần hồ sơ của từng thủ tục (bắt buộc / không), nguồn để sinh JSON Schema';

-- Ngày nghỉ lễ, Tết (kể cả nghỉ bù) không tính vào thời hạn. Thứ Bảy, Chủ nhật luôn nghỉ.
CREATE TABLE mot_cua.ngay_nghi (
  ngay       date PRIMARY KEY,
  ten        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE mot_cua.ngay_nghi IS 'Ngày nghỉ lễ/Tết của cơ quan hành chính, dùng tính hạn theo ngày làm việc';

-- 2. Cán bộ --------------------------------------------------------------------------
CREATE TABLE mot_cua.can_bo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub           text NOT NULL UNIQUE,
  ho_ten        text NOT NULL CHECK (length(btrim(ho_ten)) > 0),
  chuc_vu       text NOT NULL,
  dang_lam_viec boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE mot_cua.can_bo IS 'Cán bộ xã. sub = claim sub của người dùng Keycloak (role can_bo)';

CREATE TABLE mot_cua.can_bo_linh_vuc (
  can_bo_id   uuid NOT NULL REFERENCES mot_cua.can_bo (id) ON DELETE CASCADE,
  linh_vuc_id uuid NOT NULL REFERENCES mot_cua.linh_vuc (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (can_bo_id, linh_vuc_id)
);
CREATE INDEX ON mot_cua.can_bo_linh_vuc (linh_vuc_id);
COMMENT ON TABLE mot_cua.can_bo_linh_vuc IS 'Lĩnh vực cán bộ phụ trách: quyết định cán bộ thấy hồ sơ nào (RLS)';

-- 3. Hồ sơ -----------------------------------------------------------------------
CREATE SEQUENCE mot_cua.ma_ho_so_seq;

CREATE TABLE mot_cua.ho_so (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ma_ho_so         text NOT NULL UNIQUE,
  thu_tuc_id       uuid NOT NULL REFERENCES mot_cua.thu_tuc (id),
  nguoi_nop_sub    text NOT NULL DEFAULT dxos.jwt_sub(),
  ho_ten_nguoi_nop text NOT NULL CHECK (length(btrim(ho_ten_nguoi_nop)) BETWEEN 1 AND 200),
  so_dien_thoai    text CHECK (so_dien_thoai ~ '^0[0-9]{9}$'),
  trang_thai       text NOT NULL DEFAULT 'moi'
                   CHECK (trang_thai IN ('moi', 'dang_xu_ly', 'cho_bo_sung', 'hoan_tat', 'tu_choi')),
  ly_do            text,
  ngay_nhan        timestamptz NOT NULL DEFAULT now(),
  han_xu_ly        date,
  ngay_hoan_tat    timestamptz,
  can_bo_xu_ly_id  uuid REFERENCES mot_cua.can_bo (id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (trang_thai NOT IN ('cho_bo_sung', 'tu_choi') OR coalesce(length(btrim(ly_do)), 0) > 0),
  CHECK ((trang_thai IN ('hoan_tat', 'tu_choi')) = (ngay_hoan_tat IS NOT NULL))
);
CREATE INDEX ON mot_cua.ho_so (thu_tuc_id);
CREATE INDEX ON mot_cua.ho_so (nguoi_nop_sub);
CREATE INDEX ON mot_cua.ho_so (trang_thai, han_xu_ly);
COMMENT ON TABLE mot_cua.ho_so IS 'Hồ sơ một cửa. RLS: công dân thấy hồ sơ của mình, cán bộ thấy hồ sơ thuộc lĩnh vực phụ trách, lãnh đạo thấy tất cả';
COMMENT ON COLUMN mot_cua.ho_so.trang_thai IS 'moi → dang_xu_ly → cho_bo_sung → (dang_xu_ly) → hoan_tat | tu_choi. Chuyển sai bị trigger chặn';
COMMENT ON COLUMN mot_cua.ho_so.han_xu_ly IS 'Ngày ngay_nhan (giờ Việt Nam) cộng so_ngay_xu_ly ngày làm việc của thủ tục';
COMMENT ON COLUMN mot_cua.ho_so.ly_do IS 'Lý do yêu cầu bổ sung hoặc từ chối (bắt buộc ở hai trạng thái đó)';

-- Giấy tờ của hồ sơ: CHỈ metadata. Tệp thật nằm ở Garage (S3, #7) với khóa object_key.
CREATE TABLE mot_cua.thanh_phan_ho_so (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ho_so_id              uuid NOT NULL REFERENCES mot_cua.ho_so (id) ON DELETE CASCADE,
  thanh_phan_yeu_cau_id uuid REFERENCES mot_cua.thanh_phan_yeu_cau (id),
  ten_tep               text NOT NULL CHECK (length(btrim(ten_tep)) BETWEEN 1 AND 255),
  loai_mime             text NOT NULL CHECK (loai_mime ~ '^[a-z]+/[a-zA-Z0-9.+-]+$'),
  kich_thuoc            bigint NOT NULL CHECK (kich_thuoc BETWEEN 1 AND 52428800),
  sha256                text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  object_key            text UNIQUE,
  trang_thai_kiem_tra   text NOT NULL DEFAULT 'chua_kiem_tra'
                        CHECK (trang_thai_kiem_tra IN ('chua_kiem_tra', 'hop_le', 'khong_hop_le')),
  ghi_chu_kiem_tra      text,
  nguoi_kiem_tra_id     uuid REFERENCES mot_cua.can_bo (id),
  kiem_tra_luc          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON mot_cua.thanh_phan_ho_so (ho_so_id);
COMMENT ON TABLE mot_cua.thanh_phan_ho_so IS 'Giấy tờ đính kèm hồ sơ (metadata; tệp ở Garage, khóa object_key do dịch vụ tệp #7 ghi)';
COMMENT ON COLUMN mot_cua.thanh_phan_ho_so.thanh_phan_yeu_cau_id IS 'Loại thành phần theo danh mục của thủ tục; NULL = giấy tờ khác';

-- 4. Hàm nội bộ ------------------------------------------------------------------
-- Ngày làm việc: thứ Hai–Sáu và không nằm trong ngay_nghi.
CREATE FUNCTION mot_cua_noi_bo.la_ngay_lam_viec(d date) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT extract(isodow FROM d) < 6
     AND NOT EXISTS (SELECT 1 FROM mot_cua.ngay_nghi n WHERE n.ngay = d)
$$;

-- Hạn = ngày tiếp nhận + so_ngay ngày làm việc. Nộp vào ngày nghỉ (nộp trực tuyến) thì
-- coi như tiếp nhận vào ngày làm việc kế tiếp.
CREATE FUNCTION mot_cua_noi_bo.cong_ngay_lam_viec(tu date, so_ngay integer) RETURNS date
LANGUAGE plpgsql STABLE AS $$
DECLARE
  d   date := tu;
  con integer := so_ngay;
BEGIN
  IF so_ngay IS NULL OR so_ngay < 0 THEN
    RAISE EXCEPTION 'so_ngay phải >= 0, nhận %', so_ngay;
  END IF;
  WHILE NOT mot_cua_noi_bo.la_ngay_lam_viec(d) LOOP
    d := d + 1;
  END LOOP;
  WHILE con > 0 LOOP
    d := d + 1;
    IF mot_cua_noi_bo.la_ngay_lam_viec(d) THEN
      con := con - 1;
    END IF;
  END LOOP;
  RETURN d;
END
$$;

-- Hai hàm dưới đọc can_bo/can_bo_linh_vuc với quyền chủ hàm (SECURITY DEFINER) để policy
-- của ho_so không phụ thuộc quyền SELECT của người gọi trên các bảng đó. Chỉ đọc,
-- search_path rỗng, mọi tên đều đầy đủ schema.
CREATE FUNCTION mot_cua_noi_bo.can_bo_hien_tai() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id FROM mot_cua.can_bo c
   WHERE c.sub = dxos.jwt_sub() AND c.dang_lam_viec
$$;

-- Cán bộ đang gọi (theo sub) phụ trách lĩnh vực của thủ tục này?
CREATE FUNCTION mot_cua_noi_bo.phu_trach_thu_tuc(p_thu_tuc_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
      FROM mot_cua.thu_tuc t
      JOIN mot_cua.can_bo_linh_vuc cl ON cl.linh_vuc_id = t.linh_vuc_id
      JOIN mot_cua.can_bo c ON c.id = cl.can_bo_id
     WHERE t.id = p_thu_tuc_id
       AND c.sub = dxos.jwt_sub()
       AND c.dang_lam_viec)
$$;

-- Cán bộ p_can_bo_id có phụ trách lĩnh vực của thủ tục này không (dùng khi giao hồ sơ).
CREATE FUNCTION mot_cua_noi_bo.can_bo_phu_trach(p_can_bo_id uuid, p_thu_tuc_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
      FROM mot_cua.thu_tuc t
      JOIN mot_cua.can_bo_linh_vuc cl ON cl.linh_vuc_id = t.linh_vuc_id
      JOIN mot_cua.can_bo c ON c.id = cl.can_bo_id
     WHERE t.id = p_thu_tuc_id
       AND c.id = p_can_bo_id
       AND c.dang_lam_viec)
$$;

REVOKE ALL ON FUNCTION mot_cua_noi_bo.can_bo_hien_tai(),
                       mot_cua_noi_bo.phu_trach_thu_tuc(uuid),
                       mot_cua_noi_bo.can_bo_phu_trach(uuid, uuid) FROM PUBLIC;

-- 5. Trigger hồ sơ -----------------------------------------------------------------
-- INSERT: sinh mã hồ sơ, tính hạn theo ngày làm việc. UPDATE: chỉ cho chuyển trạng thái
-- hợp lệ, tự giao hồ sơ cho cán bộ nhận xử lý, ghi ngày hoàn tất.
CREATE FUNCTION mot_cua_noi_bo.ho_so_truoc_ghi() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  so_ngay integer;
  hop_le  text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ma_ho_so IS NULL THEN
      NEW.ma_ho_so := 'HS' || to_char(NEW.ngay_nhan AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD')
                      || '-' || lpad(nextval('mot_cua.ma_ho_so_seq')::text, 6, '0');
    END IF;
    SELECT t.so_ngay_xu_ly INTO so_ngay FROM mot_cua.thu_tuc t WHERE t.id = NEW.thu_tuc_id;
    IF so_ngay IS NOT NULL THEN
      NEW.han_xu_ly := mot_cua_noi_bo.cong_ngay_lam_viec(
        (NEW.ngay_nhan AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, so_ngay);
    END IF;
  ELSE
    IF NEW.trang_thai IS DISTINCT FROM OLD.trang_thai THEN
      hop_le := CASE OLD.trang_thai
        WHEN 'moi'         THEN ARRAY['dang_xu_ly', 'cho_bo_sung', 'tu_choi']
        WHEN 'dang_xu_ly'  THEN ARRAY['cho_bo_sung', 'hoan_tat', 'tu_choi']
        WHEN 'cho_bo_sung' THEN ARRAY['dang_xu_ly', 'tu_choi']
        ELSE ARRAY[]::text[]
      END;
      IF NOT NEW.trang_thai = ANY (hop_le) THEN
        RAISE EXCEPTION 'Không chuyển được hồ sơ % từ "%" sang "%"', OLD.ma_ho_so, OLD.trang_thai, NEW.trang_thai
          USING ERRCODE = 'check_violation';
      END IF;
      -- Cán bộ nhận xử lý hồ sơ chưa giao thì hồ sơ được giao cho chính cán bộ đó.
      IF NEW.can_bo_xu_ly_id IS NULL AND current_user = 'can_bo' THEN
        NEW.can_bo_xu_ly_id := mot_cua_noi_bo.can_bo_hien_tai();
      END IF;
    END IF;
    IF NEW.thu_tuc_id IS DISTINCT FROM OLD.thu_tuc_id OR NEW.ma_ho_so IS DISTINCT FROM OLD.ma_ho_so
       OR NEW.nguoi_nop_sub IS DISTINCT FROM OLD.nguoi_nop_sub OR NEW.ngay_nhan IS DISTINCT FROM OLD.ngay_nhan THEN
      RAISE EXCEPTION 'Không sửa được thủ tục, mã, người nộp hay ngày nhận của hồ sơ đã nộp'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.trang_thai IN ('hoan_tat', 'tu_choi') THEN
    NEW.ngay_hoan_tat := coalesce(NEW.ngay_hoan_tat, now());
  ELSE
    NEW.ngay_hoan_tat := NULL;
  END IF;
  IF NEW.can_bo_xu_ly_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.can_bo_xu_ly_id IS DISTINCT FROM OLD.can_bo_xu_ly_id)
     AND NOT mot_cua_noi_bo.can_bo_phu_trach(NEW.can_bo_xu_ly_id, NEW.thu_tuc_id) THEN
    RAISE EXCEPTION 'Cán bộ được giao không phụ trách lĩnh vực của thủ tục này'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER ho_so_truoc_ghi
  BEFORE INSERT OR UPDATE ON mot_cua.ho_so
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.ho_so_truoc_ghi();

-- Thành phần hồ sơ: loại thành phần phải thuộc đúng thủ tục của hồ sơ; cán bộ đổi
-- trạng thái kiểm tra thì ghi người và thời điểm kiểm tra.
CREATE FUNCTION mot_cua_noi_bo.thanh_phan_ho_so_truoc_ghi() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  thu_tuc_ho_so uuid;
BEGIN
  IF NEW.thanh_phan_yeu_cau_id IS NOT NULL THEN
    -- Đọc với quyền người gọi: hồ sơ không nhìn thấy thì để RLS từ chối ở bước sau.
    SELECT h.thu_tuc_id INTO thu_tuc_ho_so FROM mot_cua.ho_so h WHERE h.id = NEW.ho_so_id;
    IF thu_tuc_ho_so IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM mot_cua.thanh_phan_yeu_cau y
          WHERE y.id = NEW.thanh_phan_yeu_cau_id AND y.thu_tuc_id = thu_tuc_ho_so) THEN
      RAISE EXCEPTION 'Thành phần yêu cầu không thuộc thủ tục của hồ sơ'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.trang_thai_kiem_tra IS DISTINCT FROM OLD.trang_thai_kiem_tra THEN
    NEW.nguoi_kiem_tra_id := mot_cua_noi_bo.can_bo_hien_tai();
    NEW.kiem_tra_luc := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER thanh_phan_ho_so_truoc_ghi
  BEFORE INSERT OR UPDATE ON mot_cua.thanh_phan_ho_so
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.thanh_phan_ho_so_truoc_ghi();

CREATE TRIGGER dat_updated_at BEFORE UPDATE ON mot_cua.linh_vuc
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.dat_updated_at();
CREATE TRIGGER dat_updated_at BEFORE UPDATE ON mot_cua.thu_tuc
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.dat_updated_at();
CREATE TRIGGER dat_updated_at BEFORE UPDATE ON mot_cua.thanh_phan_yeu_cau
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.dat_updated_at();
CREATE TRIGGER dat_updated_at BEFORE UPDATE ON mot_cua.ngay_nghi
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.dat_updated_at();
CREATE TRIGGER dat_updated_at BEFORE UPDATE ON mot_cua.can_bo
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.dat_updated_at();

-- 6. RPC công khai: JSON Schema thành phần hồ sơ của một thủ tục ----------------------
-- GET /public/rpc/json_schema_thu_tuc?ma=KS01. Chạy với quyền người gọi nên anon chỉ
-- nhận được schema của thủ tục công khai. Poka-yoke (tuần 3) kiểm dữ liệu nộp lên theo
-- schema này trước khi khởi tạo quy trình Flowable. Dạng dữ liệu được kiểm:
--   {"thanh_phan": {"<ma thành phần>": ["<id thanh_phan_ho_so>", …], …}}
CREATE FUNCTION mot_cua.json_schema_thu_tuc(ma text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    '$schema', 'https://json-schema.org/draft/2020-12/schema',
    '$id', 'urn:dxos:mot-cua:thu-tuc:' || t.ma,
    'title', t.ten,
    'type', 'object',
    'required', jsonb_build_array('thanh_phan'),
    'properties', jsonb_build_object(
      'thanh_phan', jsonb_build_object(
        'type', 'object',
        'additionalProperties', false,
        'required', coalesce((SELECT jsonb_agg(y.ma ORDER BY y.thu_tu, y.ma)
                                FROM mot_cua.thanh_phan_yeu_cau y
                               WHERE y.thu_tuc_id = t.id AND y.bat_buoc), '[]'::jsonb),
        'properties', coalesce((SELECT jsonb_object_agg(y.ma, jsonb_strip_nulls(jsonb_build_object(
                                   'title', y.ten,
                                   'description', y.ghi_chu,
                                   'type', 'array',
                                   'items', jsonb_build_object('type', 'string', 'format', 'uuid'),
                                   'minItems', CASE WHEN y.bat_buoc THEN y.so_luong ELSE 0 END)))
                                  FROM mot_cua.thanh_phan_yeu_cau y
                                 WHERE y.thu_tuc_id = t.id), '{}'::jsonb))))
    FROM mot_cua.thu_tuc t
   WHERE t.ma = json_schema_thu_tuc.ma
$$;
COMMENT ON FUNCTION mot_cua.json_schema_thu_tuc(text) IS 'JSON Schema (2020-12) các thành phần hồ sơ của thủ tục, dùng cho Poka-yoke';

-- 7. Quyền (tối thiểu) -----------------------------------------------------------
-- Không role nào được ghi danh mục, cán bộ, ngày nghỉ qua API (quản trị bằng migration/SQL).
GRANT USAGE ON SCHEMA mot_cua TO anon, cong_dan, can_bo, lanh_dao;
-- Hàm nội bộ chỉ cần cho role có ghi (trigger) hoặc có policy gọi hàm (can_bo).
GRANT USAGE ON SCHEMA mot_cua_noi_bo TO cong_dan, can_bo;

GRANT SELECT ON mot_cua.linh_vuc, mot_cua.thu_tuc, mot_cua.thanh_phan_yeu_cau, mot_cua.ngay_nghi
  TO anon, cong_dan, can_bo, lanh_dao;
GRANT SELECT ON mot_cua.can_bo, mot_cua.can_bo_linh_vuc TO can_bo, lanh_dao;

-- Hồ sơ: quyền theo cột. Công dân không tự đặt người nộp, trạng thái lúc nộp, hạn hay
-- cán bộ xử lý; cán bộ chỉ đổi trạng thái, lý do, người xử lý.
GRANT SELECT ON mot_cua.ho_so TO cong_dan, can_bo, lanh_dao;
GRANT INSERT (thu_tuc_id, ho_ten_nguoi_nop, so_dien_thoai) ON mot_cua.ho_so TO cong_dan;
GRANT UPDATE (ho_ten_nguoi_nop, so_dien_thoai, trang_thai) ON mot_cua.ho_so TO cong_dan;
GRANT UPDATE (trang_thai, ly_do, can_bo_xu_ly_id) ON mot_cua.ho_so TO can_bo;
GRANT USAGE ON SEQUENCE mot_cua.ma_ho_so_seq TO cong_dan;

GRANT SELECT ON mot_cua.thanh_phan_ho_so TO cong_dan, can_bo, lanh_dao;
GRANT INSERT (ho_so_id, thanh_phan_yeu_cau_id, ten_tep, loai_mime, kich_thuoc, sha256)
  ON mot_cua.thanh_phan_ho_so TO cong_dan;
GRANT UPDATE (trang_thai_kiem_tra, ghi_chu_kiem_tra) ON mot_cua.thanh_phan_ho_so TO can_bo;

GRANT EXECUTE ON FUNCTION mot_cua_noi_bo.can_bo_hien_tai(),
                          mot_cua_noi_bo.phu_trach_thu_tuc(uuid),
                          mot_cua_noi_bo.can_bo_phu_trach(uuid, uuid) TO cong_dan, can_bo;
-- json_schema_thu_tuc, la_ngay_lam_viec, cong_ngay_lam_viec: EXECUTE mặc định cho PUBLIC.

-- 8. Row-Level Security: bật cho MỌI bảng của schema, kể cả chủ bảng ---------------
ALTER TABLE mot_cua.linh_vuc           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.thu_tuc            ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.thanh_phan_yeu_cau ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.ngay_nghi          ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.can_bo             ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.can_bo_linh_vuc    ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.ho_so              ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.thanh_phan_ho_so   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.linh_vuc           FORCE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.thu_tuc            FORCE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.thanh_phan_yeu_cau FORCE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.ngay_nghi          FORCE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.can_bo             FORCE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.can_bo_linh_vuc    FORCE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.ho_so              FORCE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.thanh_phan_ho_so   FORCE ROW LEVEL SECURITY;

-- Danh mục: người ngoài và công dân chỉ thấy thủ tục công khai; cán bộ, lãnh đạo thấy hết.
CREATE POLICY doc_linh_vuc ON mot_cua.linh_vuc
  FOR SELECT TO anon, cong_dan, can_bo, lanh_dao USING (true);
CREATE POLICY doc_ngay_nghi ON mot_cua.ngay_nghi
  FOR SELECT TO anon, cong_dan, can_bo, lanh_dao USING (true);
CREATE POLICY doc_thu_tuc_cong_khai ON mot_cua.thu_tuc
  FOR SELECT TO anon, cong_dan USING (cong_khai);
CREATE POLICY doc_thu_tuc_noi_bo ON mot_cua.thu_tuc
  FOR SELECT TO can_bo, lanh_dao USING (true);
-- Thành phần yêu cầu theo đúng quyền xem thủ tục (truy vấn con chịu RLS của thu_tuc).
CREATE POLICY doc_thanh_phan_yeu_cau ON mot_cua.thanh_phan_yeu_cau
  FOR SELECT TO anon, cong_dan, can_bo, lanh_dao
  USING (EXISTS (SELECT 1 FROM mot_cua.thu_tuc t WHERE t.id = thu_tuc_id));

CREATE POLICY doc_can_bo ON mot_cua.can_bo
  FOR SELECT TO can_bo, lanh_dao USING (true);
CREATE POLICY doc_can_bo_linh_vuc ON mot_cua.can_bo_linh_vuc
  FOR SELECT TO can_bo, lanh_dao USING (true);

-- Hồ sơ – công dân: thấy và nộp hồ sơ của mình (chỉ thủ tục công khai, trạng thái "moi");
-- sửa được duy nhất khi hồ sơ đang "cho_bo_sung", và chỉ để giữ nguyên hoặc báo đã bổ
-- sung (chuyển về "dang_xu_ly").
CREATE POLICY cong_dan_xem_ho_so ON mot_cua.ho_so
  FOR SELECT TO cong_dan
  USING (nguoi_nop_sub = dxos.jwt_sub());
CREATE POLICY cong_dan_nop_ho_so ON mot_cua.ho_so
  FOR INSERT TO cong_dan
  WITH CHECK (nguoi_nop_sub = dxos.jwt_sub()
              AND trang_thai = 'moi'
              AND can_bo_xu_ly_id IS NULL
              AND EXISTS (SELECT 1 FROM mot_cua.thu_tuc t WHERE t.id = thu_tuc_id AND t.cong_khai));
CREATE POLICY cong_dan_bo_sung_ho_so ON mot_cua.ho_so
  FOR UPDATE TO cong_dan
  USING (nguoi_nop_sub = dxos.jwt_sub() AND trang_thai = 'cho_bo_sung')
  WITH CHECK (nguoi_nop_sub = dxos.jwt_sub() AND trang_thai IN ('cho_bo_sung', 'dang_xu_ly'));

-- Hồ sơ – cán bộ: chỉ hồ sơ thuộc lĩnh vực mình phụ trách; cập nhật khi hồ sơ chưa đóng.
CREATE POLICY can_bo_xem_ho_so_linh_vuc ON mot_cua.ho_so
  FOR SELECT TO can_bo
  USING (mot_cua_noi_bo.phu_trach_thu_tuc(thu_tuc_id));
CREATE POLICY can_bo_xu_ly_ho_so_linh_vuc ON mot_cua.ho_so
  FOR UPDATE TO can_bo
  USING (mot_cua_noi_bo.phu_trach_thu_tuc(thu_tuc_id) AND trang_thai NOT IN ('hoan_tat', 'tu_choi'))
  WITH CHECK (mot_cua_noi_bo.phu_trach_thu_tuc(thu_tuc_id));

-- Hồ sơ – lãnh đạo: đọc tất cả, không có quyền ghi.
CREATE POLICY lanh_dao_xem_ho_so ON mot_cua.ho_so
  FOR SELECT TO lanh_dao USING (true);

-- Thành phần hồ sơ: theo quyền xem hồ sơ (truy vấn con chịu RLS của ho_so).
CREATE POLICY xem_thanh_phan_ho_so ON mot_cua.thanh_phan_ho_so
  FOR SELECT TO cong_dan, can_bo, lanh_dao
  USING (EXISTS (SELECT 1 FROM mot_cua.ho_so h WHERE h.id = ho_so_id));
-- Công dân đính kèm giấy tờ vào hồ sơ của mình khi hồ sơ mới nộp hoặc đang chờ bổ sung.
CREATE POLICY cong_dan_dinh_kem ON mot_cua.thanh_phan_ho_so
  FOR INSERT TO cong_dan
  WITH CHECK (trang_thai_kiem_tra = 'chua_kiem_tra'
              AND EXISTS (SELECT 1 FROM mot_cua.ho_so h
                           WHERE h.id = ho_so_id
                             AND h.nguoi_nop_sub = dxos.jwt_sub()
                             AND h.trang_thai IN ('moi', 'cho_bo_sung')));
-- Cán bộ kiểm tra giấy tờ của hồ sơ đang mở thuộc lĩnh vực mình phụ trách.
CREATE POLICY can_bo_kiem_tra_thanh_phan ON mot_cua.thanh_phan_ho_so
  FOR UPDATE TO can_bo
  USING (EXISTS (SELECT 1 FROM mot_cua.ho_so h
                  WHERE h.id = ho_so_id AND h.trang_thai NOT IN ('hoan_tat', 'tu_choi')))
  WITH CHECK (true);

-- anon: không có quyền và không có policy trên ho_so, thanh_phan_ho_so, can_bo,
-- can_bo_linh_vuc → không thấy dòng nào (PostgREST trả 401 khi chưa đăng nhập).

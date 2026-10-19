-- SPDX-License-Identifier: Apache-2.0
-- Khởi tạo CSDL mẫu cho lõi Tầng 1 (tuần 1, v0.0.1).
-- Chạy một lần khi volume PostgreSQL còn trống (docker-entrypoint-initdb.d).
-- Mật khẩu của role đăng nhập đặt ở 20-auth.sh từ biến môi trường, không ghi ở đây.
-- Mọi dữ liệu dưới đây là dữ liệu giả.

BEGIN;

-- 1. Role -------------------------------------------------------------------
-- authenticator: PostgREST đăng nhập bằng role này rồi SET ROLE theo claim JWT.
-- anon / cong_dan / can_bo / lanh_dao: role NOLOGIN, trùng tên client role
-- của client `commune_api` trong realm Keycloak `commune`.
DO $$
DECLARE
  r text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN;
  END IF;
  FOREACH r IN ARRAY ARRAY['anon', 'cong_dan', 'can_bo', 'lanh_dao'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END
$$;

GRANT anon, cong_dan, can_bo, lanh_dao TO authenticator;

-- 2. Schema -----------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS mot_cua;
COMMENT ON SCHEMA mot_cua IS 'Một cửa: danh mục thủ tục và hồ sơ hành chính (mẫu)';

-- Claim `sub` của JWT đang gọi. PostgREST đặt request.jwt.claims cho mỗi request.
CREATE OR REPLACE FUNCTION mot_cua.jwt_sub() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
$$;

CREATE TABLE mot_cua.thu_tuc (
  ma            text PRIMARY KEY,
  ten           text NOT NULL,
  linh_vuc      text NOT NULL,
  so_ngay_xu_ly integer NOT NULL CHECK (so_ngay_xu_ly > 0)
);
COMMENT ON TABLE mot_cua.thu_tuc IS 'Danh mục thủ tục hành chính, công khai (role anon đọc được)';

CREATE TABLE mot_cua.ho_so (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ma_thu_tuc       text NOT NULL REFERENCES mot_cua.thu_tuc (ma),
  nguoi_nop_sub    text NOT NULL DEFAULT mot_cua.jwt_sub(),
  ho_ten_nguoi_nop text NOT NULL,
  trang_thai       text NOT NULL DEFAULT 'moi_nop'
                   CHECK (trang_thai IN ('moi_nop', 'dang_xu_ly', 'bo_sung', 'hoan_tat', 'tu_choi')),
  nop_luc          timestamptz NOT NULL DEFAULT now(),
  han_xu_ly        timestamptz,
  cap_nhat_luc     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE mot_cua.ho_so IS 'Hồ sơ một cửa. Bật RLS: công dân chỉ thấy hồ sơ của mình';

-- Hạn xử lý tính từ danh mục thủ tục; thời điểm cập nhật do CSDL tự ghi.
CREATE OR REPLACE FUNCTION mot_cua.ho_so_truoc_ghi() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT now() + make_interval(days => t.so_ngay_xu_ly)
      INTO NEW.han_xu_ly
      FROM mot_cua.thu_tuc t
     WHERE t.ma = NEW.ma_thu_tuc;
  END IF;
  NEW.cap_nhat_luc := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER ho_so_truoc_ghi
  BEFORE INSERT OR UPDATE ON mot_cua.ho_so
  FOR EACH ROW EXECUTE FUNCTION mot_cua.ho_so_truoc_ghi();

-- 3. Quyền ------------------------------------------------------------------
-- Quyền theo cột: công dân không tự đặt được người nộp, trạng thái hay hạn xử lý.
GRANT USAGE ON SCHEMA mot_cua TO anon, cong_dan, can_bo, lanh_dao;
GRANT SELECT ON mot_cua.thu_tuc TO anon, cong_dan, can_bo, lanh_dao;
GRANT SELECT, INSERT (ma_thu_tuc, ho_ten_nguoi_nop) ON mot_cua.ho_so TO cong_dan;
GRANT SELECT, UPDATE (trang_thai) ON mot_cua.ho_so TO can_bo;
GRANT SELECT ON mot_cua.ho_so TO lanh_dao;

-- 4. Row-Level Security -----------------------------------------------------
ALTER TABLE mot_cua.ho_so ENABLE ROW LEVEL SECURITY;
-- Áp RLS cả với chủ bảng nếu chủ bảng không phải superuser.
ALTER TABLE mot_cua.ho_so FORCE ROW LEVEL SECURITY;

CREATE POLICY cong_dan_xem_ho_so_cua_minh ON mot_cua.ho_so
  FOR SELECT TO cong_dan
  USING (nguoi_nop_sub = mot_cua.jwt_sub());

CREATE POLICY cong_dan_nop_ho_so ON mot_cua.ho_so
  FOR INSERT TO cong_dan
  WITH CHECK (nguoi_nop_sub = mot_cua.jwt_sub() AND trang_thai = 'moi_nop');

-- Tuần 2: thu hẹp theo lĩnh vực được phân công (claim linh_vuc trong JWT).
CREATE POLICY can_bo_xem_ho_so ON mot_cua.ho_so
  FOR SELECT TO can_bo
  USING (true);

CREATE POLICY can_bo_xu_ly_ho_so_dang_mo ON mot_cua.ho_so
  FOR UPDATE TO can_bo
  USING (trang_thai NOT IN ('hoan_tat', 'tu_choi'))
  WITH CHECK (true);

CREATE POLICY lanh_dao_xem_tat_ca ON mot_cua.ho_so
  FOR SELECT TO lanh_dao
  USING (true);

-- Role anon không có policy nào trên ho_so, cũng không có quyền SELECT → không thấy hồ sơ.

-- 5. Dữ liệu mẫu (giả) ------------------------------------------------------
INSERT INTO mot_cua.thu_tuc (ma, ten, linh_vuc, so_ngay_xu_ly) VALUES
  ('KS01', 'Đăng ký khai sinh', 'ho_tich', 1),
  ('KH01', 'Đăng ký kết hôn', 'ho_tich', 5),
  ('CT01', 'Chứng thực bản sao từ bản chính', 'chung_thuc', 1);

-- sub giả; người dùng thật trong Keycloak có sub dạng UUID khác.
INSERT INTO mot_cua.ho_so (ma_thu_tuc, nguoi_nop_sub, ho_ten_nguoi_nop) VALUES
  ('KS01', '00000000-0000-0000-0000-00000000c001', 'Nguyễn Văn Mẫu'),
  ('CT01', '00000000-0000-0000-0000-00000000c002', 'Trần Thị Thử');

COMMIT;

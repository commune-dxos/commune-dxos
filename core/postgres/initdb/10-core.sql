-- SPDX-License-Identifier: Apache-2.0
-- Khởi tạo phần dùng chung của lõi Tầng 1. KHÔNG chứa bảng, thủ tục hay vai trò
-- nghiệp vụ: những thứ đó thuộc ứng dụng trong apps/<DXOS_APP>/db/ (xem
-- docs/architecture.md §2). Chạy một lần khi volume PostgreSQL còn trống
-- (docker-entrypoint-initdb.d). Mật khẩu role đăng nhập do dịch vụ db-init đặt theo OpenBao.

BEGIN;

-- 1. Role dùng chung --------------------------------------------------------
-- authenticator: PostgREST đăng nhập bằng role này rồi SET ROLE theo claim JWT.
-- anon: role khi request không có JWT (route /public/* của APISIX).
-- Role nghiệp vụ (NOLOGIN, trùng tên client role của `dxos_api` trong Keycloak)
-- do migration của ứng dụng tạo và tự `GRANT <role> TO authenticator`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END
$$;

GRANT anon TO authenticator;

-- 2. Schema dxos: hàm dùng chung cho policy RLS của mọi ứng dụng ---------------
CREATE SCHEMA IF NOT EXISTS dxos;
COMMENT ON SCHEMA dxos IS 'Lõi Tầng 1: hàm đọc claim JWT cho RLS, sổ ghi migration của ứng dụng. Không phơi ra PostgREST';

-- Toàn bộ claim của JWT đang gọi. PostgREST đặt request.jwt.claims cho mỗi request;
-- request ẩn danh (anon) trả về '{}'.
CREATE OR REPLACE FUNCTION dxos.jwt_claims() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

-- Một claim dạng text, ví dụ dxos.jwt_claim('preferred_username').
CREATE OR REPLACE FUNCTION dxos.jwt_claim(ten text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT dxos.jwt_claims() ->> ten
$$;

-- Claim `sub`: định danh ổn định của người dùng Keycloak, dùng làm chủ sở hữu dòng.
CREATE OR REPLACE FUNCTION dxos.jwt_sub() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT dxos.jwt_claim('sub')
$$;

-- Policy RLS chạy với quyền của role đang gọi nên mọi role phải dùng được các hàm trên.
GRANT USAGE ON SCHEMA dxos TO PUBLIC;
GRANT EXECUTE ON FUNCTION dxos.jwt_claims(), dxos.jwt_claim(text), dxos.jwt_sub() TO PUBLIC;

-- 3. Sổ ghi migration của ứng dụng ------------------------------------------
-- core/scripts/app-migrate.sh ghi mỗi tệp đã áp dụng kèm SHA-256 để chạy lại không lỗi
-- và phát hiện tệp migration bị sửa sau khi đã áp dụng. Không cấp quyền cho role nào.
CREATE TABLE IF NOT EXISTS dxos.app_migration (
  ung_dung   text NOT NULL,
  loai       text NOT NULL CHECK (loai IN ('migration', 'seed')),
  tep        text NOT NULL,
  sha256     text NOT NULL,
  ap_dung_luc timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ung_dung, loai, tep)
);
COMMENT ON TABLE dxos.app_migration IS 'Tệp SQL của apps/<ung_dung>/db/ đã áp dụng (do app-migrate ghi)';

COMMIT;

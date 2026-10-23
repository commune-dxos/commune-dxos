-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Test giấy tờ có ký số (#77, migration 008): chỉ dịch vụ tệp ghi; kết quả chỉ ghi được khi hồ sơ hoàn
-- tất; khóa object theo hồ sơ; mỗi hồ sơ một giấy tờ mỗi loại; không sửa; xem theo quyền xem hồ sơ;
-- phát hành ghi kiểm toán giay_to.ky kèm SHA-256 trong cùng transaction, chuỗi kiểm toán vẫn hợp lệ.
-- Cùng khung với kiem_toan.sql: một transaction rồi ROLLBACK, mỗi dòng in ra
-- KẾT_QUẢ|mô tả|mong đợi|thực tế (không dùng '|' trong giá trị). make test-sql và make smoke chạy tệp này.
\set ON_ERROR_STOP 1
BEGIN;

-- Khung test -----------------------------------------------------------------------
CREATE TEMP TABLE ket_qua (stt bigserial, mo_ta text, mong_doi text, thuc_te text);
GRANT SELECT, INSERT ON ket_qua TO PUBLIC;
GRANT USAGE ON SEQUENCE ket_qua_stt_seq TO PUBLIC;

CREATE FUNCTION pg_temp.vai(r text, s text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', r, true);
  PERFORM set_config('request.jwt.claims',
                     CASE WHEN s IS NULL THEN '' ELSE json_build_object('sub', s, 'role', r)::text END, true);
END
$$;

CREATE FUNCTION pg_temp.kiem(mo_ta text, mong_doi text, thuc_te text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO pg_temp.ket_qua (mo_ta, mong_doi, thuc_te) VALUES (mo_ta, mong_doi, thuc_te)
$$;

CREATE FUNCTION pg_temp.dem(cau text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || cau || ') x' INTO n;
  RETURN n::text;
EXCEPTION WHEN OTHERS THEN
  RETURN 'chặn ' || SQLSTATE;
END
$$;

-- thu(câu ghi) → "<n> dòng" hoặc "chặn <SQLSTATE>"; luôn hoàn tác (ném P0099 rồi bắt lại).
CREATE FUNCTION pg_temp.thu(cau text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  BEGIN
    EXECUTE cau;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = n || ' dòng';
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN RETURN SQLERRM;
    WHEN OTHERS THEN RETURN 'chặn ' || SQLSTATE;
  END;
END
$$;

-- gt(loại, khóa object, sha) → câu INSERT như mot-cua-api ghi (hồ sơ H1).
CREATE FUNCTION pg_temp.gt(p_loai text, p_khoa text, p_sha text) RETURNS text
LANGUAGE sql AS $$
  SELECT format('INSERT INTO mot_cua.giay_to_ky (ho_so_id, loai, object_key, sha256, kich_thuoc, chung_thu_ten, '
                'chung_thu_so_hieu, nguoi_yeu_cau_sub) VALUES (%L, %L, %L, %L, 1234, %L, %L, %L)',
                '7e577000-0000-4000-8000-000000000001', p_loai, p_khoa, p_sha, 'UBND xã Thử', '42', 'test-gt-cd-x')
$$;

-- Dữ liệu test (superuser) ---------------------------------------------------------------
-- Lĩnh vực A, B; thủ tục TEST_GT (A). Cán bộ CB_A phụ trách A, CB_B phụ trách B. Công dân X nộp H1.
INSERT INTO mot_cua.linh_vuc (id, ma, ten) VALUES
  ('7e577000-0000-4000-8000-0000000000a1', 'test_gt_a', 'Lĩnh vực test giấy tờ A'),
  ('7e577000-0000-4000-8000-0000000000b1', 'test_gt_b', 'Lĩnh vực test giấy tờ B');
INSERT INTO mot_cua.thu_tuc (id, ma, ten, linh_vuc_id, so_ngay_xu_ly, cong_khai) VALUES
  ('7e577000-0000-4000-8000-0000000000a2', 'TEST_GT', 'Thủ tục test giấy tờ', '7e577000-0000-4000-8000-0000000000a1', 2, true);
INSERT INTO mot_cua.can_bo (id, sub, ho_ten, chuc_vu) VALUES
  ('7e577000-0000-4000-8000-0000000000c1', 'test-gt-cb-a', 'Cán bộ test A', 'Thử'),
  ('7e577000-0000-4000-8000-0000000000c2', 'test-gt-cb-b', 'Cán bộ test B', 'Thử');
INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES
  ('7e577000-0000-4000-8000-0000000000c1', '7e577000-0000-4000-8000-0000000000a1'),
  ('7e577000-0000-4000-8000-0000000000c2', '7e577000-0000-4000-8000-0000000000b1');
\set H1 '''7e577000-0000-4000-8000-000000000001'''
\set K1 '''ho-so/7e577000-0000-4000-8000-000000000001/giay-to/bien_nhan-1.pdf'''
\set K2 '''ho-so/7e577000-0000-4000-8000-000000000001/giay-to/ket_qua-1.pdf'''
INSERT INTO mot_cua.ho_so (id, ma_ho_so, thu_tuc_id, nguoi_nop_sub, ho_ten_nguoi_nop) VALUES
  (:H1, 'TEST-GT-1', '7e577000-0000-4000-8000-0000000000a2', 'test-gt-cd-x', 'Công dân X');

-- 1. Ai ghi được, ghi gì được --------------------------------------------------------------
SELECT pg_temp.vai('cong_dan', 'test-gt-cd-x');
SELECT pg_temp.kiem('công dân (người nộp) tự ghi giấy tờ → chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.gt('bien_nhan', :K1, repeat('a', 64))));
SELECT pg_temp.vai('can_bo', 'test-gt-cb-a');
SELECT pg_temp.kiem('cán bộ phụ trách tự ghi giấy tờ → chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.gt('bien_nhan', :K1, repeat('a', 64))));
SELECT pg_temp.vai('lanh_dao', 'test-gt-ld');
SELECT pg_temp.kiem('lãnh đạo tự ghi giấy tờ → chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.gt('bien_nhan', :K1, repeat('a', 64))));
SELECT pg_temp.vai('dich_vu_tep', 'service-account-mot_cua_tep');
SELECT pg_temp.kiem('dịch vụ tệp ghi kết quả khi hồ sơ chưa hoàn tất → chặn (RLS)', 'chặn 42501',
  pg_temp.thu(pg_temp.gt('ket_qua', :K2, repeat('b', 64))));
SELECT pg_temp.kiem('dịch vụ tệp ghi khóa object của hồ sơ khác → chặn', 'chặn 23514',
  pg_temp.thu(pg_temp.gt('bien_nhan', 'ho-so/00000000-0000-4000-8000-000000000000/giay-to/x.pdf', repeat('a', 64))));
SELECT pg_temp.kiem('dịch vụ tệp ghi SHA-256 sai dạng → chặn', 'chặn 23514',
  pg_temp.thu(pg_temp.gt('bien_nhan', :K1, 'khong-phai-sha')));
SELECT pg_temp.kiem('dịch vụ tệp ghi loại giấy tờ lạ → chặn (RLS chặn trước CHECK)', 'chặn 42501',
  pg_temp.thu(pg_temp.gt('van_ban_di', :K1, repeat('a', 64))));
RESET ROLE;

-- 2. Phát hành biên nhận: kiểm toán cùng transaction ------------------------------------------
SELECT stt AS dau_truoc FROM mot_cua.dau_chuoi_kiem_toan \gset
SELECT pg_temp.vai('dich_vu_tep', 'service-account-mot_cua_tep');
SELECT pg_temp.kiem('dịch vụ tệp phát hành biên nhận → 1 dòng', '1 dòng', pg_temp.thu(pg_temp.gt('bien_nhan', :K1, repeat('a', 64))));
RESET ROLE;
SELECT pg_temp.kiem('phát hành bị hoàn tác → không để lại bản ghi kiểm toán', :'dau_truoc',
  (SELECT stt::text FROM mot_cua.dau_chuoi_kiem_toan));
SELECT pg_temp.vai('dich_vu_tep', 'service-account-mot_cua_tep');
SELECT pg_temp.gt('bien_nhan', :K1, repeat('a', 64)) AS cau \gset
:cau;
SELECT pg_temp.kiem('phát hành lần hai cùng loại → chặn (mỗi hồ sơ một biên nhận)', 'chặn 23505',
  pg_temp.thu(pg_temp.gt('bien_nhan', 'ho-so/7e577000-0000-4000-8000-000000000001/giay-to/bien_nhan-2.pdf', repeat('c', 64))));
RESET ROLE;
SELECT pg_temp.kiem('kiểm toán giay_to.ky ghi loại, SHA-256 PDF và người yêu cầu',
  'giay_to.ky bien_nhan ' || repeat('a', 64) || ' test-gt-cd-x TEST-GT-1', (
  SELECT hanh_dong || ' ' || (du_lieu ->> 'loai') || ' ' || (du_lieu ->> 'sha256') || ' ' || nguoi_sub || ' ' || (du_lieu ->> 'maHoSo')
    FROM mot_cua.nhat_ky_kiem_toan WHERE stt = :dau_truoc + 1));
SELECT pg_temp.vai('lanh_dao', 'test-gt-ld');
SELECT pg_temp.kiem('chuỗi kiểm toán vẫn hợp lệ sau khi phát hành', 'true', (mot_cua.xac_minh_kiem_toan() ->> 'hopLe'));
RESET ROLE;

-- 3. Không sửa, không xóa hết ---------------------------------------------------------------
SELECT pg_temp.kiem('superuser sửa SHA-256 giấy tờ → chặn', 'chặn 42501',
  pg_temp.thu($$UPDATE mot_cua.giay_to_ky SET sha256 = repeat('f', 64)$$));
SELECT pg_temp.kiem('superuser TRUNCATE giấy tờ → chặn', 'chặn 42501', pg_temp.thu('TRUNCATE mot_cua.giay_to_ky'));
SELECT pg_temp.vai('dich_vu_tep', 'service-account-mot_cua_tep');
SELECT pg_temp.kiem('dịch vụ tệp xóa giấy tờ → chặn (không có quyền)', 'chặn 42501', pg_temp.thu('DELETE FROM mot_cua.giay_to_ky'));
RESET ROLE;

-- 4. Xem theo quyền xem hồ sơ -------------------------------------------------------------
SELECT pg_temp.vai('cong_dan', 'test-gt-cd-x');
SELECT pg_temp.kiem('người nộp thấy giấy tờ của hồ sơ mình', '1', pg_temp.dem('SELECT 1 FROM mot_cua.giay_to_ky WHERE ho_so_id = ' || :'H1'));
SELECT pg_temp.vai('cong_dan', 'test-gt-cd-y');
SELECT pg_temp.kiem('công dân khác không thấy', '0', pg_temp.dem('SELECT 1 FROM mot_cua.giay_to_ky WHERE ho_so_id = ' || :'H1'));
SELECT pg_temp.vai('can_bo', 'test-gt-cb-a');
SELECT pg_temp.kiem('cán bộ phụ trách lĩnh vực thấy', '1', pg_temp.dem('SELECT 1 FROM mot_cua.giay_to_ky WHERE ho_so_id = ' || :'H1'));
SELECT pg_temp.vai('can_bo', 'test-gt-cb-b');
SELECT pg_temp.kiem('cán bộ lĩnh vực khác không thấy', '0', pg_temp.dem('SELECT 1 FROM mot_cua.giay_to_ky WHERE ho_so_id = ' || :'H1'));
SELECT pg_temp.vai('lanh_dao', 'test-gt-ld');
SELECT pg_temp.kiem('lãnh đạo thấy', '1', pg_temp.dem('SELECT 1 FROM mot_cua.giay_to_ky WHERE ho_so_id = ' || :'H1'));
SELECT pg_temp.vai('anon');
SELECT pg_temp.kiem('anon đọc giấy tờ → chặn', 'chặn 42501', pg_temp.dem('SELECT 1 FROM mot_cua.giay_to_ky'));
RESET ROLE;

-- 5. Kết quả sau khi hoàn tất -------------------------------------------------------------
UPDATE mot_cua.ho_so SET trang_thai = 'dang_xu_ly' WHERE id = :H1;
UPDATE mot_cua.ho_so SET trang_thai = 'hoan_tat' WHERE id = :H1;
SELECT pg_temp.vai('dich_vu_tep', 'service-account-mot_cua_tep');
SELECT pg_temp.kiem('hồ sơ hoàn tất → dịch vụ tệp phát hành kết quả', '1 dòng', pg_temp.thu(pg_temp.gt('ket_qua', :K2, repeat('b', 64))));
SELECT pg_temp.kiem('kết quả trùng SHA-256 của giấy tờ khác → chặn', 'chặn 23505', pg_temp.thu(pg_temp.gt('ket_qua', :K2, repeat('a', 64))));
RESET ROLE;

-- Kết quả -------------------------------------------------------------------------------
RESET ROLE;
SELECT CASE WHEN mong_doi IS NOT DISTINCT FROM thuc_te THEN 'ĐẠT' ELSE 'TRƯỢT' END,
       mo_ta, mong_doi, coalesce(thuc_te, 'NULL')
  FROM ket_qua ORDER BY stt;
SELECT count(*) FILTER (WHERE mong_doi IS DISTINCT FROM thuc_te) > 0 AS co_truot FROM ket_qua \gset
ROLLBACK;
\if :co_truot
  DO $$ BEGIN RAISE EXCEPTION 'Có kiểm tra giấy tờ ký số trượt'; END $$;
\endif

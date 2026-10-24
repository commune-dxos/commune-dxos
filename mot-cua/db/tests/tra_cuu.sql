-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Test tra cứu tiến độ hồ sơ không cần đăng nhập (#54, migration 012): đúng mã + 4 số cuối số điện thoại
-- thì thấy trạng thái và các mốc; sai mã, sai số, hồ sơ không khai số điện thoại đều NULL như nhau; kết quả
-- không chứa họ tên, số điện thoại, lý do; anon gọi được, không đọc thẳng bảng hồ sơ.
-- Cùng khung với van_ban.sql: một transaction rồi ROLLBACK, mỗi dòng in KẾT_QUẢ|mô tả|mong đợi|thực tế.
\set ON_ERROR_STOP 1
BEGIN;

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

-- Dữ liệu ---------------------------------------------------------------------------
INSERT INTO mot_cua.linh_vuc (id, ma, ten) VALUES
  ('7e5c0000-0000-4000-8000-0000000000a1', 'test_tc', 'Lĩnh vực test tra cứu');
INSERT INTO mot_cua.thu_tuc (id, ma, ten, linh_vuc_id, so_ngay_xu_ly, cong_khai) VALUES
  ('7e5c0000-0000-4000-8000-0000000000a2', 'TEST_TC', 'Thủ tục test tra cứu', '7e5c0000-0000-4000-8000-0000000000a1', 2, true);
INSERT INTO mot_cua.ho_so (id, ma_ho_so, thu_tuc_id, nguoi_nop_sub, ho_ten_nguoi_nop, so_dien_thoai) VALUES
  ('7e5c0000-0000-4000-8000-0000000000b1', 'HS20261024-TC0001', '7e5c0000-0000-4000-8000-0000000000a2',
   'test-tc-cd', 'Người Thử Tra Cứu', '0900001234'),
  ('7e5c0000-0000-4000-8000-0000000000b2', 'HS20261024-TC0002', '7e5c0000-0000-4000-8000-0000000000a2',
   'test-tc-cd', 'Người Không Số', NULL);
-- Hồ sơ 1 qua tiếp nhận rồi chờ bổ sung (lý do có thông tin cá nhân giả: không được lộ).
UPDATE mot_cua.ho_so SET trang_thai = 'dang_xu_ly' WHERE id = '7e5c0000-0000-4000-8000-0000000000b1';
UPDATE mot_cua.ho_so SET trang_thai = 'cho_bo_sung', ly_do = 'Bổ sung giấy chứng sinh của bé Người Thử Tra Cứu'
 WHERE id = '7e5c0000-0000-4000-8000-0000000000b1';

-- Kiểm tra --------------------------------------------------------------------------
SELECT pg_temp.vai('anon');
SELECT pg_temp.kiem('anon: đúng mã + 4 số cuối → trạng thái, thủ tục, hạn', 'cho_bo_sung TEST_TC true',
  (SELECT r ->> 'trang_thai' || ' ' || (r -> 'thu_tuc' ->> 'ma') || ' ' || (r ->> 'han_xu_ly' IS NOT NULL)
     FROM mot_cua.tra_cuu_ho_so('HS20261024-TC0001', '1234') r));
SELECT pg_temp.kiem('anon: các mốc trạng thái theo thứ tự', 'moi,dang_xu_ly,cho_bo_sung',
  (SELECT string_agg(m ->> 'trang_thai', ',' ORDER BY i)
     FROM jsonb_array_elements(mot_cua.tra_cuu_ho_so('HS20261024-TC0001', '1234') -> 'lich_su') WITH ORDINALITY AS x(m, i)));
SELECT pg_temp.kiem('mã viết thường, có khoảng trắng → vẫn khớp', 'cho_bo_sung',
  mot_cua.tra_cuu_ho_so('  hs20261024-tc0001 ', '1234') ->> 'trang_thai');
SELECT pg_temp.kiem('kết quả không có họ tên, số điện thoại, lý do, sub người nộp', 'không',
  CASE WHEN mot_cua.tra_cuu_ho_so('HS20261024-TC0001', '1234')::text ~ '(Người Thử|0900001234|giấy chứng sinh|test-tc-cd|ly_do|ho_ten)'
       THEN 'có' ELSE 'không' END);
SELECT pg_temp.kiem('sai 4 số cuối → NULL', 'NULL', coalesce(mot_cua.tra_cuu_ho_so('HS20261024-TC0001', '1235')::text, 'NULL'));
SELECT pg_temp.kiem('mã không tồn tại → NULL (giống sai số, không dò được mã)', 'NULL',
  coalesce(mot_cua.tra_cuu_ho_so('HS20261024-TC9999', '1234')::text, 'NULL'));
SELECT pg_temp.kiem('số cuối không phải 4 chữ số → NULL', 'NULL NULL NULL',
  coalesce(mot_cua.tra_cuu_ho_so('HS20261024-TC0001', '234')::text, 'NULL') || ' ' ||
  coalesce(mot_cua.tra_cuu_ho_so('HS20261024-TC0001', '01234')::text, 'NULL') || ' ' ||
  coalesce(mot_cua.tra_cuu_ho_so('HS20261024-TC0001', '12a4')::text, 'NULL'));
SELECT pg_temp.kiem('hồ sơ không khai số điện thoại → không tra cứu công khai được', 'NULL',
  coalesce(mot_cua.tra_cuu_ho_so('HS20261024-TC0002', '0000')::text, 'NULL'));
SELECT pg_temp.kiem('anon không đọc thẳng bảng hồ sơ, lịch sử', 'chặn 42501 chặn 42501',
  pg_temp.thu('SELECT * FROM mot_cua.ho_so') || ' ' || pg_temp.thu('SELECT * FROM mot_cua.lich_su_trang_thai'));
RESET ROLE;

SELECT pg_temp.vai('cong_dan', 'test-tc-khac');
SELECT pg_temp.kiem('công dân khác (đã đăng nhập) cũng tra cứu được bằng mã + 4 số, như người cầm biên nhận', 'cho_bo_sung',
  mot_cua.tra_cuu_ho_so('HS20261024-TC0001', '1234') ->> 'trang_thai');
RESET ROLE;

SELECT pg_temp.vai('can_bo', 'test-tc-cb');
SELECT pg_temp.kiem('vai khác (cán bộ) không gọi RPC này', 'chặn 42501',
  pg_temp.thu('SELECT mot_cua.tra_cuu_ho_so(''HS20261024-TC0001'', ''1234'')'));
RESET ROLE;

-- Kết quả -------------------------------------------------------------------------------
RESET ROLE;
SELECT CASE WHEN mong_doi IS NOT DISTINCT FROM thuc_te THEN 'ĐẠT' ELSE 'TRƯỢT' END,
       mo_ta, mong_doi, coalesce(thuc_te, 'NULL')
  FROM ket_qua ORDER BY stt;
SELECT count(*) FILTER (WHERE mong_doi IS DISTINCT FROM thuc_te) > 0 AS co_truot FROM ket_qua \gset
ROLLBACK;
\if :co_truot
  DO $$ BEGIN RAISE EXCEPTION 'Có kiểm tra tra cứu hồ sơ trượt'; END $$;
\endif

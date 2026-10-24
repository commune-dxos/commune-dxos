-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Test kho dữ liệu (#80, migration 009): tài khoản dịch vụ báo cáo chỉ đọc hồ sơ ĐÃ ĐÓNG và chỉ cột
-- không phải dữ liệu cá nhân (họ tên, số điện thoại, sub người nộp, lý do, người đổi trạng thái → 42501);
-- RPC nap_bao_cao chỉ cho dich_vu_bao_cao, thay nội dung bảng mart trong một transaction, bảng lạ hay
-- dữ liệu sai → không nạp gì; schema bao_cao chỉ mở cho role đọc bao_cao_doc của Superset (#82, migration 010).
-- Cùng khung với giay_to_ky.sql: một transaction rồi ROLLBACK, mỗi dòng in ra KẾT_QUẢ|mô tả|mong đợi|thực tế.
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

-- Dữ liệu test (superuser): hồ sơ H1 hoàn tất, H2 đang xử lý.
INSERT INTO mot_cua.linh_vuc (id, ma, ten) VALUES ('7e578000-0000-4000-8000-0000000000a1', 'test_bc_a', 'Lĩnh vực test báo cáo');
INSERT INTO mot_cua.thu_tuc (id, ma, ten, linh_vuc_id, so_ngay_xu_ly, cong_khai) VALUES
  ('7e578000-0000-4000-8000-0000000000a2', 'TEST_BC', 'Thủ tục test báo cáo', '7e578000-0000-4000-8000-0000000000a1', 2, true);
\set H1 '''7e578000-0000-4000-8000-000000000001'''
\set H2 '''7e578000-0000-4000-8000-000000000002'''
INSERT INTO mot_cua.ho_so (id, ma_ho_so, thu_tuc_id, nguoi_nop_sub, ho_ten_nguoi_nop, so_dien_thoai) VALUES
  (:H1, 'TEST-BC-1', '7e578000-0000-4000-8000-0000000000a2', 'test-bc-cd', 'Công dân Báo Cáo', '0911111111'),
  (:H2, 'TEST-BC-2', '7e578000-0000-4000-8000-0000000000a2', 'test-bc-cd', 'Công dân Báo Cáo', '0911111111');
UPDATE mot_cua.ho_so SET trang_thai = 'dang_xu_ly' WHERE id IN (:H1, :H2);
UPDATE mot_cua.ho_so SET trang_thai = 'hoan_tat' WHERE id = :H1;

-- 1. Đọc: chỉ hồ sơ đã đóng, chỉ cột không phải dữ liệu cá nhân --------------------------------
SELECT pg_temp.vai('dich_vu_bao_cao', 'service-account-mot_cua_bao_cao');
SELECT pg_temp.kiem('dịch vụ báo cáo thấy hồ sơ hoàn tất', '1',
  pg_temp.dem('SELECT id FROM mot_cua.ho_so WHERE id = ' || :'H1'));
SELECT pg_temp.kiem('dịch vụ báo cáo không thấy hồ sơ đang xử lý', '0',
  pg_temp.dem('SELECT id FROM mot_cua.ho_so WHERE id = ' || :'H2'));
SELECT pg_temp.kiem('dịch vụ báo cáo chỉ thấy hồ sơ đã đóng', '0',
  pg_temp.dem($$SELECT id FROM mot_cua.ho_so WHERE trang_thai NOT IN ('hoan_tat', 'tu_choi')$$));
SELECT pg_temp.kiem('đọc cột báo cáo của hồ sơ (mã, thủ tục, thời điểm) → được', '1', pg_temp.dem(
  'SELECT id, ma_ho_so, thu_tuc_id, trang_thai, ngay_nhan, han_xu_ly, ngay_hoan_tat FROM mot_cua.ho_so WHERE id = ' || :'H1'));
SELECT pg_temp.kiem('đọc họ tên người nộp → chặn', 'chặn 42501', pg_temp.dem('SELECT ho_ten_nguoi_nop FROM mot_cua.ho_so'));
SELECT pg_temp.kiem('đọc số điện thoại → chặn', 'chặn 42501', pg_temp.dem('SELECT so_dien_thoai FROM mot_cua.ho_so'));
SELECT pg_temp.kiem('đọc sub người nộp → chặn', 'chặn 42501', pg_temp.dem('SELECT nguoi_nop_sub FROM mot_cua.ho_so'));
SELECT pg_temp.kiem('đọc lý do → chặn', 'chặn 42501', pg_temp.dem('SELECT ly_do FROM mot_cua.ho_so'));
SELECT pg_temp.kiem('đọc * hồ sơ → chặn (có cột cá nhân)', 'chặn 42501', pg_temp.dem('SELECT * FROM mot_cua.ho_so'));
SELECT pg_temp.kiem('lịch sử của hồ sơ đã đóng → thấy, của hồ sơ đang xử lý → không', '3 0',
  pg_temp.dem('SELECT id FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = ' || :'H1') || ' '
  || pg_temp.dem('SELECT id FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = ' || :'H2'));
SELECT pg_temp.kiem('đọc người đổi trạng thái, lý do trong lịch sử → chặn', 'chặn 42501 chặn 42501',
  pg_temp.dem('SELECT nguoi_sub FROM mot_cua.lich_su_trang_thai') || ' ' || pg_temp.dem('SELECT ly_do FROM mot_cua.lich_su_trang_thai'));
SELECT pg_temp.kiem('ghi hồ sơ → chặn', 'chặn 42501', pg_temp.thu('UPDATE mot_cua.ho_so SET ma_ho_so = ma_ho_so'));
SELECT pg_temp.kiem('đọc tệp hồ sơ, nhật ký kiểm toán → chặn', 'chặn 42501 chặn 42501',
  pg_temp.dem('SELECT id FROM mot_cua.thanh_phan_ho_so') || ' ' || pg_temp.dem('SELECT stt FROM mot_cua.nhat_ky_kiem_toan'));
SELECT pg_temp.kiem('đọc danh mục, ngày nghỉ → được', 'có có có', (
  SELECT CASE WHEN pg_temp.dem('SELECT ma, ten, so_ngay_xu_ly, linh_vuc_id FROM mot_cua.thu_tuc') ~ '^[0-9]+$' THEN 'có' ELSE 'không' END || ' '
      || CASE WHEN pg_temp.dem('SELECT ma, ten FROM mot_cua.linh_vuc') ~ '^[0-9]+$' THEN 'có' ELSE 'không' END || ' '
      || CASE WHEN pg_temp.dem('SELECT ngay FROM mot_cua.ngay_nghi') ~ '^[0-9]+$' THEN 'có' ELSE 'không' END));
RESET ROLE;

-- 2. Nạp mart ---------------------------------------------------------------------------
\set FCT '{"fct_ho_so": [{"ho_so_id": "7e578000-0000-4000-8000-000000000001", "ma_ho_so": "TEST-BC-1", "thu_tuc": "TEST_BC", "ten_thu_tuc": "Thủ tục test", "linh_vuc": "test_bc_a", "ten_linh_vuc": "Lĩnh vực test", "ket_qua": "hoan_tat", "thang": "2026-10-01", "ngay_nhan": "2026-10-01T08:00:00", "ngay_hoan_tat": "2026-10-02T09:00:00", "han_xu_ly": "2026-10-05", "so_ngay_quy_dinh": 2, "so_gio_giai_quyet": 25.0, "so_ngay_lam_viec": 1, "so_lan_bo_sung": 0, "tre_han": false}], "hieu_suat_thang": [{"thang": "2026-10-01", "linh_vuc": "test_bc_a", "ten_linh_vuc": "Lĩnh vực test", "thu_tuc": "TEST_BC", "ten_thu_tuc": "Thủ tục test", "so_ho_so": 1, "so_hoan_tat": 1, "so_tu_choi": 0, "so_tre_han": 0, "ty_le_tre_han": 0.0, "tb_ngay_lam_viec": 1.0, "tb_gio_giai_quyet": 25.0}]}'
SELECT pg_temp.vai('cong_dan', 'test-bc-cd');
SELECT pg_temp.kiem('công dân gọi nap_bao_cao → chặn', 'chặn 42501', pg_temp.thu('SELECT mot_cua.nap_bao_cao(' || quote_literal(:'FCT') || ')'));
SELECT pg_temp.vai('lanh_dao', 'test-bc-ld');
SELECT pg_temp.kiem('lãnh đạo gọi nap_bao_cao → chặn', 'chặn 42501', pg_temp.thu('SELECT mot_cua.nap_bao_cao(' || quote_literal(:'FCT') || ')'));
SELECT pg_temp.kiem('lãnh đạo đọc bao_cao.hieu_suat_thang trực tiếp → chặn', 'chặn 42501', pg_temp.dem('SELECT * FROM bao_cao.hieu_suat_thang'));
SELECT pg_temp.vai('dich_vu_su_kien', 'service-account-mot_cua_su_kien');
SELECT pg_temp.kiem('dịch vụ sự kiện gọi nap_bao_cao → chặn', 'chặn 42501', pg_temp.thu('SELECT mot_cua.nap_bao_cao(' || quote_literal(:'FCT') || ')'));
SELECT pg_temp.vai('dich_vu_bao_cao', 'service-account-mot_cua_bao_cao');
SELECT pg_temp.kiem('dịch vụ báo cáo nạp bảng lạ → chặn, không nạp gì', 'chặn 22023',
  pg_temp.thu($$SELECT mot_cua.nap_bao_cao('{"fct_ho_so": [], "ho_so": []}')$$));
SELECT pg_temp.kiem('dịch vụ báo cáo đọc bao_cao trực tiếp → chặn (chỉ ghi qua RPC)', 'chặn 42501', pg_temp.dem('SELECT * FROM bao_cao.fct_ho_so'));
SELECT mot_cua.nap_bao_cao(:'FCT'::jsonb, 'run-1') AS kq \gset
RESET ROLE;
SELECT pg_temp.kiem('nạp lần 1: số dòng từng bảng', '{"fct_ho_so": 1, "hieu_suat_thang": 1}', :'kq');
SELECT pg_temp.kiem('nạp lần 1: dữ liệu đúng kiểu (thang date, tre_han boolean)', '2026-10-01 false 25.0', (
  SELECT f.thang || ' ' || f.tre_han || ' ' || f.so_gio_giai_quyet FROM bao_cao.fct_ho_so f));
SELECT pg_temp.vai('dich_vu_bao_cao', 'service-account-mot_cua_bao_cao');
SELECT mot_cua.nap_bao_cao(:'FCT'::jsonb, 'run-2') AS kq \gset
SELECT pg_temp.kiem('dữ liệu sai (tỷ lệ > 1) → lỗi, không thay bảng nào', 'chặn 23514', pg_temp.thu(
  'SELECT mot_cua.nap_bao_cao(' || quote_literal(jsonb_set(:'FCT'::jsonb, '{hieu_suat_thang,0,ty_le_tre_han}', '2')::text) || ')'));
RESET ROLE;
SELECT pg_temp.kiem('nạp lần 2 thay chứ không cộng dồn; lỗi không làm mất dữ liệu cũ', '1 1', (
  SELECT (SELECT count(*) FROM bao_cao.fct_ho_so) || ' ' || (SELECT count(*) FROM bao_cao.hieu_suat_thang)));
SELECT pg_temp.kiem('mỗi lần nạp ghi bao_cao.lan_nap kèm invocation dbt', 'run-1,run-2', (
  SELECT string_agg(dbt_run_id, ',' ORDER BY id) FROM bao_cao.lan_nap WHERE dbt_run_id LIKE 'run-%'));

-- 3. Role đọc báo cáo của Superset (#82, migration 010) ----------------------------------------
SET LOCAL ROLE bao_cao_doc;
SELECT pg_temp.kiem('bao_cao_doc đọc bao_cao.fct_ho_so, hieu_suat_thang, lan_nap', '1 1 2', (
  SELECT (SELECT count(*) FROM bao_cao.fct_ho_so) || ' ' || (SELECT count(*) FROM bao_cao.hieu_suat_thang) || ' '
      || (SELECT count(*) FROM bao_cao.lan_nap WHERE dbt_run_id LIKE 'run-%')));
SELECT pg_temp.kiem('bao_cao_doc đọc mot_cua.ho_so → chặn', 'chặn 42501', pg_temp.dem('SELECT 1 FROM mot_cua.ho_so'));
SELECT pg_temp.kiem('bao_cao_doc đọc mot_cua.nhat_ky_kiem_toan → chặn', 'chặn 42501', pg_temp.dem('SELECT 1 FROM mot_cua.nhat_ky_kiem_toan'));
SELECT pg_temp.kiem('bao_cao_doc ghi bao_cao.fct_ho_so → chặn', 'chặn 42501', pg_temp.thu('DELETE FROM bao_cao.fct_ho_so'));
SELECT pg_temp.kiem('bao_cao_doc gọi nap_bao_cao → chặn', 'chặn 42501',
  pg_temp.thu($$SELECT mot_cua.nap_bao_cao('{"fct_ho_so": []}')$$));
RESET ROLE;
SELECT pg_temp.kiem('bao_cao_doc không là thành viên role nào (không thừa hưởng quyền API)', '0', (
  SELECT count(*)::text FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = 'bao_cao_doc'));

-- Kết quả -------------------------------------------------------------------------------
RESET ROLE;
SELECT CASE WHEN mong_doi IS NOT DISTINCT FROM thuc_te THEN 'ĐẠT' ELSE 'TRƯỢT' END,
       mo_ta, mong_doi, coalesce(thuc_te, 'NULL')
  FROM ket_qua ORDER BY stt;
SELECT count(*) FILTER (WHERE mong_doi IS DISTINCT FROM thuc_te) > 0 AS co_truot FROM ket_qua \gset
ROLLBACK;
\if :co_truot
  DO $$ BEGIN RAISE EXCEPTION 'Có kiểm tra kho dữ liệu trượt'; END $$;
\endif

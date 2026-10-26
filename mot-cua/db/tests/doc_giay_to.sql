-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Test đọc giấy tờ bằng OCR + cán bộ xác nhận (#93, migration 015): chỉ dịch vụ tệp ghi; công dân, cán bộ đọc theo
-- RLS của hồ sơ; hồ sơ lấy theo tệp; máy đọc → cho_xac_nhan; cán bộ xác nhận → CSDL tính trường bị sửa, sau đó không
-- sửa được; nhật ký kiểm toán giay_to.khai, giay_to.doc, giay_to.xac_nhan không chứa giá trị (dữ liệu cá nhân).
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

-- Dữ liệu test (superuser) ---------------------------------------------------------------
-- Lĩnh vực A, B; thủ tục TEST_OCR (A). Cán bộ CB_A phụ trách A, CB_B phụ trách B. Công dân X nộp H1 có tệp T1, T2;
-- công dân Y nộp H2 có tệp T3.
INSERT INTO mot_cua.linh_vuc (id, ma, ten) VALUES
  ('7e593000-0000-4000-8000-0000000000a1', 'test_ocr_a', 'Lĩnh vực test OCR A'),
  ('7e593000-0000-4000-8000-0000000000b1', 'test_ocr_b', 'Lĩnh vực test OCR B');
INSERT INTO mot_cua.thu_tuc (id, ma, ten, linh_vuc_id, so_ngay_xu_ly, cong_khai) VALUES
  ('7e593000-0000-4000-8000-0000000000a2', 'TEST_OCR', 'Thủ tục test OCR', '7e593000-0000-4000-8000-0000000000a1', 2, true);
INSERT INTO mot_cua.can_bo (id, sub, ho_ten, chuc_vu) VALUES
  ('7e593000-0000-4000-8000-0000000000c1', 'test-ocr-cb-a', 'Cán bộ test A', 'Thử'),
  ('7e593000-0000-4000-8000-0000000000c2', 'test-ocr-cb-b', 'Cán bộ test B', 'Thử');
INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES
  ('7e593000-0000-4000-8000-0000000000c1', '7e593000-0000-4000-8000-0000000000a1'),
  ('7e593000-0000-4000-8000-0000000000c2', '7e593000-0000-4000-8000-0000000000b1');
\set H1 '''7e593000-0000-4000-8000-000000000001'''
\set H2 '''7e593000-0000-4000-8000-000000000002'''
\set T1 '''7e593000-0000-4000-8000-0000000000f1'''
\set T3 '''7e593000-0000-4000-8000-0000000000f3'''
INSERT INTO mot_cua.ho_so (id, ma_ho_so, thu_tuc_id, nguoi_nop_sub, ho_ten_nguoi_nop) VALUES
  (:H1, 'TEST-OCR-1', '7e593000-0000-4000-8000-0000000000a2', 'test-ocr-cd-x', 'Công dân X'),
  (:H2, 'TEST-OCR-2', '7e593000-0000-4000-8000-0000000000a2', 'test-ocr-cd-y', 'Công dân Y');
INSERT INTO mot_cua.thanh_phan_ho_so (id, ho_so_id, ten_tep, loai_mime, kich_thuoc) VALUES
  (:T1, :H1, 'gcs.png', 'image/png', 1000),
  ('7e593000-0000-4000-8000-0000000000f2', :H1, 'tuy-than.png', 'image/png', 1000),
  (:T3, :H2, 'gcs.png', 'image/png', 1000);

-- Câu ghi như mot-cua-api khi công dân gửi trường đã khai (cố tình gửi sai hồ sơ H2 cho tệp T1 của H1).
CREATE FUNCTION pg_temp.khai() RETURNS text
LANGUAGE sql AS $$
  SELECT $q$INSERT INTO mot_cua.doc_giay_to (tep_id, ho_so_id, loai, truong_cong_dan)
            VALUES ('7e593000-0000-4000-8000-0000000000f1', '7e593000-0000-4000-8000-000000000002',
                    'giay_chung_sinh', '{"ho_ten_me": "Nguyễn Thị Mẫu"}')$q$
$$;

-- 1. Ai ghi được -------------------------------------------------------------------------------
SELECT pg_temp.vai('cong_dan', 'test-ocr-cd-x');
SELECT pg_temp.kiem('công dân tự ghi kết quả đọc → chặn', 'chặn 42501', pg_temp.thu(pg_temp.khai()));
SELECT pg_temp.vai('can_bo', 'test-ocr-cb-a');
SELECT pg_temp.kiem('cán bộ tự ghi kết quả đọc → chặn', 'chặn 42501', pg_temp.thu(pg_temp.khai()));
SELECT pg_temp.vai('lanh_dao', 'test-ocr-ld');
SELECT pg_temp.kiem('lãnh đạo tự ghi kết quả đọc → chặn', 'chặn 42501', pg_temp.thu(pg_temp.khai()));
RESET ROLE;

SELECT stt AS dau_truoc FROM mot_cua.dau_chuoi_kiem_toan \gset
SELECT pg_temp.vai('dich_vu_tep', 'service-account-mot_cua_tep');
SELECT pg_temp.kiem('dịch vụ tệp ghi công dân khai → 1 dòng', '1 dòng', pg_temp.thu(pg_temp.khai()));
DO $$ BEGIN EXECUTE pg_temp.khai(); END $$;
SELECT pg_temp.kiem('hồ sơ lấy theo tệp, không theo dữ liệu gửi (gửi H2 → lưu H1)', 'TEST-OCR-1',
  (SELECT h.ma_ho_so FROM mot_cua.doc_giay_to d JOIN mot_cua.ho_so h ON h.id = d.ho_so_id WHERE d.tep_id = :T1));
SELECT pg_temp.kiem('chưa máy đọc → chua_doc, có giờ khai', 'chua_doc true',
  (SELECT trang_thai || ' ' || (khai_luc IS NOT NULL) FROM mot_cua.doc_giay_to WHERE tep_id = :T1));
SELECT pg_temp.kiem('dịch vụ tệp ghi loại sai dạng → chặn 23514', 'chặn 23514',
  pg_temp.thu($q$INSERT INTO mot_cua.doc_giay_to (tep_id, loai) VALUES ('7e593000-0000-4000-8000-0000000000f2', 'Giấy Lạ')$q$));
SELECT pg_temp.kiem('dịch vụ tệp ghi tệp không tồn tại → chặn (P0002)', 'chặn P0002',
  pg_temp.thu($q$INSERT INTO mot_cua.doc_giay_to (tep_id, loai) VALUES ('00000000-0000-4000-8000-000000000000', 'giay_chung_sinh')$q$));
-- Máy đọc (luồng nền của mot-cua-api).
UPDATE mot_cua.doc_giay_to SET truong_may = '{"ho_ten_me": {"gia_tri": "Nguyễn Thị Mẩu", "tin_cay": 0.81, "can_kiem_tra": true},
  "nam_sinh_me": {"gia_tri": "1995", "tin_cay": 0.93, "can_kiem_tra": false}}', mo_hinh = '{"nhan_dang": "VietOCR"}'
 WHERE tep_id = :T1;
SELECT pg_temp.kiem('máy đọc → cho_xac_nhan, có giờ đọc', 'cho_xac_nhan true',
  (SELECT trang_thai || ' ' || (doc_luc IS NOT NULL) FROM mot_cua.doc_giay_to WHERE tep_id = :T1));
SELECT pg_temp.kiem('dịch vụ tệp không đổi được loại giấy tờ (không có quyền cột)', 'chặn 42501',
  pg_temp.thu($q$UPDATE mot_cua.doc_giay_to SET loai = 'giay_to_tuy_than' WHERE tep_id = '7e593000-0000-4000-8000-0000000000f1'$q$));
SELECT pg_temp.kiem('xác nhận thiếu người xác nhận → chặn 23514', 'chặn 23514',
  pg_temp.thu($q$UPDATE mot_cua.doc_giay_to SET trang_thai = 'da_xac_nhan', truong_xac_nhan = '{}' WHERE tep_id = '7e593000-0000-4000-8000-0000000000f1'$q$));
INSERT INTO mot_cua.doc_giay_to (tep_id, loai) VALUES (:T3, 'giay_chung_sinh');
RESET ROLE;

-- 2. Ai đọc được ----------------------------------------------------------------------------------
SELECT pg_temp.vai('cong_dan', 'test-ocr-cd-x');
SELECT pg_temp.kiem('công dân X thấy kết quả của hồ sơ mình (1), không thấy của Y', '1',
  pg_temp.dem($q$SELECT 1 FROM mot_cua.doc_giay_to WHERE tep_id IN ('7e593000-0000-4000-8000-0000000000f1', '7e593000-0000-4000-8000-0000000000f3')$q$));
SELECT pg_temp.vai('can_bo', 'test-ocr-cb-a');
SELECT pg_temp.kiem('cán bộ phụ trách lĩnh vực thấy cả hai', '2',
  pg_temp.dem($q$SELECT 1 FROM mot_cua.doc_giay_to WHERE tep_id IN ('7e593000-0000-4000-8000-0000000000f1', '7e593000-0000-4000-8000-0000000000f3')$q$));
SELECT pg_temp.vai('can_bo', 'test-ocr-cb-b');
SELECT pg_temp.kiem('cán bộ lĩnh vực khác không thấy', '0',
  pg_temp.dem($q$SELECT 1 FROM mot_cua.doc_giay_to WHERE tep_id IN ('7e593000-0000-4000-8000-0000000000f1', '7e593000-0000-4000-8000-0000000000f3')$q$));
SELECT pg_temp.vai('anon');
SELECT pg_temp.kiem('anon đọc → chặn', 'chặn 42501', pg_temp.dem('SELECT 1 FROM mot_cua.doc_giay_to'));
RESET ROLE;

-- 3. Cán bộ xác nhận (qua dịch vụ tệp) -------------------------------------------------------------
SELECT pg_temp.vai('dich_vu_tep', 'service-account-mot_cua_tep');
UPDATE mot_cua.doc_giay_to SET trang_thai = 'da_xac_nhan', xac_nhan_boi_sub = 'test-ocr-cb-a',
  truong_xac_nhan = '{"ho_ten_me": "Nguyễn Thị Mẫu", "nam_sinh_me": "1995", "gioi_tinh_con": "Nam"}' WHERE tep_id = :T1;
SELECT pg_temp.kiem('xác nhận: CSDL tính trường cán bộ sửa so với máy (sửa họ tên, thêm giới tính)', '{gioi_tinh_con,ho_ten_me} true',
  (SELECT truong_da_sua::text || ' ' || (xac_nhan_luc IS NOT NULL) FROM mot_cua.doc_giay_to WHERE tep_id = :T1));
SELECT pg_temp.kiem('đã xác nhận → không sửa được nữa', 'chặn 42501',
  pg_temp.thu($q$UPDATE mot_cua.doc_giay_to SET truong_may = '{}' WHERE tep_id = '7e593000-0000-4000-8000-0000000000f1'$q$));
SELECT pg_temp.kiem('dịch vụ tệp xóa kết quả → chặn (không có quyền DELETE)', 'chặn 42501',
  pg_temp.thu($q$DELETE FROM mot_cua.doc_giay_to WHERE tep_id = '7e593000-0000-4000-8000-0000000000f1'$q$));
RESET ROLE;

-- 4. Kiểm toán ----------------------------------------------------------------------------------
SELECT pg_temp.kiem('nhật ký: khai → đọc → xác nhận (theo thứ tự), xác nhận ghi người xác nhận',
  'giay_to.khai,giay_to.doc,giay_to.xac_nhan|test-ocr-cb-a',
  (SELECT string_agg(hanh_dong, ',' ORDER BY stt) || '|' || max(nguoi_sub) FILTER (WHERE hanh_dong = 'giay_to.xac_nhan')
     FROM mot_cua.nhat_ky_kiem_toan WHERE stt > :dau_truoc AND du_lieu ->> 'tepId' = '7e593000-0000-4000-8000-0000000000f1'));
SELECT pg_temp.kiem('nhật ký đọc: số trường, số trường cần kiểm tra', '2 1',
  (SELECT (du_lieu ->> 'soTruong') || ' ' || (du_lieu ->> 'canKiemTra') FROM mot_cua.nhat_ky_kiem_toan
    WHERE stt > :dau_truoc AND hanh_dong = 'giay_to.doc'));
SELECT pg_temp.kiem('nhật ký xác nhận: tên trường bị sửa', '["gioi_tinh_con", "ho_ten_me"]',
  (SELECT (du_lieu -> 'truongDaSua')::text FROM mot_cua.nhat_ky_kiem_toan WHERE stt > :dau_truoc AND hanh_dong = 'giay_to.xac_nhan'));
SELECT pg_temp.kiem('nhật ký không chứa giá trị trên giấy tờ (họ tên, năm sinh)', '0',
  (SELECT count(*)::text FROM mot_cua.nhat_ky_kiem_toan
    WHERE stt > :dau_truoc AND (du_lieu::text LIKE '%Nguyễn%' OR du_lieu::text LIKE '%1995%')));
SELECT pg_temp.kiem('chuỗi kiểm toán vẫn hợp lệ', 'true', (mot_cua.xac_minh_kiem_toan() ->> 'hopLe'));

SELECT CASE WHEN mong_doi IS NOT DISTINCT FROM thuc_te THEN 'ĐẠT' ELSE 'TRƯỢT' END,
       mo_ta, mong_doi, coalesce(thuc_te, 'NULL')
  FROM ket_qua ORDER BY stt;
SELECT count(*) FILTER (WHERE mong_doi IS DISTINCT FROM thuc_te) > 0 AS co_truot FROM ket_qua \gset
ROLLBACK;
\if :co_truot
  DO $$ BEGIN RAISE EXCEPTION 'Có kiểm tra đọc giấy tờ trượt'; END $$;
\endif

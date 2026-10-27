-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Test kho tri thức của trợ lý thủ tục (#91, migration 014): pgvector có trong image nền tảng; chỉ tài khoản
-- dịch vụ dich_vu_tro_ly đọc/ghi đoạn tri thức (anon, công dân, cán bộ bị chặn); RPC tim_doan_gan trả đoạn
-- gần nhất theo cosin, chỉ so vector cùng mô hình, lọc theo mã thủ tục; ràng buộc id/vector.
-- Cùng khung với bao_cao.sql: một transaction rồi ROLLBACK, mỗi dòng in ra KẾT_QUẢ|mô tả|mong đợi|thực tế.
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

-- vec_mot(i) → vector 1024 chiều chỉ có thành phần thứ i bằng 1 (dạng chữ như PostgREST truyền).
CREATE FUNCTION pg_temp.vec_mot(i integer, phu integer DEFAULT NULL) RETURNS text
LANGUAGE sql AS $$
  SELECT '[' || string_agg(CASE WHEN k = i THEN '1' WHEN k = phu THEN '0.5' ELSE '0' END, ',' ORDER BY k) || ']'
    FROM generate_series(1, 1024) k
$$;

SELECT pg_temp.kiem('pgvector có trong image PostgreSQL của nền tảng', 'vector',
  (SELECT extname FROM pg_extension WHERE extname = 'vector'));

-- Dữ liệu test (superuser): ba đoạn nhúng bằng mô hình M, một đoạn mô hình khác, một đoạn chưa nhúng.
INSERT INTO mot_cua.tri_thuc_doan (id, nguon, ma_thu_tuc, tieu_de, noi_dung, sha256, mo_hinh, nhung) VALUES
  ('TEST91-a', 'test', 'TEST91A', 'Đoạn A', 'nội dung A', repeat('a', 64), 'test/M', pg_temp.vec_mot(1)::vector),
  ('TEST91-b', 'test', 'TEST91B', 'Đoạn B', 'nội dung B', repeat('b', 64), 'test/M', pg_temp.vec_mot(2)::vector),
  ('TEST91-c', 'test', 'TEST91A', 'Đoạn C', 'nội dung C', repeat('c', 64), 'test/M', pg_temp.vec_mot(3)::vector),
  ('TEST91-d', 'test', 'TEST91A', 'Đoạn D', 'nội dung D', repeat('d', 64), 'test/khac', pg_temp.vec_mot(1)::vector),
  ('TEST91-e', 'test', NULL, 'Đoạn E', 'nội dung E', repeat('e', 64), NULL, NULL);

-- Quyền ---------------------------------------------------------------------------
SELECT pg_temp.vai('anon');
SELECT pg_temp.kiem('anon đọc tri_thuc_doan → bị chặn', 'chặn 42501', pg_temp.dem('SELECT * FROM mot_cua.tri_thuc_doan'));
SELECT pg_temp.kiem('anon gọi tim_doan_gan → bị chặn', 'chặn 42501',
  pg_temp.dem($q$SELECT * FROM mot_cua.tim_doan_gan(pg_temp.vec_mot(1), 'test/M')$q$));
RESET ROLE;
SELECT pg_temp.vai('cong_dan', '7e910000-0000-4000-8000-000000000001');
SELECT pg_temp.kiem('cong_dan đọc tri_thuc_doan → bị chặn', 'chặn 42501', pg_temp.dem('SELECT * FROM mot_cua.tri_thuc_doan'));
RESET ROLE;
SELECT pg_temp.vai('can_bo', '7e910000-0000-4000-8000-000000000002');
SELECT pg_temp.kiem('can_bo ghi tri_thuc_doan → bị chặn', 'chặn 42501',
  pg_temp.thu($q$DELETE FROM mot_cua.tri_thuc_doan WHERE id LIKE 'TEST91-%'$q$));
RESET ROLE;
SELECT pg_temp.vai('lanh_dao', '7e910000-0000-4000-8000-000000000003');
SELECT pg_temp.kiem('lanh_dao gọi tim_doan_gan → bị chặn', 'chặn 42501',
  pg_temp.dem($q$SELECT * FROM mot_cua.tim_doan_gan(pg_temp.vec_mot(1), 'test/M')$q$));
RESET ROLE;

SELECT pg_temp.vai('dich_vu_tro_ly');
SELECT pg_temp.kiem('dich_vu_tro_ly đọc được mọi đoạn test', '5',
  pg_temp.dem($q$SELECT * FROM mot_cua.tri_thuc_doan WHERE id LIKE 'TEST91-%'$q$));
SELECT pg_temp.kiem('dich_vu_tro_ly cập nhật đoạn (nhúng lại)', '1 dòng',
  pg_temp.thu($q$UPDATE mot_cua.tri_thuc_doan SET mo_hinh = 'test/M', nhung = pg_temp.vec_mot(4)::vector WHERE id = 'TEST91-e'$q$));
SELECT pg_temp.kiem('dich_vu_tro_ly xóa đoạn không còn trong kho', '1 dòng',
  pg_temp.thu($q$DELETE FROM mot_cua.tri_thuc_doan WHERE id = 'TEST91-e'$q$));

-- Tìm ngữ nghĩa ---------------------------------------------------------------------
SELECT pg_temp.kiem('tim_doan_gan: gần nhất trước, chỉ cùng mô hình (D khác mô hình bị bỏ)', 'TEST91-a,TEST91-b,TEST91-c',
  (SELECT string_agg(id, ',' ORDER BY tuong_dong DESC, id)
     FROM mot_cua.tim_doan_gan(pg_temp.vec_mot(1, 2), 'test/M', 8) WHERE id LIKE 'TEST91-%'));
SELECT pg_temp.kiem('tim_doan_gan: đoạn trùng hướng có tương đồng cosin 1', '1.000000',
  (SELECT round(tuong_dong::numeric, 6)::text FROM mot_cua.tim_doan_gan(pg_temp.vec_mot(2), 'test/M', 1)));
SELECT pg_temp.kiem('tim_doan_gan: lọc theo mã thủ tục', 'TEST91-a,TEST91-c',
  (SELECT string_agg(id, ',' ORDER BY id) FROM mot_cua.tim_doan_gan(pg_temp.vec_mot(2), 'test/M', 8, 'TEST91A')));
SELECT pg_temp.kiem('tim_doan_gan: so_luong bị chặn trên 20', 'true',
  ((SELECT count(*) FROM mot_cua.tim_doan_gan(pg_temp.vec_mot(1), 'test/M', 1000)) <= 20)::text);
SELECT pg_temp.kiem('tim_doan_gan: vector sai số chiều → lỗi 22000', 'chặn 22000',
  pg_temp.dem($q$SELECT * FROM mot_cua.tim_doan_gan('[1,0,0]', 'test/M')$q$));

-- Ràng buộc ------------------------------------------------------------------------
SELECT pg_temp.kiem('id có ký tự lạ → bị chặn (23514)', 'chặn 23514',
  pg_temp.thu($q$INSERT INTO mot_cua.tri_thuc_doan (id, nguon, tieu_de, noi_dung, sha256) VALUES ('a b', 't', 't', 'n', repeat('a', 64))$q$));
SELECT pg_temp.kiem('có mô hình mà thiếu vector → bị chặn (23514)', 'chặn 23514',
  pg_temp.thu($q$INSERT INTO mot_cua.tri_thuc_doan (id, nguon, tieu_de, noi_dung, sha256, mo_hinh) VALUES ('TEST91-x', 't', 't', 'n', repeat('a', 64), 'test/M')$q$));
SELECT pg_temp.kiem('vector sai số chiều khi ghi → bị chặn (22000)', 'chặn 22000',
  pg_temp.thu($q$INSERT INTO mot_cua.tri_thuc_doan (id, nguon, tieu_de, noi_dung, sha256, mo_hinh, nhung) VALUES ('TEST91-y', 't', 't', 'n', repeat('a', 64), 'test/M', '[1,2,3]')$q$));
RESET ROLE;

SELECT CASE WHEN mong_doi IS NOT DISTINCT FROM thuc_te THEN 'ĐẠT' ELSE 'TRƯỢT' END,
       mo_ta, mong_doi, coalesce(thuc_te, 'NULL')
  FROM ket_qua ORDER BY stt;
SELECT count(*) FILTER (WHERE mong_doi IS DISTINCT FROM thuc_te) > 0 AS co_truot FROM ket_qua \gset
ROLLBACK;
\if :co_truot
  DO $$ BEGIN RAISE EXCEPTION 'Có kiểm tra trợ lý thủ tục trượt'; END $$;
\endif

-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Test sổ văn bản đến/đi (#78, migration 011): số liền theo năm và chiều, không trùng khi nhiều phiên
-- vào sổ cùng lúc (dblink); văn bản đi chỉ có số lúc chuẩn bị ký và giữ số đó khi ký lại; chỉ dịch vụ tệp
-- ghi; cán bộ, lãnh đạo, văn thư xem, công dân không; đã vào sổ/đã ký thì không sửa, không xóa (kể cả
-- superuser); kiểm toán van_ban.vao_so, van_ban.ky kèm SHA-256.
-- Cùng khung với kiem_toan.sql: một transaction rồi ROLLBACK (riêng các phiên dblink tự commit: để lại vài
-- văn bản đến "Kiểm thử ghi đồng thời"), mỗi dòng in ra KẾT_QUẢ|mô tả|mong đợi|thực tế.
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

-- vb_den(trích yếu) → câu INSERT văn bản đến như mot-cua-api ghi (tài khoản dịch vụ tệp).
CREATE FUNCTION pg_temp.vb_den(p_trich text) RETURNS text
LANGUAGE sql AS $$
  SELECT format('INSERT INTO mot_cua.van_ban (chieu, ky_hieu, loai, ngay_van_ban, trich_yeu, noi_gui, ten_tep, '
                'loai_mime, kich_thuoc, sha256, object_key, nguoi_tao_sub) VALUES (''den'', ''15/UBND-VP'', '
                '''Công văn'', current_date, %L, ''UBND huyện Mẫu'', ''cv.pdf'', ''application/pdf'', 1234, '
                'encode(sha256(convert_to(%L, ''UTF8'')), ''hex''), ''van-ban/den/'' || gen_random_uuid() || ''.pdf'', '
                '''test-vb-vt'')', p_trich, p_trich || clock_timestamp())
$$;

-- 0. Vào sổ đồng thời: 6 phiên dblink, mỗi phiên giữ khóa bộ đếm 0,1 giây ------------------------
CREATE EXTENSION dblink;  -- hoàn tác cùng ROLLBACK cuối tệp
SELECT coalesce(max(so), 0) AS so0 FROM mot_cua.van_ban
 WHERE chieu = 'den' AND nam = extract(year FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh') \gset
DO $do$
DECLARE
  v_kn text := format('dbname=%s user=%s', current_database(), current_user);
  i integer;
BEGIN
  FOR i IN 1..6 LOOP
    PERFORM dblink_connect('vb' || i, v_kn);
  END LOOP;
  FOR i IN 1..6 LOOP
    PERFORM dblink_send_query('vb' || i, format(
      $q$DO $x$ BEGIN
           INSERT INTO mot_cua.van_ban (chieu, ky_hieu, loai, ngay_van_ban, trich_yeu, noi_gui, ten_tep, loai_mime,
             kich_thuoc, sha256, object_key, nguoi_tao_sub)
           VALUES ('den', 'DT/%s', 'Công văn', current_date, 'Kiểm thử ghi đồng thời %s', 'Kiểm thử', 'dt.pdf',
             'application/pdf', 1, encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'),
             'van-ban/den/' || gen_random_uuid() || '.pdf', 'test-vb-dong-thoi');
           PERFORM pg_sleep(0.1);
         END $x$ $q$, i, i));
  END LOOP;
  FOR i IN 1..6 LOOP
    PERFORM * FROM dblink_get_result('vb' || i) AS t(kq text);
    PERFORM dblink_disconnect('vb' || i);
  END LOOP;
END
$do$;
SELECT pg_temp.kiem('6 phiên vào sổ đồng thời: 6 số liền nhau, không trùng, nối tiếp số cũ', '6 6 6 ' || (:so0 + 1), (
  SELECT count(*) || ' ' || count(DISTINCT so) || ' ' || (max(so) - min(so) + 1) || ' ' || min(so)
    FROM mot_cua.van_ban WHERE nguoi_tao_sub = 'test-vb-dong-thoi' AND so > :so0));

-- 1. Ai ghi, ai xem --------------------------------------------------------------------------
SELECT pg_temp.vai('van_thu', 'test-vb-vt');
SELECT pg_temp.kiem('văn thư ghi thẳng qua /api → chặn (chỉ qua mot-cua-api)', 'chặn 42501', pg_temp.thu(pg_temp.vb_den('x')));
SELECT pg_temp.kiem('văn thư xem sổ', 'có', CASE WHEN pg_temp.dem('SELECT 1 FROM mot_cua.van_ban') ~ '^[0-9]+$' THEN 'có' ELSE 'không' END);
SELECT pg_temp.kiem('văn thư không đọc hồ sơ công dân', 'chặn 42501', pg_temp.dem('SELECT 1 FROM mot_cua.ho_so'));
SELECT pg_temp.vai('can_bo', 'test-vb-cb');
SELECT pg_temp.kiem('cán bộ xem sổ', 'có', CASE WHEN pg_temp.dem('SELECT 1 FROM mot_cua.van_ban') ~ '^[0-9]+$' THEN 'có' ELSE 'không' END);
SELECT pg_temp.kiem('cán bộ ghi sổ → chặn', 'chặn 42501', pg_temp.thu(pg_temp.vb_den('x')));
SELECT pg_temp.vai('cong_dan', 'test-vb-cd');
SELECT pg_temp.kiem('công dân xem sổ văn bản → chặn', 'chặn 42501', pg_temp.dem('SELECT 1 FROM mot_cua.van_ban'));
SELECT pg_temp.vai('lanh_dao', 'test-vb-ld');
SELECT pg_temp.kiem('lãnh đạo gọi cap_so_van_ban_di trực tiếp → chặn', 'chặn 42501',
  pg_temp.thu($$SELECT mot_cua.cap_so_van_ban_di(gen_random_uuid(), 'TB')$$));
RESET ROLE;
SELECT pg_temp.kiem('văn thư là role API (kiểm toán ghi nguồn api)', 'true', mot_cua_noi_bo.la_role_api('van_thu')::text);

-- 2. Văn bản đến --------------------------------------------------------------------------
SELECT pg_temp.vai('dich_vu_tep', 'service-account-mot_cua_tep');
SELECT pg_temp.vb_den('Về việc test sổ văn bản đến') AS cau \gset
:cau RETURNING id AS den1, so AS so_den1, trang_thai AS tt_den1 \gset
RESET ROLE;
SELECT pg_temp.kiem('vào sổ văn bản đến → đã vào sổ, có số năm nay', 'da_vao_so true', :'tt_den1' || ' ' || (:so_den1 > :so0)::text);
SELECT pg_temp.kiem('kiểm toán van_ban.vao_so ghi số, SHA-256, người vào sổ', 'van_ban.vao_so true test-vb-vt', (
  SELECT hanh_dong || ' ' || ((du_lieu ->> 'so')::int = :so_den1)::text || ' ' || nguoi_sub
    FROM mot_cua.nhat_ky_kiem_toan WHERE doi_tuong = 'van_ban' AND doi_tuong_id = :'den1'));
SELECT pg_temp.kiem('superuser sửa văn bản đến đã vào sổ → chặn', 'chặn 42501',
  pg_temp.thu('UPDATE mot_cua.van_ban SET trich_yeu = ''sửa'' WHERE id = ' || quote_literal(:'den1')));
SELECT pg_temp.kiem('superuser xóa văn bản đến → chặn', 'chặn 42501',
  pg_temp.thu('DELETE FROM mot_cua.van_ban WHERE id = ' || quote_literal(:'den1')));
SELECT pg_temp.kiem('TRUNCATE sổ → chặn', 'chặn 42501', pg_temp.thu('TRUNCATE mot_cua.van_ban'));
SELECT pg_temp.kiem('văn bản đến thiếu tệp → chặn (CHECK)', 'chặn 23514', pg_temp.thu(
  $$INSERT INTO mot_cua.van_ban (chieu, loai, trich_yeu, noi_gui, ngay_van_ban, nguoi_tao_sub)
    VALUES ('den', 'Công văn', 'thiếu tệp', 'X', current_date, 'x')$$));

-- 3. Văn bản đi: dự thảo → cấp số → ký -------------------------------------------------------
SELECT pg_temp.vai('dich_vu_tep', 'service-account-mot_cua_tep');
SELECT pg_temp.kiem('dịch vụ tự khai số cho văn bản → chặn (không có quyền cột so)', 'chặn 42501', pg_temp.thu(
  $$INSERT INTO mot_cua.van_ban (chieu, loai, trich_yeu, nguoi_tao_sub, so) VALUES ('di', 'x', 'x', 'x', 999)$$));
INSERT INTO mot_cua.van_ban (chieu, loai, trich_yeu, noi_nhan, noi_dung, nguoi_tao_sub, object_key, ngay_van_ban)
VALUES ('di', 'Thông báo', 'Về lịch tiếp công dân', 'Các thôn', 'Nội dung', 'test-vb-vt', 'van-ban/gia.pdf', '2020-01-01')
RETURNING id AS di1, coalesce(so::text, 'NULL') || ' ' || trang_thai || ' ' || coalesce(object_key, 'NULL')
          || ' ' || coalesce(ngay_van_ban::text, 'NULL') AS dt1 \gset
INSERT INTO mot_cua.van_ban (chieu, loai, trich_yeu, noi_nhan, noi_dung, nguoi_tao_sub)
VALUES ('di', 'Công văn', 'Dự thảo thứ hai', 'UBND huyện', 'Nội dung', 'test-vb-vt') RETURNING id AS di2 \gset
SELECT coalesce(max(so), 0) AS so_di0 FROM mot_cua.van_ban
 WHERE chieu = 'di' AND nam = extract(year FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh') \gset
SELECT mot_cua.cap_so_van_ban_di(:'di1', 'TB') AS cap1 \gset
SELECT mot_cua.cap_so_van_ban_di(:'di1', 'TB') AS cap1b \gset
SELECT mot_cua.cap_so_van_ban_di(:'di2', 'CV') AS cap2 \gset
RESET ROLE;
SELECT pg_temp.kiem('dự thảo: không số, không nhận tệp hay ngày tự khai', 'NULL du_thao NULL NULL', :'dt1');
SELECT pg_temp.kiem('cấp số đi: số kế tiếp, ký hiệu <số>/TB-UBND', ((:so_di0 + 1) || ' ' || (:so_di0 + 1) || '/TB-UBND'),
  (:'cap1'::jsonb ->> 'so') || ' ' || (:'cap1'::jsonb ->> 'kyHieu'));
SELECT pg_temp.kiem('cấp lại (ký lỗi giữa chừng) → giữ đúng số cũ', :'cap1', :'cap1b');
SELECT pg_temp.kiem('dự thảo thứ hai nhận số tiếp theo', ((:so_di0 + 2) || '/CV-UBND'), :'cap2'::jsonb ->> 'kyHieu');
SELECT pg_temp.kiem('ký hiệu loại sai dạng → chặn', 'chặn 22023',
  pg_temp.thu('SELECT mot_cua.cap_so_van_ban_di(' || quote_literal(:'di2') || ', ''tb; drop'')'));
SELECT pg_temp.kiem('đổi số đã cấp → chặn', 'chặn 23514',
  pg_temp.thu('UPDATE mot_cua.van_ban SET so = so + 100 WHERE id = ' || quote_literal(:'di1')));
SELECT pg_temp.kiem('đánh dấu đã ký mà thiếu PDF, người ký → chặn (CHECK)', 'chặn 23514',
  pg_temp.thu('UPDATE mot_cua.van_ban SET trang_thai = ''da_ky'' WHERE id = ' || quote_literal(:'di1')));
SELECT pg_temp.vai('dich_vu_tep', 'service-account-mot_cua_tep');
UPDATE mot_cua.van_ban SET trang_thai = 'da_ky', nguoi_ky = 'Lê Văn Chủ Tịch', nguoi_ky_sub = 'test-vb-ld',
       ten_tep = 'tb.pdf', loai_mime = 'application/pdf', kich_thuoc = 999, sha256 = repeat('e', 64),
       object_key = 'van-ban/di/' || gen_random_uuid() || '.pdf', chung_thu_so_hieu = '42', ky_luc = now()
 WHERE id = :'di1';
SELECT pg_temp.kiem('dịch vụ sửa văn bản đã ký → không còn thấy để sửa (RLS) hoặc bị chặn', 'chặn 42501',
  pg_temp.thu('UPDATE mot_cua.van_ban SET trich_yeu = ''x'' WHERE id = ' || quote_literal(:'di1')));
RESET ROLE;
SELECT pg_temp.kiem('superuser sửa văn bản đã ký → chặn', 'chặn 42501',
  pg_temp.thu('UPDATE mot_cua.van_ban SET sha256 = repeat(''f'', 64) WHERE id = ' || quote_literal(:'di1')));
SELECT pg_temp.kiem('kiểm toán van_ban.ky: người ký là lãnh đạo, SHA-256 PDF đã ký', 'van_ban.ky test-vb-ld ' || repeat('e', 64), (
  SELECT hanh_dong || ' ' || nguoi_sub || ' ' || (du_lieu ->> 'sha256')
    FROM mot_cua.nhat_ky_kiem_toan WHERE hanh_dong = 'van_ban.ky' AND doi_tuong_id = :'di1'));
SELECT pg_temp.kiem('dự thảo chưa ký thì xóa được (superuser)', '1 dòng',
  pg_temp.thu('DELETE FROM mot_cua.van_ban WHERE id = ' || quote_literal(:'di2')));
SELECT pg_temp.vai('lanh_dao', 'test-vb-ld');
SELECT pg_temp.kiem('sau tất cả: chuỗi kiểm toán hợp lệ', 'true', mot_cua.xac_minh_kiem_toan() ->> 'hopLe');
RESET ROLE;

-- Kết quả -------------------------------------------------------------------------------
RESET ROLE;
SELECT CASE WHEN mong_doi IS NOT DISTINCT FROM thuc_te THEN 'ĐẠT' ELSE 'TRƯỢT' END,
       mo_ta, mong_doi, coalesce(thuc_te, 'NULL')
  FROM ket_qua ORDER BY stt;
SELECT count(*) FILTER (WHERE mong_doi IS DISTINCT FROM thuc_te) > 0 AS co_truot FROM ket_qua \gset
ROLLBACK;
\if :co_truot
  DO $$ BEGIN RAISE EXCEPTION 'Có kiểm tra sổ văn bản trượt'; END $$;
\endif

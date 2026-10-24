-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Test nhật ký kiểm toán chuỗi băm (#75, migration 007): nhiều phiên ghi đồng thời không đứt chuỗi;
-- chỉ lãnh đạo đọc và xác minh, không role API nào ghi trực tiếp; sửa, xóa, TRUNCATE bị chặn kể cả
-- superuser; mỗi thao tác nghiệp vụ ghi kiểm toán cùng transaction (rollback thì không có); giả mạo
-- (superuser tắt trigger) bị hàm xác minh chỉ đúng vị trí; nội dung chuẩn khớp trình xác minh Python.
-- Cùng khung với trang_thai.sql: một transaction rồi ROLLBACK, mỗi dòng in ra
-- KẾT_QUẢ|mô tả|mong đợi|thực tế (không dùng '|' trong giá trị). make test-sql và make smoke chạy tệp này.
-- Riêng phần ghi đồng thời dùng dblink (contrib có sẵn trong image postgres): các phiên dblink tự
-- commit, nên để lại vài bản ghi kiem_thu.dong_thoi hợp lệ trong chuỗi.
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

-- xm(mốc) → "hợp lệ" hoặc "<loại lỗi>@<stt>" theo RPC xac_minh_kiem_toan (gọi như lãnh đạo).
CREATE FUNCTION pg_temp.xm(p_stt bigint DEFAULT NULL, p_bam text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE kq jsonb;
BEGIN
  PERFORM pg_temp.vai('lanh_dao', 'test-kt-ld');
  kq := mot_cua.xac_minh_kiem_toan(p_stt, p_bam);
  RESET ROLE;
  RETURN CASE WHEN (kq ->> 'hopLe')::boolean THEN 'hợp lệ' ELSE (kq #>> '{loi,loai}') || '@' || (kq #>> '{loi,stt}') END;
END
$$;

-- dau() → stt của đầu chuỗi.
CREATE FUNCTION pg_temp.dau() RETURNS bigint
LANGUAGE sql AS $$ SELECT stt FROM mot_cua.dau_chuoi_kiem_toan $$;

-- ghi_cuoi(hành động) → "hành động nguồn vai_trò người" của bản ghi kiểm toán mới nhất có hành động đó.
CREATE FUNCTION pg_temp.ghi_cuoi(p_hd text) RETURNS text
LANGUAGE sql AS $$
  SELECT hanh_dong || ' ' || nguon || ' ' || vai_tro || ' ' || coalesce(nguoi_sub, 'NULL')
    FROM mot_cua.nhat_ky_kiem_toan WHERE hanh_dong = p_hd ORDER BY stt DESC LIMIT 1
$$;

-- 0. Ghi đồng thời: 6 phiên dblink cùng ghi, mỗi phiên giữ khóa đầu chuỗi 0,1 giây --------------
-- Chạy trước mọi thao tác ghi khác của transaction này (nếu không, transaction này giữ khóa đầu
-- chuỗi và các phiên dblink phải chờ nó).
CREATE EXTENSION dblink;  -- hoàn tác cùng ROLLBACK cuối tệp
SELECT pg_temp.dau() AS dau0 \gset
DO $do$
DECLARE
  v_kn text := format('dbname=%s user=%s', current_database(), current_user);
  i integer;
BEGIN
  FOR i IN 1..6 LOOP
    PERFORM dblink_connect('kt' || i, v_kn);
  END LOOP;
  FOR i IN 1..6 LOOP
    PERFORM dblink_send_query('kt' || i, format(
      $q$DO $x$ BEGIN
        PERFORM mot_cua_noi_bo.ghi_kiem_toan('kiem_thu.dong_thoi', 'kiem_thu', '%s', '{"phien": %s}', NULL, 'he_thong');
        PERFORM pg_sleep(0.1);
      END $x$ $q$, i, i));
  END LOOP;
  FOR i IN 1..6 LOOP
    PERFORM * FROM dblink_get_result('kt' || i) AS t(kq text);
    PERFORM dblink_disconnect('kt' || i);
  END LOOP;
END
$do$;
SELECT pg_temp.kiem('6 phiên ghi đồng thời: đầu chuỗi tiến đúng 6', (:dau0 + 6)::text, pg_temp.dau()::text);
SELECT pg_temp.kiem('6 phiên ghi đồng thời: stt liền nhau, mỗi phiên một bản ghi', '6 6 6', (
  SELECT count(*) || ' ' || count(DISTINCT doi_tuong_id) || ' ' || (max(stt) - min(stt) + 1)
    FROM mot_cua.nhat_ky_kiem_toan WHERE hanh_dong = 'kiem_thu.dong_thoi' AND stt > :dau0));
SELECT pg_temp.kiem('6 phiên ghi đồng thời: chuỗi vẫn hợp lệ', 'hợp lệ', pg_temp.xm());

-- Dữ liệu test (superuser) ---------------------------------------------------------------
INSERT INTO mot_cua.linh_vuc (id, ma, ten) VALUES
  ('7e575000-0000-4000-8000-0000000000a1', 'test_kt_a', 'Lĩnh vực test kiểm toán');
SELECT pg_temp.dau() AS truoc_tt \gset
INSERT INTO mot_cua.thu_tuc (id, ma, ten, linh_vuc_id, so_ngay_xu_ly, cong_khai, trang_thai_buoc) VALUES
  ('7e575000-0000-4000-8000-0000000000a2', 'TEST_KT', 'Thủ tục test kiểm toán', '7e575000-0000-4000-8000-0000000000a1', 2, true,
   '{"tiep_nhan": "moi", "tham_dinh": "dang_xu_ly"}');
SELECT pg_temp.kiem('thêm thủ tục → thu_tuc.them (SQL quản trị: he_thong)', 'thu_tuc.them he_thong TEST_KT', (
  SELECT hanh_dong || ' ' || nguon || ' ' || doi_tuong_id FROM mot_cua.nhat_ky_kiem_toan WHERE stt = :truoc_tt + 1));
INSERT INTO mot_cua.can_bo (id, sub, ho_ten, chuc_vu) VALUES
  ('7e575000-0000-4000-8000-0000000000c1', 'test-kt-cb', 'Cán bộ test kiểm toán', 'Thử');
INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES
  ('7e575000-0000-4000-8000-0000000000c1', '7e575000-0000-4000-8000-0000000000a1');
SELECT pg_temp.kiem('phân công lĩnh vực cho cán bộ → can_bo.them_linh_vuc', 'test_kt_a', (
  SELECT du_lieu ->> 'linhVuc' FROM mot_cua.nhat_ky_kiem_toan WHERE hanh_dong = 'can_bo.them_linh_vuc' ORDER BY stt DESC LIMIT 1));

-- 1. Quyền ---------------------------------------------------------------------------
SELECT pg_temp.vai('anon');
SELECT pg_temp.kiem('anon đọc nhật ký kiểm toán → chặn', 'chặn 42501', pg_temp.dem('SELECT * FROM mot_cua.nhat_ky_kiem_toan'));
SELECT pg_temp.vai('cong_dan', 'test-kt-cd');
SELECT pg_temp.kiem('công dân đọc nhật ký kiểm toán → chặn', 'chặn 42501', pg_temp.dem('SELECT * FROM mot_cua.nhat_ky_kiem_toan'));
SELECT pg_temp.kiem('công dân gọi xac_minh_kiem_toan → chặn', 'chặn 42501', pg_temp.thu('SELECT mot_cua.xac_minh_kiem_toan()'));
SELECT pg_temp.kiem('công dân gọi ghi_kiem_toan → chặn', 'chặn 42501',
  pg_temp.thu($$SELECT mot_cua_noi_bo.ghi_kiem_toan('ho_so.nop', 'ho_so', NULL)$$));
SELECT pg_temp.vai('can_bo', 'test-kt-cb');
SELECT pg_temp.kiem('cán bộ đọc nhật ký kiểm toán → chặn', 'chặn 42501', pg_temp.dem('SELECT * FROM mot_cua.nhat_ky_kiem_toan'));
SELECT pg_temp.kiem('cán bộ gọi xac_minh_kiem_toan → chặn', 'chặn 42501', pg_temp.thu('SELECT mot_cua.xac_minh_kiem_toan()'));
SELECT pg_temp.vai('dich_vu_su_kien', 'service-account-mot_cua_su_kien');
SELECT pg_temp.kiem('dịch vụ sự kiện đọc nhật ký kiểm toán → chặn', 'chặn 42501', pg_temp.dem('SELECT * FROM mot_cua.nhat_ky_kiem_toan'));
SELECT pg_temp.vai('lanh_dao', 'test-kt-ld');
SELECT pg_temp.kiem('lãnh đạo đọc được cả nhật ký kiểm toán (số bản ghi = stt đầu chuỗi)', pg_temp.dau()::text,
  pg_temp.dem('SELECT * FROM mot_cua.nhat_ky_kiem_toan'));
SELECT pg_temp.kiem('lãnh đạo đọc được đầu chuỗi', '1', pg_temp.dem('SELECT * FROM mot_cua.dau_chuoi_kiem_toan'));
SELECT pg_temp.kiem('lãnh đạo thêm bản ghi trực tiếp → chặn', 'chặn 42501', pg_temp.thu(
  $$INSERT INTO mot_cua.nhat_ky_kiem_toan VALUES (999999, now(), 'ho_so.nop', 'ho_so', NULL, NULL, 'x', 'api', '{}', repeat('0', 64), repeat('1', 64))$$));
SELECT pg_temp.kiem('lãnh đạo sửa đầu chuỗi → chặn', 'chặn 42501',
  pg_temp.thu('UPDATE mot_cua.dau_chuoi_kiem_toan SET stt = stt + 1'));
RESET ROLE;
SELECT pg_temp.kiem('lãnh đạo xác minh: chuỗi hiện tại hợp lệ', 'hợp lệ', pg_temp.xm());

-- 2. Không sửa, không xóa (kể cả superuser khi trigger bật) ------------------------------------
SELECT pg_temp.kiem('superuser UPDATE nhật ký kiểm toán → chặn', 'chặn 42501',
  pg_temp.thu($$UPDATE mot_cua.nhat_ky_kiem_toan SET du_lieu = '{"sua": true}' WHERE stt = 1$$));
SELECT pg_temp.kiem('superuser DELETE nhật ký kiểm toán → chặn', 'chặn 42501',
  pg_temp.thu('DELETE FROM mot_cua.nhat_ky_kiem_toan WHERE stt = (SELECT max(stt) FROM mot_cua.nhat_ky_kiem_toan)'));
SELECT pg_temp.kiem('superuser TRUNCATE nhật ký kiểm toán → chặn', 'chặn 42501',
  pg_temp.thu('TRUNCATE mot_cua.nhat_ky_kiem_toan'));
SELECT pg_temp.kiem('superuser lùi đầu chuỗi → chặn', 'chặn 42501',
  pg_temp.thu('UPDATE mot_cua.dau_chuoi_kiem_toan SET stt = stt - 1'));
SELECT pg_temp.kiem('superuser đặt đầu chuỗi sang băm khác → chặn', 'chặn 42501',
  pg_temp.thu($$UPDATE mot_cua.dau_chuoi_kiem_toan SET stt = stt + 1, bam = repeat('f', 64)$$));
SELECT pg_temp.kiem('superuser DELETE đầu chuỗi → chặn', 'chặn 42501',
  pg_temp.thu('DELETE FROM mot_cua.dau_chuoi_kiem_toan'));

-- 3. Thao tác nghiệp vụ ghi kiểm toán trong cùng transaction --------------------------------------
SELECT pg_temp.vai('cong_dan', 'test-kt-cd');
INSERT INTO mot_cua.ho_so (thu_tuc_id, ho_ten_nguoi_nop, so_dien_thoai)
VALUES ('7e575000-0000-4000-8000-0000000000a2', 'Công dân Kiểm Toán', '0912345678')
RETURNING quote_literal(id) AS "H1" \gset
RESET ROLE;
SELECT pg_temp.kiem('công dân nộp hồ sơ → ho_so.nop (người nộp, nguồn nop)', 'ho_so.nop nop cong_dan test-kt-cd',
  pg_temp.ghi_cuoi('ho_so.nop'));
SELECT pg_temp.kiem('ho_so.nop ghi mã hồ sơ, thủ tục, trạng thái', 'TEST_KT moi true', (
  SELECT (du_lieu ->> 'thuTuc') || ' ' || (du_lieu ->> 'denTrangThai') || ' ' || (du_lieu ? 'maHoSo')::text
    FROM mot_cua.nhat_ky_kiem_toan WHERE hanh_dong = 'ho_so.nop' AND doi_tuong_id = :H1));
SELECT pg_temp.kiem('kiểm toán không chứa họ tên, số điện thoại người nộp', '0', (
  SELECT count(*)::text FROM mot_cua.nhat_ky_kiem_toan
   WHERE du_lieu::text LIKE '%Kiểm Toán%' OR du_lieu::text LIKE '%0912345678%'));

UPDATE mot_cua.ho_so SET so_dien_thoai = '0987654321' WHERE id = :H1;
SELECT pg_temp.kiem('SQL quản trị sửa số điện thoại → ho_so.cap_nhat chỉ ghi tên cột', 'he_thong ["so_dien_thoai"] false', (
  SELECT nguon || ' ' || (du_lieu -> 'cot')::text || ' ' || (du_lieu::text LIKE '%0987654321%')::text
    FROM mot_cua.nhat_ky_kiem_toan WHERE hanh_dong = 'ho_so.cap_nhat' AND doi_tuong_id = :H1 ORDER BY stt DESC LIMIT 1));

SELECT pg_temp.dau() AS truoc_sai \gset
SELECT pg_temp.vai('can_bo', 'test-kt-cb');
SELECT pg_temp.kiem('cán bộ chuyển sai (moi → hoan_tat) → chặn', 'chặn 23514',
  pg_temp.thu('UPDATE mot_cua.ho_so SET trang_thai = ''hoan_tat'' WHERE id = ' || :'H1'));
RESET ROLE;
SELECT pg_temp.kiem('thao tác lỗi (rollback) không để lại bản ghi kiểm toán', :'truoc_sai', pg_temp.dau()::text);

SELECT pg_temp.vai('can_bo', 'test-kt-cb');
UPDATE mot_cua.ho_so SET trang_thai = 'dang_xu_ly' WHERE id = :H1;
RESET ROLE;
SELECT pg_temp.kiem('cán bộ chuyển trạng thái qua /api → ho_so.chuyen_trang_thai', 'ho_so.chuyen_trang_thai api can_bo test-kt-cb',
  pg_temp.ghi_cuoi('ho_so.chuyen_trang_thai'));
SELECT pg_temp.kiem('cán bộ nhận xử lý → ho_so.cap_nhat ghi cột can_bo_xu_ly_id', '["can_bo_xu_ly_id"] 7e575000-0000-4000-8000-0000000000c1', (
  SELECT (du_lieu -> 'cot')::text || ' ' || (du_lieu ->> 'canBoXuLy')
    FROM mot_cua.nhat_ky_kiem_toan WHERE hanh_dong = 'ho_so.cap_nhat' AND doi_tuong_id = :H1 ORDER BY stt DESC LIMIT 1));

-- Xử lý bước qua RPC dong_bo_trang_thai (như mot-cua-api sau khi Flowable hoàn thành task).
SELECT quote_literal(jsonb_build_array(jsonb_build_object(
  'id', '7e575000-0000-4000-8000-0000000000e1', 'loai', 'ho_so.chuyen_buoc', 'ho_so_id', :H1, 'khoa_chong_trung', 'test-kt-e1',
  'noi_dung', jsonb_build_object('phienBan', 1, 'id', '7e575000-0000-4000-8000-0000000000e1', 'loai', 'ho_so.chuyen_buoc', 'hoSoId', :H1,
                                 'duLieu', '{"tuBuoc": "tham_dinh", "denBuoc": [], "vaiTroXuLy": "can_bo"}'::jsonb)))) AS "EV" \gset
SELECT pg_temp.vai('dich_vu_su_kien', 'service-account-mot_cua_su_kien');
SELECT mot_cua.dong_bo_trang_thai(:H1, 'hoan_tat', NULL, 'tham_dinh', 'quy_trinh', 'test-kt-cb', :EV::jsonb) IS NOT NULL AS ok \gset
RESET ROLE;
SELECT pg_temp.kiem('xử lý bước qua quy trình → quy_trinh.xu_ly_buoc (người xử lý là cán bộ)', 'quy_trinh.xu_ly_buoc quy_trinh dich_vu_su_kien test-kt-cb',
  pg_temp.ghi_cuoi('quy_trinh.xu_ly_buoc'));
SELECT pg_temp.kiem('quy_trinh.xu_ly_buoc ghi bước, trạng thái, sự kiện', 'tham_dinh dang_xu_ly>hoan_tat ho_so.chuyen_buoc', (
  SELECT (du_lieu ->> 'buoc') || ' ' || (du_lieu ->> 'trangThaiTruoc') || '>' || (du_lieu ->> 'trangThai') || ' '
         || (du_lieu #>> '{suKien,0,loai}')
    FROM mot_cua.nhat_ky_kiem_toan WHERE hanh_dong = 'quy_trinh.xu_ly_buoc' AND doi_tuong_id = :H1));
SELECT pg_temp.kiem('chuyển trạng thái theo quy trình → ho_so.chuyen_trang_thai nguồn quy_trinh, có bước',
  'ho_so.chuyen_trang_thai quy_trinh dich_vu_su_kien test-kt-cb tham_dinh', (
  SELECT pg_temp.ghi_cuoi('ho_so.chuyen_trang_thai') || ' ' || (du_lieu ->> 'buoc')
    FROM mot_cua.nhat_ky_kiem_toan WHERE hanh_dong = 'ho_so.chuyen_trang_thai' ORDER BY stt DESC LIMIT 1));
SELECT pg_temp.dau() AS truoc_lai \gset
SELECT pg_temp.vai('dich_vu_su_kien', 'service-account-mot_cua_su_kien');
SELECT mot_cua.dong_bo_trang_thai(:H1, 'hoan_tat', NULL, 'tham_dinh', 'doi_soat', 'test-kt-cb', :EV::jsonb) IS NOT NULL AS ok \gset
RESET ROLE;
SELECT pg_temp.kiem('gọi lại RPC không đổi gì (đối soát) → không ghi kiểm toán', :'truoc_lai', pg_temp.dau()::text);

INSERT INTO mot_cua.thanh_phan_ho_so (id, ho_so_id, ten_tep, loai_mime, kich_thuoc, sha256)
VALUES ('7e575000-0000-4000-8000-0000000000f1', :H1, 'giay-to-Kiểm Toán.pdf', 'application/pdf', 1234, repeat('c', 64));
SELECT pg_temp.kiem('tải tệp → tep.tai_len có SHA-256 tệp, không có tên tệp', 'cccccccccccccccc 1234 false', (
  SELECT left(du_lieu ->> 'sha256', 16) || ' ' || (du_lieu ->> 'kichThuoc') || ' ' || (du_lieu::text LIKE '%giay-to%')::text
    FROM mot_cua.nhat_ky_kiem_toan WHERE hanh_dong = 'tep.tai_len' AND doi_tuong_id = :H1));

SELECT pg_temp.vai('dich_vu_danh_muc', 'service-account-mot_cua_danh_muc');
SELECT mot_cua.nap_thu_tuc(jsonb_build_object(
  'goi', 'test-kt-goi', 'ma', 'TEST_KT', 'ten', 'Thủ tục test kiểm toán', 'linh_vuc', 'test_kt_a',
  'so_ngay_xu_ly', 2, 'quy_trinh', 'quy_trinh_test_kt', 'goi_sha256', repeat('d', 64), 'thanh_phan', '[]'::jsonb)) IS NOT NULL AS ok \gset
RESET ROLE;
SELECT pg_temp.kiem('nạp gói thủ tục → thu_tuc.nap_goi (tài khoản dịch vụ danh mục)', 'thu_tuc.nap_goi api dich_vu_danh_muc test-kt-goi', (
  SELECT hanh_dong || ' ' || nguon || ' ' || vai_tro || ' ' || (du_lieu ->> 'goi')
    FROM mot_cua.nhat_ky_kiem_toan WHERE doi_tuong = 'thu_tuc' AND doi_tuong_id = 'TEST_KT' ORDER BY stt DESC LIMIT 1));
SELECT pg_temp.dau() AS truoc_nap \gset
SELECT pg_temp.vai('dich_vu_danh_muc', 'service-account-mot_cua_danh_muc');
SELECT mot_cua.nap_thu_tuc(jsonb_build_object(
  'goi', 'test-kt-goi', 'ma', 'TEST_KT', 'ten', 'Thủ tục test kiểm toán', 'linh_vuc', 'test_kt_a',
  'so_ngay_xu_ly', 2, 'quy_trinh', 'quy_trinh_test_kt', 'goi_sha256', repeat('d', 64), 'thanh_phan', '[]'::jsonb)) IS NOT NULL AS ok \gset
RESET ROLE;
SELECT pg_temp.kiem('nạp lại gói không đổi → không ghi kiểm toán', :'truoc_nap', pg_temp.dau()::text);
SELECT pg_temp.kiem('sau các thao tác: chuỗi hợp lệ', 'hợp lệ', pg_temp.xm());

-- 4. Giả mạo bằng superuser (tắt trigger) → xác minh chỉ đúng vị trí -----------------------------
SELECT stt AS x, bam AS bam_x FROM mot_cua.nhat_ky_kiem_toan WHERE hanh_dong = 'ho_so.nop' AND doi_tuong_id = :H1 \gset
SELECT pg_temp.kiem('mốc đúng (stt, bam lưu ở ngoài) → hợp lệ', 'hợp lệ', pg_temp.xm(:x, :'bam_x'));
SELECT pg_temp.kiem('mốc sai → moc_khong_khop đúng stt', 'moc_khong_khop@' || :x, pg_temp.xm(:x, repeat('f', 64)));
SELECT pg_temp.kiem('mốc ngoài chuỗi → moc_khong_khop', 'moc_khong_khop@999999999', pg_temp.xm(999999999, repeat('f', 64)));

SAVEPOINT gia_mao;
SET LOCAL session_replication_role = replica;
UPDATE mot_cua.nhat_ky_kiem_toan SET du_lieu = du_lieu || '{"denTrangThai": "hoan_tat"}' WHERE stt = :x;
SET LOCAL session_replication_role = origin;
SELECT pg_temp.xm() AS kq \gset
ROLLBACK TO SAVEPOINT gia_mao;
SELECT pg_temp.kiem('sửa nội dung bản ghi giữa chuỗi → noi_dung_bi_sua đúng stt', 'noi_dung_bi_sua@' || :x, :'kq');

SAVEPOINT gia_mao;
SET LOCAL session_replication_role = replica;
UPDATE mot_cua.nhat_ky_kiem_toan SET nguoi_sub = 'nguoi-khac' WHERE stt = :x;
UPDATE mot_cua.nhat_ky_kiem_toan k SET bam = mot_cua_noi_bo.bam_kiem_toan(k) WHERE stt = :x;
SET LOCAL session_replication_role = origin;
SELECT pg_temp.xm() AS kq \gset
ROLLBACK TO SAVEPOINT gia_mao;
SELECT pg_temp.kiem('sửa và tính lại bam bản ghi x → lien_ket_dut ở bản ghi x+1', 'lien_ket_dut@' || (:x + 1), :'kq');

SAVEPOINT gia_mao;
SET LOCAL session_replication_role = replica;
DELETE FROM mot_cua.nhat_ky_kiem_toan WHERE stt = :x;
SET LOCAL session_replication_role = origin;
SELECT pg_temp.xm() AS kq \gset
ROLLBACK TO SAVEPOINT gia_mao;
SELECT pg_temp.kiem('xóa bản ghi giữa chuỗi → thieu_ban_ghi đúng stt', 'thieu_ban_ghi@' || :x, :'kq');

SAVEPOINT gia_mao;
SET LOCAL session_replication_role = replica;
DELETE FROM mot_cua.nhat_ky_kiem_toan WHERE stt = (SELECT max(stt) FROM mot_cua.nhat_ky_kiem_toan);
SET LOCAL session_replication_role = origin;
SELECT pg_temp.xm() AS kq \gset
ROLLBACK TO SAVEPOINT gia_mao;
SELECT pg_temp.kiem('xóa bản ghi cuối → dau_chuoi_lech', 'dau_chuoi_lech@' || pg_temp.dau(), :'kq');
SELECT pg_temp.kiem('sau khi hoàn tác giả mạo: chuỗi hợp lệ', 'hợp lệ', pg_temp.xm());

-- 5. Nội dung chuẩn khớp trình xác minh Python (tests/test_kiem_toan.py dùng cùng vector) -----------
SELECT pg_temp.kiem('nội dung chuẩn: khóa sắp theo độ dài, giờ UTC, Unicode giữ nguyên',
  '{"luc": "2026-10-23T08:01:02.500000Z", "stt": 7, "nguon": "api", "duLieu": {"z": {"a": [], "bb": 1, "ă": {}}, "so": 12, "cot": ["so_dien_thoai", "ly_do"], "dung": true, "lyDo": "Thiếu \"bản sao\"\nkèm\ttab \\ và \u0001", "rong": null, "tien": 1.50}, "vaiTro": "can_bo", "doiTuong": "ho_so", "hanhDong": "ho_so.chuyen_trang_thai", "nguoiSub": "sub-cán-bộ", "doiTuongId": "7e573000-0000-4000-8000-000000000001"}',
  mot_cua_noi_bo.noi_dung_kiem_toan(ROW(7, '2026-10-23 15:01:02.5+07'::timestamptz, 'ho_so.chuyen_trang_thai', 'ho_so',
    '7e573000-0000-4000-8000-000000000001', 'sub-cán-bộ', 'can_bo', 'api',
    E'{"lyDo": "Thiếu \\"bản sao\\"\\nkèm\\ttab \\\\ và \\u0001", "cot": ["so_dien_thoai", "ly_do"], "so": 12, "tien": 1.50, "dung": true, "rong": null, "z": {"bb": 1, "a": [], "ă": {}}}'::jsonb,
    repeat('a', 64), repeat('0', 64))::mot_cua.nhat_ky_kiem_toan));
SELECT pg_temp.kiem('băm chuẩn khớp vector của test Python', '51ee137008169a66cfcada10f14bf59813a10507940727cde4a862deb3b75499',
  mot_cua_noi_bo.bam_kiem_toan(ROW(7, '2026-10-23 15:01:02.5+07'::timestamptz, 'ho_so.chuyen_trang_thai', 'ho_so',
    '7e573000-0000-4000-8000-000000000001', 'sub-cán-bộ', 'can_bo', 'api',
    E'{"lyDo": "Thiếu \\"bản sao\\"\\nkèm\\ttab \\\\ và \\u0001", "cot": ["so_dien_thoai", "ly_do"], "so": 12, "tien": 1.50, "dung": true, "rong": null, "z": {"bb": 1, "a": [], "ă": {}}}'::jsonb,
    repeat('a', 64), repeat('0', 64))::mot_cua.nhat_ky_kiem_toan));

-- Kết quả -------------------------------------------------------------------------------
RESET ROLE;
SELECT CASE WHEN mong_doi IS NOT DISTINCT FROM thuc_te THEN 'ĐẠT' ELSE 'TRƯỢT' END,
       mo_ta, mong_doi, coalesce(thuc_te, 'NULL')
  FROM ket_qua ORDER BY stt;
SELECT count(*) FILTER (WHERE mong_doi IS DISTINCT FROM thuc_te) > 0 AS co_truot FROM ket_qua \gset
ROLLBACK;
\if :co_truot
  DO $$ BEGIN RAISE EXCEPTION 'Có kiểm tra nhật ký kiểm toán trượt'; END $$;
\endif

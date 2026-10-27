-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Test thông báo sắp trễ hạn tới cán bộ (#56, migration 013): mỗi cán bộ đang làm việc phụ trách lĩnh vực
-- của hồ sơ đúng một thông báo cho một mốc hạn (nhận lại sự kiện, sự kiện mới cùng mốc không thêm), mốc
-- khác thì có thông báo mới; kênh email/SMS chỉ ghi giả lập; hồ sơ đã đóng bỏ qua; sự kiện sai loại bị từ
-- chối. RLS: cán bộ chỉ thấy, chỉ đánh dấu đã đọc thông báo của mình; giờ đọc do CSDL đặt; không sửa nội
-- dung; công dân không đọc; chỉ tài khoản dịch vụ sự kiện gọi RPC; nội dung không có dữ liệu cá nhân.
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

-- Sự kiện ho_so.sap_tre_han tối giản theo định dạng của su_kien.py.
CREATE FUNCTION pg_temp.su_kien(ho_so uuid, han text, loai text DEFAULT 'ho_so.sap_tre_han') RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object('phienBan', 1, 'id', gen_random_uuid(), 'loai', loai, 'hoSoId', ho_so,
                            'duLieu', jsonb_build_object('hanXuLy', han, 'conLaiNgayLamViec', 1))
$$;

-- Dữ liệu ---------------------------------------------------------------------------
INSERT INTO mot_cua.linh_vuc (id, ma, ten) VALUES
  ('7e5b0000-0000-4000-8000-0000000000a1', 'test_tb_a', 'Lĩnh vực test thông báo A'),
  ('7e5b0000-0000-4000-8000-0000000000b1', 'test_tb_b', 'Lĩnh vực test thông báo B');
INSERT INTO mot_cua.thu_tuc (id, ma, ten, linh_vuc_id, so_ngay_xu_ly, cong_khai) VALUES
  ('7e5b0000-0000-4000-8000-0000000000a2', 'TEST_TB', 'Thủ tục test thông báo', '7e5b0000-0000-4000-8000-0000000000a1', 2, true);
INSERT INTO mot_cua.can_bo (id, sub, ho_ten, chuc_vu, dang_lam_viec) VALUES
  ('7e5b0000-0000-4000-8000-0000000000c1', 'test-tb-x', 'Cán bộ X', 'Thử', true),
  ('7e5b0000-0000-4000-8000-0000000000c2', 'test-tb-y', 'Cán bộ Y', 'Thử', true),
  ('7e5b0000-0000-4000-8000-0000000000c3', 'test-tb-z', 'Cán bộ Z (lĩnh vực B)', 'Thử', true),
  ('7e5b0000-0000-4000-8000-0000000000c4', 'test-tb-w', 'Cán bộ W (nghỉ)', 'Thử', false);
INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES
  ('7e5b0000-0000-4000-8000-0000000000c1', '7e5b0000-0000-4000-8000-0000000000a1'),
  ('7e5b0000-0000-4000-8000-0000000000c2', '7e5b0000-0000-4000-8000-0000000000a1'),
  ('7e5b0000-0000-4000-8000-0000000000c3', '7e5b0000-0000-4000-8000-0000000000b1'),
  ('7e5b0000-0000-4000-8000-0000000000c4', '7e5b0000-0000-4000-8000-0000000000a1');
INSERT INTO mot_cua.ho_so (id, ma_ho_so, thu_tuc_id, nguoi_nop_sub, ho_ten_nguoi_nop, so_dien_thoai) VALUES
  ('7e5b0000-0000-4000-8000-0000000000d1', 'HS20261024-TB0001', '7e5b0000-0000-4000-8000-0000000000a2',
   'test-tb-cd', 'Người Thử Thông Báo', '0900005656'),
  ('7e5b0000-0000-4000-8000-0000000000d2', 'HS20261024-TB0002', '7e5b0000-0000-4000-8000-0000000000a2',
   'test-tb-cd', 'Người Thử Thông Báo', NULL);
UPDATE mot_cua.ho_so SET trang_thai = 'dang_xu_ly' WHERE id = '7e5b0000-0000-4000-8000-0000000000d2';
UPDATE mot_cua.ho_so SET trang_thai = 'hoan_tat', ngay_hoan_tat = now() WHERE id = '7e5b0000-0000-4000-8000-0000000000d2';
\set H1 '''7e5b0000-0000-4000-8000-0000000000d1'''
\set H2 '''7e5b0000-0000-4000-8000-0000000000d2'''

-- Ghi thông báo (tài khoản dịch vụ sự kiện của mot-cua-worker) ------------------------------------
SELECT pg_temp.vai('dich_vu_su_kien', 'service-account-mot_cua_su_kien');
SELECT pg_temp.su_kien(:H1, '2026-11-02') AS ev1 \gset
SELECT pg_temp.kiem('sự kiện sắp trễ hạn → 2 cán bộ đang làm việc của lĩnh vực A, mỗi người 1 thông báo', '{"moi": 2, "nguoiNhan": 2}',
  mot_cua.ghi_thong_bao_sap_tre(:'ev1', '{email,sms}')::text);
SELECT pg_temp.kiem('nhận lại cùng sự kiện (RabbitMQ giao lại) → không thêm', '{"moi": 0, "nguoiNhan": 2}',
  mot_cua.ghi_thong_bao_sap_tre(:'ev1', '{email,sms}')::text);
SELECT pg_temp.kiem('sự kiện mới, cùng hồ sơ và mốc hạn (quét lại, chạy lại worker) → không thêm', '0',
  mot_cua.ghi_thong_bao_sap_tre(pg_temp.su_kien(:H1, '2026-11-02'), '{email}') ->> 'moi');
SELECT pg_temp.kiem('hạn đổi (mốc mới) → mỗi cán bộ thêm 1 thông báo, không kênh ngoài khi không bật', '2',
  mot_cua.ghi_thong_bao_sap_tre(pg_temp.su_kien(:H1, '2026-11-05')) ->> 'moi');
SELECT pg_temp.kiem('hồ sơ đã đóng → bỏ qua', '0 hồ sơ đã đóng',
  (SELECT r ->> 'moi' || ' ' || (r ->> 'boQua') FROM mot_cua.ghi_thong_bao_sap_tre(pg_temp.su_kien(:H2, '2026-11-02')) r));
SELECT pg_temp.kiem('sự kiện sai loại, thiếu hạn, hồ sơ không có → từ chối 22023', 'chặn 22023 chặn 22023 chặn 22023',
  pg_temp.thu('SELECT mot_cua.ghi_thong_bao_sap_tre(pg_temp.su_kien(' || quote_literal(:H1) || ', ''2026-11-02'', ''ho_so.moi''))') || ' ' ||
  pg_temp.thu('SELECT mot_cua.ghi_thong_bao_sap_tre(pg_temp.su_kien(' || quote_literal(:H1) || ', ''x''))') || ' ' ||
  pg_temp.thu('SELECT mot_cua.ghi_thong_bao_sap_tre(pg_temp.su_kien(gen_random_uuid(), ''2026-11-02''))'));
SELECT pg_temp.kiem('dịch vụ sự kiện không đọc thẳng bảng thông báo', 'chặn 42501',
  pg_temp.thu('SELECT * FROM mot_cua.thong_bao'));
RESET ROLE;

SELECT pg_temp.kiem('tổng: X, Y mỗi người 2 (2 mốc); Z (lĩnh vực khác), W (nghỉ) không có', 'X=2 Y=2',
  (SELECT string_agg(split_part(c.ho_ten, ' ', 3) || '=' || n, ' ' ORDER BY c.ho_ten)
     FROM (SELECT can_bo_id, count(*) n FROM mot_cua.thong_bao WHERE ho_so_id = :H1 GROUP BY can_bo_id) t
     JOIN mot_cua.can_bo c ON c.id = t.can_bo_id));
SELECT pg_temp.kiem('kênh email, SMS chỉ ghi giả lập, cho thông báo đầu (mốc 2026-11-02)', '4 gia_lap',
  (SELECT count(*) || ' ' || string_agg(DISTINCT k.trang_thai, ',')
     FROM mot_cua.thong_bao_kenh k JOIN mot_cua.thong_bao t ON t.id = k.thong_bao_id WHERE t.ho_so_id = :H1));
SELECT pg_temp.kiem('nội dung: mã hồ sơ, thủ tục, hạn; không họ tên, số điện thoại người nộp', 'có không',
  (SELECT CASE WHEN bool_and(tieu_de LIKE '%HS20261024-TB0001%' AND noi_dung LIKE '%02/11/2026%') THEN 'có' ELSE 'không' END || ' ' ||
          CASE WHEN bool_or(tieu_de || noi_dung ~ '(Người Thử|0900005656)') THEN 'có' ELSE 'không' END
     FROM mot_cua.thong_bao WHERE ho_so_id = :H1 AND moc = '2026-11-02'));

-- Đọc và đánh dấu (cán bộ qua /api) --------------------------------------------------------------
SELECT pg_temp.vai('can_bo', 'test-tb-x');
SELECT pg_temp.kiem('cán bộ X chỉ thấy thông báo của mình', '2 true',
  (SELECT count(*) || ' ' || bool_and(can_bo_id = '7e5b0000-0000-4000-8000-0000000000c1') FROM mot_cua.thong_bao));
SELECT id AS tb_x FROM mot_cua.thong_bao WHERE moc = '2026-11-02' \gset
UPDATE mot_cua.thong_bao SET da_doc_luc = '2000-01-01' WHERE id = :'tb_x';
SELECT pg_temp.kiem('X đánh dấu đã đọc (gửi giờ giả 2000-01-01) → CSDL đặt giờ hiện tại', 'true',
  (SELECT (da_doc_luc > now() - interval '1 minute')::text FROM mot_cua.thong_bao WHERE id = :'tb_x'));
UPDATE mot_cua.thong_bao SET da_doc_luc = NULL WHERE id = :'tb_x';
SELECT pg_temp.kiem('X bỏ đánh dấu (da_doc_luc = NULL) → vẫn đã đọc', 'true',
  (SELECT (da_doc_luc IS NOT NULL)::text FROM mot_cua.thong_bao WHERE id = :'tb_x'));
SELECT pg_temp.kiem('X sửa tiêu đề → chặn 42501 (chỉ được cột da_doc_luc)', 'chặn 42501',
  pg_temp.thu('UPDATE mot_cua.thong_bao SET tieu_de = ''x'' WHERE id = ' || quote_literal(:'tb_x')));
SELECT pg_temp.kiem('X thêm, xóa thông báo → chặn 42501', 'chặn 42501 chặn 42501',
  pg_temp.thu('INSERT INTO mot_cua.thong_bao (can_bo_id, ho_so_id, loai, moc, su_kien_id, tieu_de, noi_dung) VALUES '
              || '(''7e5b0000-0000-4000-8000-0000000000c1'', ' || quote_literal(:H1) || ', ''sap_tre_han'', ''2026-12-01'', gen_random_uuid(), ''x'', ''x'')') || ' ' ||
  pg_temp.thu('DELETE FROM mot_cua.thong_bao'));
SELECT pg_temp.kiem('X đánh dấu thông báo của Y → 0 dòng (RLS)', '0 dòng',
  pg_temp.thu('UPDATE mot_cua.thong_bao SET da_doc_luc = now() WHERE can_bo_id = ''7e5b0000-0000-4000-8000-0000000000c2'''));
SELECT pg_temp.kiem('X thấy kênh giả lập của thông báo mình', '2',
  (SELECT count(*)::text FROM mot_cua.thong_bao_kenh));
SELECT pg_temp.kiem('cán bộ gọi RPC ghi thông báo → chặn 42501', 'chặn 42501',
  pg_temp.thu('SELECT mot_cua.ghi_thong_bao_sap_tre(pg_temp.su_kien(' || quote_literal(:H1) || ', ''2026-12-01''))'));
RESET ROLE;

SELECT pg_temp.vai('can_bo', 'test-tb-z');
SELECT pg_temp.kiem('cán bộ Z (lĩnh vực khác) không thấy thông báo nào', '0', (SELECT count(*)::text FROM mot_cua.thong_bao));
RESET ROLE;
SELECT pg_temp.vai('cong_dan', 'test-tb-cd');
SELECT pg_temp.kiem('công dân không đọc thông báo của cán bộ', 'chặn 42501', pg_temp.thu('SELECT * FROM mot_cua.thong_bao'));
RESET ROLE;
SELECT pg_temp.kiem('superuser sửa nội dung → chặn (chỉ đánh dấu đã đọc)', 'chặn 42501',
  pg_temp.thu('UPDATE mot_cua.thong_bao SET noi_dung = ''x'' WHERE id = ' || quote_literal(:'tb_x')));
DELETE FROM mot_cua.can_bo WHERE id = '7e5b0000-0000-4000-8000-0000000000c2';
SELECT pg_temp.kiem('xóa cán bộ (smoke dọn cán bộ tạm) → thông báo của người đó xóa theo', '0',
  (SELECT count(*)::text FROM mot_cua.thong_bao WHERE can_bo_id = '7e5b0000-0000-4000-8000-0000000000c2'));

-- Kết quả -------------------------------------------------------------------------------
RESET ROLE;
SELECT CASE WHEN mong_doi IS NOT DISTINCT FROM thuc_te THEN 'ĐẠT' ELSE 'TRƯỢT' END,
       mo_ta, mong_doi, coalesce(thuc_te, 'NULL')
  FROM ket_qua ORDER BY stt;
SELECT count(*) FILTER (WHERE mong_doi IS DISTINCT FROM thuc_te) > 0 AS co_truot FROM ket_qua \gset
ROLLBACK;
\if :co_truot
  DO $$ BEGIN RAISE EXCEPTION 'Có kiểm tra thông báo trượt'; END $$;
\endif

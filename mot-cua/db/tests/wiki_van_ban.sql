-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Test wiki văn bản nội bộ (#95, migration 016): ai ghi được (văn thư, lãnh đạo; văn thư không ghi phạm vi lãnh
-- đạo), ai thấy gì theo phạm vi (toàn xã, lĩnh vực phụ trách, lãnh đạo), phiên bản + lịch sử khi sửa, không xóa,
-- tìm dự phòng không dấu theo RLS, nhật ký kiểm toán wiki.* không chứa tiêu đề/nội dung.
-- Cùng khung với doc_giay_to.sql: một transaction rồi ROLLBACK, mỗi dòng in ra KẾT_QUẢ|mô tả|mong đợi|thực tế.
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
-- Lĩnh vực A, B. Cán bộ CB_A phụ trách A, CB_B phụ trách B. Văn thư VT, lãnh đạo LD chỉ có trong JWT.
INSERT INTO mot_cua.linh_vuc (id, ma, ten) VALUES
  ('7e595000-0000-4000-8000-0000000000a1', 'test_wiki_a', 'Lĩnh vực test wiki A'),
  ('7e595000-0000-4000-8000-0000000000b1', 'test_wiki_b', 'Lĩnh vực test wiki B');
INSERT INTO mot_cua.can_bo (id, sub, ho_ten, chuc_vu) VALUES
  ('7e595000-0000-4000-8000-0000000000c1', 'test-wiki-cb-a', 'Cán bộ test wiki A', 'Thử'),
  ('7e595000-0000-4000-8000-0000000000c2', 'test-wiki-cb-b', 'Cán bộ test wiki B', 'Thử');
INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES
  ('7e595000-0000-4000-8000-0000000000c1', '7e595000-0000-4000-8000-0000000000a1'),
  ('7e595000-0000-4000-8000-0000000000c2', '7e595000-0000-4000-8000-0000000000b1');

-- Câu thêm văn bản wiki như mot-cua-api gửi qua PostgREST bằng token của người gọi (id do CSDL sinh).
CREATE FUNCTION pg_temp.them(pham_vi text, linh_vuc text, noi_dung text) RETURNS text
LANGUAGE sql AS $$
  SELECT format($q$INSERT INTO mot_cua.wiki_van_ban (tieu_de, loai, noi_dung, pham_vi, linh_vuc_id)
                   VALUES (%L, 'huong_dan', %L, %L, %L)$q$,
                'Văn bản test ' || pham_vi, noi_dung, pham_vi, linh_vuc)
$$;
-- Id của bốn văn bản thử (điền sau khi thêm, theo dấu nội dung), để kết quả không phụ thuộc dữ liệu mẫu.
CREATE TEMP TABLE ids (ten text PRIMARY KEY, id uuid);
GRANT SELECT ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.thay(cau text) RETURNS text
LANGUAGE sql AS $$
  SELECT replace(replace(replace(replace(cau,
    ':W_XA', (SELECT id::text FROM pg_temp.ids WHERE ten = 'W_XA')),
    ':W_A', (SELECT id::text FROM pg_temp.ids WHERE ten = 'W_A')),
    ':W_B', (SELECT id::text FROM pg_temp.ids WHERE ten = 'W_B')),
    ':W_LD', (SELECT id::text FROM pg_temp.ids WHERE ten = 'W_LD'))
$$;
CREATE FUNCTION pg_temp.thay_duoc() RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(w.pham_vi, ',' ORDER BY array_position(ARRAY['W_XA', 'W_A', 'W_B', 'W_LD'], i.ten)), '')
    FROM mot_cua.wiki_van_ban w JOIN pg_temp.ids i ON i.id = w.id
$$;

-- 1. Ai ghi được --------------------------------------------------------------------------------
SELECT pg_temp.vai('can_bo', 'test-wiki-cb-a');
SELECT pg_temp.kiem('cán bộ thêm văn bản wiki → chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.them('toan_xa', NULL, 'x')));
SELECT pg_temp.vai('cong_dan', 'test-wiki-cd');
SELECT pg_temp.kiem('công dân thêm văn bản wiki → chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.them('toan_xa', NULL, 'x')));
SELECT pg_temp.vai('dich_vu_tep', 'service-account-mot_cua_tep');
SELECT pg_temp.kiem('dịch vụ tệp thêm văn bản wiki → chặn (chỉ đọc để dựng chỉ mục)', 'chặn 42501',
  pg_temp.thu(pg_temp.them('toan_xa', NULL, 'x')));

RESET ROLE;
SELECT stt AS dau_truoc FROM mot_cua.dau_chuoi_kiem_toan \gset
SELECT pg_temp.vai('van_thu', 'test-wiki-vt');
SELECT pg_temp.kiem('văn thư thêm văn bản toàn xã → 1 dòng', '1 dòng',
  pg_temp.thu(pg_temp.them('toan_xa', NULL, 'x')));
DO $$ BEGIN
  EXECUTE pg_temp.them('toan_xa', NULL,
                       'Quy chế ZQWIKI tiếp công dân: chào hỏi, ghi biên nhận.');
  EXECUTE pg_temp.them('linh_vuc', '7e595000-0000-4000-8000-0000000000a1',
                       'Hướng dẫn ZQWIKI lĩnh vực A.');
  EXECUTE pg_temp.them('linh_vuc', '7e595000-0000-4000-8000-0000000000b1',
                       'Hướng dẫn ZQWIKI lĩnh vực B.');
END $$;
RESET ROLE;
INSERT INTO pg_temp.ids
SELECT CASE WHEN noi_dung LIKE 'Quy chế ZQWIKI%' THEN 'W_XA' WHEN noi_dung LIKE '%lĩnh vực A.' THEN 'W_A' ELSE 'W_B' END, id
  FROM mot_cua.wiki_van_ban WHERE noi_dung LIKE '%ZQWIKI%';
SELECT pg_temp.vai('van_thu', 'test-wiki-vt');
SELECT pg_temp.kiem('văn thư thêm văn bản phạm vi lãnh đạo → chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.them('lanh_dao', NULL, 'x')));
SELECT pg_temp.kiem('phạm vi lĩnh vực mà không có lĩnh vực → chặn 23514', 'chặn 23514',
  pg_temp.thu(pg_temp.them('linh_vuc', NULL, 'x')));
SELECT pg_temp.kiem('văn thư tự khai người tạo → chặn (không có quyền cột)', 'chặn 42501',
  pg_temp.thu($q$INSERT INTO mot_cua.wiki_van_ban (tieu_de, loai, noi_dung, nguoi_tao_sub)
                VALUES ('Giả mạo', 'khac', 'x', 'nguoi-khac')$q$));
SELECT pg_temp.kiem('người tạo lấy từ JWT, phiên bản 1', 'test-wiki-vt test-wiki-vt 1',
  (SELECT nguoi_tao_sub || ' ' || nguoi_sua_sub || ' ' || phien_ban FROM mot_cua.wiki_van_ban WHERE id = (SELECT id FROM pg_temp.ids WHERE ten = 'W_XA')));
SELECT pg_temp.vai('lanh_dao', 'test-wiki-ld');
DO $$ BEGIN
  EXECUTE pg_temp.them('lanh_dao', NULL, 'Ghi chú ZQWIKI họp lãnh đạo.');
END $$;
RESET ROLE;
INSERT INTO pg_temp.ids SELECT 'W_LD', id FROM mot_cua.wiki_van_ban WHERE noi_dung LIKE 'Ghi chú ZQWIKI%';
SELECT pg_temp.vai('lanh_dao', 'test-wiki-ld');
SELECT pg_temp.kiem('lãnh đạo thêm văn bản phạm vi lãnh đạo → có', 'lanh_dao',
  (SELECT pham_vi FROM mot_cua.wiki_van_ban WHERE id = (SELECT id FROM pg_temp.ids WHERE ten = 'W_LD')));
RESET ROLE;

-- 2. Ai thấy gì ----------------------------------------------------------------------------------
SELECT pg_temp.vai('can_bo', 'test-wiki-cb-a');
SELECT pg_temp.kiem('cán bộ A thấy toàn xã + lĩnh vực A', 'toan_xa,linh_vuc', pg_temp.thay_duoc());
SELECT pg_temp.vai('can_bo', 'test-wiki-cb-b');
SELECT pg_temp.kiem('cán bộ B thấy toàn xã + lĩnh vực B', 'toan_xa,linh_vuc', pg_temp.thay_duoc());
SELECT pg_temp.kiem('cán bộ B: văn bản lĩnh vực của B là văn bản B', 'W_B',
  (SELECT i.ten FROM mot_cua.wiki_van_ban w JOIN pg_temp.ids i ON i.id = w.id WHERE w.pham_vi = 'linh_vuc'));
SELECT pg_temp.vai('can_bo', 'test-wiki-cb-khong-phan-cong');
SELECT pg_temp.kiem('cán bộ chưa được phân công chỉ thấy toàn xã', 'toan_xa', pg_temp.thay_duoc());
SELECT pg_temp.vai('van_thu', 'test-wiki-vt');
SELECT pg_temp.kiem('văn thư thấy mọi văn bản trừ phạm vi lãnh đạo', 'toan_xa,linh_vuc,linh_vuc', pg_temp.thay_duoc());
SELECT pg_temp.vai('lanh_dao', 'test-wiki-ld');
SELECT pg_temp.kiem('lãnh đạo thấy tất cả', 'toan_xa,linh_vuc,linh_vuc,lanh_dao', pg_temp.thay_duoc());
SELECT pg_temp.vai('dich_vu_tep', 'service-account-mot_cua_tep');
SELECT pg_temp.kiem('dịch vụ tệp (dựng chỉ mục) thấy tất cả', 'toan_xa,linh_vuc,linh_vuc,lanh_dao', pg_temp.thay_duoc());
SELECT pg_temp.vai('cong_dan', 'test-wiki-cd');
SELECT pg_temp.kiem('công dân đọc wiki → chặn', 'chặn 42501', pg_temp.dem('SELECT 1 FROM mot_cua.wiki_van_ban'));
SELECT pg_temp.vai('anon');
SELECT pg_temp.kiem('anon đọc wiki → chặn', 'chặn 42501', pg_temp.dem('SELECT 1 FROM mot_cua.wiki_van_ban'));
SELECT pg_temp.kiem('anon gọi tìm wiki → chặn', 'chặn 42501', pg_temp.dem($q$SELECT * FROM mot_cua.tim_wiki('a')$q$));
RESET ROLE;

-- 3. Sửa, phiên bản, lịch sử ------------------------------------------------------------------------
SELECT pg_temp.vai('van_thu', 'test-wiki-vt2');
UPDATE mot_cua.wiki_van_ban SET noi_dung = 'Quy chế ZQWIKI tiếp công dân, bản sửa: thêm giờ làm việc.' WHERE id = (SELECT id FROM pg_temp.ids WHERE ten = 'W_XA');
SELECT pg_temp.kiem('văn thư sửa nội dung → phiên bản 2, người sửa mới, 1 dòng lịch sử giữ nội dung cũ',
  '2 test-wiki-vt2 test-wiki-vt 1 Quy chế ZQWIKI tiếp công dân: chào hỏi, ghi biên nhận.',
  (SELECT w.phien_ban || ' ' || w.nguoi_sua_sub || ' ' || w.nguoi_tao_sub || ' '
          || (SELECT count(*) FROM mot_cua.wiki_van_ban_lich_su l WHERE l.van_ban_id = w.id) || ' '
          || (SELECT l.noi_dung FROM mot_cua.wiki_van_ban_lich_su l WHERE l.van_ban_id = w.id AND l.phien_ban = 1)
     FROM mot_cua.wiki_van_ban w WHERE w.id = (SELECT id FROM pg_temp.ids WHERE ten = 'W_XA')));
UPDATE mot_cua.wiki_van_ban SET tieu_de = tieu_de WHERE id = (SELECT id FROM pg_temp.ids WHERE ten = 'W_XA');
SELECT pg_temp.kiem('ghi lại không đổi gì → vẫn phiên bản 2', '2',
  (SELECT phien_ban::text FROM mot_cua.wiki_van_ban WHERE id = (SELECT id FROM pg_temp.ids WHERE ten = 'W_XA')));
SELECT pg_temp.kiem('văn thư sửa văn bản phạm vi lãnh đạo → 0 dòng (không thấy)', '0 dòng',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.wiki_van_ban SET noi_dung = 'x' WHERE id = ':W_LD'$q$)));
SELECT pg_temp.kiem('văn thư chuyển văn bản sang phạm vi lãnh đạo → chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.wiki_van_ban SET pham_vi = 'lanh_dao' WHERE id = ':W_A'$q$)));
SELECT pg_temp.kiem('văn thư đổi người tạo → chặn (không có quyền cột)', 'chặn 42501',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.wiki_van_ban SET nguoi_tao_sub = 'x' WHERE id = ':W_A'$q$)));
UPDATE mot_cua.wiki_van_ban SET trang_thai = 'het_hieu_luc' WHERE id = (SELECT id FROM pg_temp.ids WHERE ten = 'W_B');
SELECT pg_temp.vai('can_bo', 'test-wiki-cb-a');
SELECT pg_temp.kiem('cán bộ sửa văn bản wiki → chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.wiki_van_ban SET noi_dung = 'x' WHERE id = ':W_XA'$q$)));
SELECT pg_temp.kiem('cán bộ A thấy lịch sử văn bản toàn xã (1 phiên bản cũ)', '1',
  pg_temp.dem(pg_temp.thay($q$SELECT 1 FROM mot_cua.wiki_van_ban_lich_su WHERE van_ban_id = ':W_XA'$q$)));
SELECT pg_temp.vai('can_bo', 'test-wiki-cb-b');
SELECT pg_temp.kiem('cán bộ B thấy lịch sử văn bản lĩnh vực B (bản trước khi ngừng hiệu lực)', '1',
  pg_temp.dem(pg_temp.thay($q$SELECT 1 FROM mot_cua.wiki_van_ban_lich_su WHERE van_ban_id = ':W_B'$q$)));
SELECT pg_temp.vai('can_bo', 'test-wiki-cb-a');
SELECT pg_temp.kiem('cán bộ A không thấy lịch sử văn bản lĩnh vực B', '0',
  pg_temp.dem(pg_temp.thay($q$SELECT 1 FROM mot_cua.wiki_van_ban_lich_su WHERE van_ban_id = ':W_B'$q$)));
SELECT pg_temp.kiem('cán bộ ghi lịch sử → chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.thay($q$INSERT INTO mot_cua.wiki_van_ban_lich_su (van_ban_id, phien_ban, tieu_de, loai, noi_dung,
      pham_vi, trang_thai, nguoi_sua_sub, sua_luc) VALUES (':W_XA', 99, 'x', 'khac', 'x', 'toan_xa', 'hieu_luc', 'x', now())$q$)));
SELECT pg_temp.vai('lanh_dao', 'test-wiki-ld');
SELECT pg_temp.kiem('lãnh đạo xóa văn bản wiki → chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.thay($q$DELETE FROM mot_cua.wiki_van_ban WHERE id = ':W_A'$q$)));
RESET ROLE;
SELECT pg_temp.kiem('superuser xóa văn bản wiki → trigger chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.thay($q$DELETE FROM mot_cua.wiki_van_ban WHERE id = ':W_A'$q$)));
SELECT pg_temp.kiem('superuser sửa lịch sử → trigger chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.wiki_van_ban_lich_su SET noi_dung = 'x' WHERE van_ban_id = ':W_XA'$q$)));

-- 4. Tìm dự phòng (RPC tim_wiki, RLS của người gọi) ------------------------------------------------------
SELECT pg_temp.vai('can_bo', 'test-wiki-cb-a');
SELECT pg_temp.kiem('cán bộ A tìm "zqwiki" → văn bản toàn xã + lĩnh vực A', 'toan_xa,linh_vuc',
  (SELECT string_agg(pham_vi, ',' ORDER BY pham_vi DESC) FROM mot_cua.tim_wiki('zqwiki') WHERE id IN (SELECT id FROM pg_temp.ids)));
SELECT pg_temp.kiem('tìm không dấu, chữ hoa: "QUY CHE ZQWIKI TIEP CONG DAN" → thấy', '1',
  (SELECT count(*)::text FROM mot_cua.tim_wiki('QUY CHE ZQWIKI TIEP CONG DAN') WHERE id IN (SELECT id FROM pg_temp.ids)));
SELECT pg_temp.kiem('tìm nội dung bản cũ "chào hỏi, ghi biên nhận" → không còn', '0',
  (SELECT count(*)::text FROM mot_cua.tim_wiki('ZQWIKI tiếp công dân: chào hỏi') WHERE id IN (SELECT id FROM pg_temp.ids)));
SELECT pg_temp.vai('can_bo', 'test-wiki-cb-b');
SELECT pg_temp.kiem('cán bộ B: văn bản B hết hiệu lực không hiện, trừ khi xem cả hết hiệu lực', '0 1',
  (SELECT count(*)::text FROM mot_cua.tim_wiki('lĩnh vực B') WHERE id IN (SELECT id FROM pg_temp.ids)) || ' ' ||
  (SELECT count(*)::text FROM mot_cua.tim_wiki('lĩnh vực B', true) WHERE id IN (SELECT id FROM pg_temp.ids)));
SELECT pg_temp.kiem('cán bộ tìm từ khóa văn bản lãnh đạo → 0', '0',
  (SELECT count(*)::text FROM mot_cua.tim_wiki('họp lãnh đạo') WHERE id IN (SELECT id FROM pg_temp.ids)));
SELECT pg_temp.vai('lanh_dao', 'test-wiki-ld');
SELECT pg_temp.kiem('lãnh đạo tìm từ khóa văn bản lãnh đạo → 1', '1',
  (SELECT count(*)::text FROM mot_cua.tim_wiki('họp lãnh đạo') WHERE id IN (SELECT id FROM pg_temp.ids)));
RESET ROLE;

-- 5. Kiểm toán ----------------------------------------------------------------------------------
SELECT pg_temp.kiem('nhật ký: thêm ×4 → sửa → ngừng hiệu lực (văn bản test)',
  'wiki.them,wiki.them,wiki.them,wiki.them,wiki.sua,wiki.ngung_hieu_luc',
  (SELECT string_agg(hanh_dong, ',' ORDER BY stt) FROM mot_cua.nhat_ky_kiem_toan
    WHERE stt > :dau_truoc AND doi_tuong = 'wiki_van_ban' AND doi_tuong_id IN (SELECT id::text FROM pg_temp.ids)));
SELECT pg_temp.kiem('nhật ký sửa: người sửa, phiên bản, trường đổi, SHA-256 nội dung mới',
  'test-wiki-vt2 2 ["noi_dung"] true',
  (SELECT k.nguoi_sub || ' ' || (k.du_lieu ->> 'phienBan') || ' ' || (k.du_lieu -> 'truongDoi')::text || ' '
          || ((k.du_lieu ->> 'sha256NoiDung') = encode(sha256(convert_to(w.noi_dung, 'UTF8')), 'hex'))
     FROM mot_cua.nhat_ky_kiem_toan k JOIN mot_cua.wiki_van_ban w ON w.id::text = k.doi_tuong_id
    WHERE k.stt > :dau_truoc AND k.hanh_dong = 'wiki.sua'));
SELECT pg_temp.kiem('nhật ký nguồn api, người tạo văn bản lãnh đạo đúng', 'api test-wiki-ld',
  (SELECT nguon || ' ' || nguoi_sub FROM mot_cua.nhat_ky_kiem_toan
    WHERE stt > :dau_truoc AND hanh_dong = 'wiki.them' AND doi_tuong_id = (SELECT id::text FROM pg_temp.ids WHERE ten = 'W_LD')));
SELECT pg_temp.kiem('nhật ký không chứa tiêu đề hay nội dung văn bản', '0',
  (SELECT count(*)::text FROM mot_cua.nhat_ky_kiem_toan
    WHERE stt > :dau_truoc AND (du_lieu::text LIKE '%ZQWIKI%' OR du_lieu::text LIKE '%Văn bản test%')));
SELECT pg_temp.kiem('chuỗi kiểm toán vẫn hợp lệ', 'true', (mot_cua.xac_minh_kiem_toan() ->> 'hopLe'));

SELECT CASE WHEN mong_doi IS NOT DISTINCT FROM thuc_te THEN 'ĐẠT' ELSE 'TRƯỢT' END,
       mo_ta, mong_doi, coalesce(thuc_te, 'NULL')
  FROM ket_qua ORDER BY stt;
SELECT count(*) FILTER (WHERE mong_doi IS DISTINCT FROM thuc_te) > 0 AS co_truot FROM ket_qua \gset
ROLLBACK;
\if :co_truot
  DO $$ BEGIN RAISE EXCEPTION 'Có kiểm tra wiki văn bản trượt'; END $$;
\endif

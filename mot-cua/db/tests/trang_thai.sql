-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Test trạng thái hồ sơ theo quy trình (#73, migration 006): RPC dong_bo_trang_thai chỉ cho tài
-- khoản dịch vụ dich_vu_su_kien, đổi trạng thái + lịch sử + hộp thư đi trong một lần gọi, gọi lại
-- an toàn; cho_phe_duyet chỉ quy trình chuyển; RLS công dân chỉ sửa khi cho_bo_sung vẫn giữ; lịch
-- sử chuyển trạng thái chỉ thêm, xem theo quyền xem hồ sơ; bộ nạp gói ghi ánh xạ bước → trạng thái.
-- Cùng khung với rls.sql: một transaction rồi ROLLBACK, không phụ thuộc seed; mỗi dòng in ra
-- KẾT_QUẢ|mô tả|mong đợi|thực tế. make test-sql và make smoke chạy tệp này.
\set ON_ERROR_STOP 1
BEGIN;

-- Khung test -----------------------------------------------------------------------
CREATE TEMP TABLE ket_qua (stt bigserial, mo_ta text, mong_doi text, thuc_te text);
GRANT SELECT, INSERT ON ket_qua TO PUBLIC;
GRANT USAGE ON SEQUENCE ket_qua_stt_seq TO PUBLIC;

-- vai(role, sub): chuyển sang role và đặt claim như PostgREST.
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

-- dem(câu SELECT) → số dòng nhìn thấy, hoặc "chặn <SQLSTATE>".
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

-- thu(câu ghi) → "<n> dòng" hoặc "chặn <SQLSTATE>"; câu có RETURNING thì trả giá trị cột
-- đầu của dòng đầu. Luôn hoàn tác thay đổi (ném lỗi P0099 rồi bắt lại).
CREATE FUNCTION pg_temp.thu(cau text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  n  bigint;
  gt text;
BEGIN
  BEGIN
    IF cau ~* '\mreturning\M' THEN
      EXECUTE cau INTO gt;
    ELSE
      EXECUTE cau;
      GET DIAGNOSTICS n = ROW_COUNT;
      gt := n || ' dòng';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = coalesce(gt, 'NULL');
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN RETURN SQLERRM;
    WHEN OTHERS THEN RETURN 'chặn ' || SQLSTATE;
  END;
END
$$;


-- ev(id, hồ sơ, loại, khóa) → một dòng hộp thư đi dạng main.py gửi (su_kien.dong_hop_thu).
CREATE FUNCTION pg_temp.ev(p_ma uuid, p_hs uuid, p_loai text DEFAULT 'ho_so.chuyen_buoc', p_khoa text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_array(jsonb_build_object(
    'id', p_ma, 'loai', p_loai, 'ho_so_id', p_hs, 'khoa_chong_trung', p_khoa,
    'noi_dung', jsonb_build_object('phienBan', 1, 'id', p_ma, 'loai', p_loai, 'hoSoId', p_hs, 'duLieu', '{}'::jsonb)))
$$;
-- tt(hồ sơ) → "trạng thái/lý do" (không dùng '|': make smoke tách cột kết quả theo '|')
CREATE FUNCTION pg_temp.tt(p_id uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT h.trang_thai || '/' || coalesce(h.ly_do, '') FROM mot_cua.ho_so h WHERE h.id = p_id
$$;
-- dong_bo(...) như mot-cua-api gọi /rpc/dong_bo_trang_thai bằng token mot_cua_su_kien → kết quả
-- dạng "trangThaiTruoc>trangThai đổi:<daDoi> sk:<soSuKien>", hoặc "chặn <SQLSTATE>".
CREATE FUNCTION pg_temp.dong_bo(p_hs uuid, p_tt text, p_ly_do text, p_buoc text, p_nguoi text, p_sk jsonb,
                                p_nguon text DEFAULT 'quy_trinh') RETURNS text
LANGUAGE plpgsql AS $$
DECLARE kq jsonb;
BEGIN
  PERFORM pg_temp.vai('dich_vu_su_kien', 'service-account-mot_cua_su_kien');
  kq := mot_cua.dong_bo_trang_thai(p_hs, p_tt, p_ly_do, p_buoc, p_nguon, p_nguoi, p_sk);
  RESET ROLE;
  RETURN (kq ->> 'trangThaiTruoc') || '>' || (kq ->> 'trangThai') || ' đổi:' || (kq ->> 'daDoi') || ' sk:' || (kq ->> 'soSuKien');
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN 'chặn ' || SQLSTATE;
END
$$;

-- Dữ liệu test (superuser, bỏ qua RLS) --------------------------------------------------
-- Lĩnh vực A, B; thủ tục TEST_TT (lĩnh vực A, có ánh xạ). Cán bộ CB_A phụ trách A, CB_B phụ trách B.
-- Công dân X nộp H1 (có quy trình), H2 (có quy trình), H3 (hồ sơ giấy, xử lý tại quầy).
INSERT INTO mot_cua.linh_vuc (id, ma, ten) VALUES
  ('7e573000-0000-4000-8000-0000000000a1', 'test_tt_a', 'Lĩnh vực test trạng thái A'),
  ('7e573000-0000-4000-8000-0000000000b1', 'test_tt_b', 'Lĩnh vực test trạng thái B');
INSERT INTO mot_cua.thu_tuc (id, ma, ten, linh_vuc_id, so_ngay_xu_ly, cong_khai, trang_thai_buoc) VALUES
  ('7e573000-0000-4000-8000-0000000000a2', 'TEST_TT', 'Thủ tục test trạng thái', '7e573000-0000-4000-8000-0000000000a1', 2, true,
   '{"tiep_nhan": "moi", "bo_sung": "cho_bo_sung", "tham_dinh": "dang_xu_ly", "phe_duyet": "cho_phe_duyet"}');
INSERT INTO mot_cua.can_bo (id, sub, ho_ten, chuc_vu) VALUES
  ('7e573000-0000-4000-8000-0000000000c1', 'test-tt-cb-a', 'Cán bộ test A', 'Thử'),
  ('7e573000-0000-4000-8000-0000000000c2', 'test-tt-cb-b', 'Cán bộ test B', 'Thử');
INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES
  ('7e573000-0000-4000-8000-0000000000c1', '7e573000-0000-4000-8000-0000000000a1'),
  ('7e573000-0000-4000-8000-0000000000c2', '7e573000-0000-4000-8000-0000000000b1');
\set H1 '''7e573000-0000-4000-8000-000000000001'''
\set H2 '''7e573000-0000-4000-8000-000000000002'''
\set H3 '''7e573000-0000-4000-8000-000000000003'''
INSERT INTO mot_cua.ho_so (id, ma_ho_so, thu_tuc_id, nguoi_nop_sub, ho_ten_nguoi_nop) VALUES
  (:H1, 'TEST-TT-1', '7e573000-0000-4000-8000-0000000000a2', 'test-tt-cd-x', 'Công dân X'),
  (:H2, 'TEST-TT-2', '7e573000-0000-4000-8000-0000000000a2', 'test-tt-cd-x', 'Công dân X'),
  (:H3, 'TEST-TT-3', '7e573000-0000-4000-8000-0000000000a2', 'test-tt-cd-x', 'Công dân X');

SELECT pg_temp.kiem('nộp hồ sơ: lịch sử có dòng đầu (NULL → moi, nguồn nop)', 'NULL>moi nop', (
  SELECT coalesce(tu_trang_thai, 'NULL') || '>' || den_trang_thai || ' ' || nguon
    FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = :H1));

-- 1. Quyền gọi RPC ------------------------------------------------------------------------
SELECT pg_temp.vai('anon');
SELECT pg_temp.kiem('anon gọi dong_bo_trang_thai → chặn', 'chặn 42501',
  pg_temp.thu('SELECT mot_cua.dong_bo_trang_thai(' || :'H1' || '::uuid, ''hoan_tat'')'));
SELECT pg_temp.vai('cong_dan', 'test-tt-cd-x');
SELECT pg_temp.kiem('công dân (người nộp) gọi dong_bo_trang_thai → chặn', 'chặn 42501',
  pg_temp.thu('SELECT mot_cua.dong_bo_trang_thai(' || :'H1' || '::uuid, ''hoan_tat'')'));
SELECT pg_temp.vai('can_bo', 'test-tt-cb-a');
SELECT pg_temp.kiem('cán bộ phụ trách gọi dong_bo_trang_thai → chặn', 'chặn 42501',
  pg_temp.thu('SELECT mot_cua.dong_bo_trang_thai(' || :'H1' || '::uuid, ''hoan_tat'')'));
SELECT pg_temp.vai('lanh_dao', 'test-tt-ld');
SELECT pg_temp.kiem('lãnh đạo gọi dong_bo_trang_thai → chặn', 'chặn 42501',
  pg_temp.thu('SELECT mot_cua.dong_bo_trang_thai(' || :'H1' || '::uuid, ''hoan_tat'')'));
SELECT pg_temp.vai('dich_vu_tep', 'service-account-mot_cua_tep');
SELECT pg_temp.kiem('dịch vụ tệp gọi dong_bo_trang_thai → chặn', 'chặn 42501',
  pg_temp.thu('SELECT mot_cua.dong_bo_trang_thai(' || :'H1' || '::uuid, ''hoan_tat'')'));
RESET ROLE;

-- 2. Đi theo quy trình: moi → dang_xu_ly → cho_bo_sung → dang_xu_ly → cho_phe_duyet → hoan_tat ---
SELECT pg_temp.kiem('tiếp nhận xong (tiep_nhan): moi → dang_xu_ly, ghi 1 sự kiện', 'moi>dang_xu_ly đổi:true sk:1',
  pg_temp.dong_bo(:H1, 'dang_xu_ly', NULL, 'tiep_nhan', 'test-tt-cb-a', pg_temp.ev('7e573000-0000-4000-8000-0000000000e1', :H1)));
SELECT pg_temp.kiem('hồ sơ giao cho cán bộ vừa xử lý (phụ trách lĩnh vực)', '7e573000-0000-4000-8000-0000000000c1', (
  SELECT can_bo_xu_ly_id::text FROM mot_cua.ho_so WHERE id = :H1));
SELECT pg_temp.kiem('sự kiện trong hộp thư đi mang duLieu.trangThai sau khi đổi', 'ho_so.chuyen_buoc dang_xu_ly', (
  SELECT loai || ' ' || (noi_dung -> 'duLieu' ->> 'trangThai') FROM mot_cua.hop_thu_su_kien
   WHERE id = '7e573000-0000-4000-8000-0000000000e1'));
SELECT pg_temp.kiem('lịch sử: moi → dang_xu_ly, nguồn quy_trinh, bước tiep_nhan, người xử lý', 'moi>dang_xu_ly quy_trinh tiep_nhan test-tt-cb-a', (
  SELECT tu_trang_thai || '>' || den_trang_thai || ' ' || nguon || ' ' || buoc || ' ' || nguoi_sub
    FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = :H1 ORDER BY id DESC LIMIT 1));
SELECT pg_temp.kiem('gọi lại đúng lần đó (API thử lại): không đổi, không thêm sự kiện, không thêm lịch sử', 'dang_xu_ly>dang_xu_ly đổi:false sk:0 2',
  pg_temp.dong_bo(:H1, 'dang_xu_ly', NULL, 'tiep_nhan', 'test-tt-cb-a', pg_temp.ev('7e573000-0000-4000-8000-0000000000e1', :H1))
  || ' ' || pg_temp.dem('SELECT 1 FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = ' || :'H1'));
SELECT pg_temp.kiem('sự kiện trùng khóa chống trùng (id khác) bị bỏ qua', 'sk:1 sk:0', (
  SELECT split_part(pg_temp.dong_bo(:H1, NULL, NULL, NULL, NULL, pg_temp.ev('7e573000-0000-4000-8000-0000000000e2', :H1, 'ho_so.chuyen_buoc', 'test:khoa-1')), ' ', 3)
         || ' ' || split_part(pg_temp.dong_bo(:H1, NULL, NULL, NULL, NULL, pg_temp.ev('7e573000-0000-4000-8000-0000000000e3', :H1, 'ho_so.chuyen_buoc', 'test:khoa-1')), ' ', 3)));

SELECT pg_temp.vai('cong_dan', 'test-tt-cd-x');
SELECT pg_temp.kiem('dang_xu_ly: công dân sửa hồ sơ → 0 dòng (RLS)', '0 dòng',
  pg_temp.thu('UPDATE mot_cua.ho_so SET so_dien_thoai = ''0900000073'' WHERE id = ' || :'H1'));
RESET ROLE;
SELECT pg_temp.kiem('yêu cầu bổ sung: dang_xu_ly → cho_bo_sung, lý do = ghi chú cán bộ', 'dang_xu_ly>cho_bo_sung đổi:true sk:1 cho_bo_sung/Thiếu tờ khai',
  pg_temp.dong_bo(:H1, 'cho_bo_sung', 'Thiếu tờ khai', 'tiep_nhan', 'test-tt-cb-a', pg_temp.ev('7e573000-0000-4000-8000-0000000000e4', :H1))
  || ' ' || pg_temp.tt(:H1));
SELECT pg_temp.kiem('lịch sử cho_bo_sung ghi lý do', 'Thiếu tờ khai', (
  SELECT ly_do FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = :H1 ORDER BY id DESC LIMIT 1));
SELECT pg_temp.vai('cong_dan', 'test-tt-cd-x');
SELECT pg_temp.kiem('cho_bo_sung: công dân (người nộp) sửa số điện thoại → 1 dòng', '1 dòng',
  pg_temp.thu('UPDATE mot_cua.ho_so SET so_dien_thoai = ''0900000073'' WHERE id = ' || :'H1'));
SELECT pg_temp.vai('cong_dan', 'test-tt-cd-y');
SELECT pg_temp.kiem('cho_bo_sung: công dân khác sửa → 0 dòng', '0 dòng',
  pg_temp.thu('UPDATE mot_cua.ho_so SET so_dien_thoai = ''0900000073'' WHERE id = ' || :'H1'));
SELECT pg_temp.vai('cong_dan', 'test-tt-cd-x');
SELECT pg_temp.kiem('cho_bo_sung: công dân không tự đặt cho_phe_duyet/hoan_tat (trigger chặn)', 'chặn 23514 chặn 23514',
  pg_temp.thu('UPDATE mot_cua.ho_so SET trang_thai = ''cho_phe_duyet'' WHERE id = ' || :'H1') || ' ' ||
  pg_temp.thu('UPDATE mot_cua.ho_so SET trang_thai = ''hoan_tat'' WHERE id = ' || :'H1'));
RESET ROLE;
SELECT pg_temp.kiem('công dân nộp lại (bo_sung xong, quay về tiep_nhan): cho_bo_sung → dang_xu_ly', 'cho_bo_sung>dang_xu_ly đổi:true sk:1',
  pg_temp.dong_bo(:H1, 'dang_xu_ly', NULL, 'bo_sung', 'test-tt-cd-x', pg_temp.ev('7e573000-0000-4000-8000-0000000000e5', :H1)));
SELECT pg_temp.vai('cong_dan', 'test-tt-cd-x');
SELECT pg_temp.kiem('đã nộp lại: công dân sửa → 0 dòng (RLS)', '0 dòng',
  pg_temp.thu('UPDATE mot_cua.ho_so SET so_dien_thoai = ''0900000074'' WHERE id = ' || :'H1'));
RESET ROLE;
SELECT pg_temp.kiem('thẩm định đạt (sang phe_duyet): dang_xu_ly → cho_phe_duyet', 'dang_xu_ly>cho_phe_duyet đổi:true sk:1',
  pg_temp.dong_bo(:H1, 'cho_phe_duyet', NULL, 'tham_dinh', 'test-tt-cb-a', pg_temp.ev('7e573000-0000-4000-8000-0000000000e6', :H1)));

SELECT pg_temp.vai('can_bo', 'test-tt-cb-a');
SELECT pg_temp.kiem('cho_phe_duyet: cán bộ tự chuyển hoan_tat/tu_choi/dang_xu_ly qua /api → chặn', 'chặn 23514 chặn 23514 chặn 23514',
  pg_temp.thu('UPDATE mot_cua.ho_so SET trang_thai = ''hoan_tat'' WHERE id = ' || :'H1') || ' ' ||
  pg_temp.thu('UPDATE mot_cua.ho_so SET trang_thai = ''tu_choi'', ly_do = ''x'' WHERE id = ' || :'H1') || ' ' ||
  pg_temp.thu('UPDATE mot_cua.ho_so SET trang_thai = ''dang_xu_ly'' WHERE id = ' || :'H1'));
-- Role API tự đặt GUC của RPC cũng không vượt được bảng chuyển trạng thái.
SELECT set_config('mot_cua.dong_bo_nguon', 'quy_trinh', true);
SELECT pg_temp.kiem('cán bộ tự set_config(mot_cua.dong_bo_nguon) rồi chuyển moi → hoan_tat → chặn', 'chặn 23514',
  pg_temp.thu('UPDATE mot_cua.ho_so SET trang_thai = ''hoan_tat'' WHERE id = ' || :'H2'));
SELECT set_config('mot_cua.dong_bo_nguon', '', true);
RESET ROLE;
SELECT pg_temp.kiem('lãnh đạo phê duyệt, quy trình kết thúc ketQua hoan_tat: cho_phe_duyet → hoan_tat', 'cho_phe_duyet>hoan_tat đổi:true sk:1',
  pg_temp.dong_bo(:H1, 'hoan_tat', NULL, 'phe_duyet', 'test-tt-ld', pg_temp.ev('7e573000-0000-4000-8000-0000000000e7', :H1, 'ho_so.hoan_tat', 'test:ket_thuc')));
SELECT pg_temp.kiem('hoan_tat: có ngày hoàn tất', 'true', (SELECT (ngay_hoan_tat IS NOT NULL)::text FROM mot_cua.ho_so WHERE id = :H1));
SELECT pg_temp.kiem('hồ sơ đã đóng: đồng bộ thêm không đổi trạng thái (sự kiện vẫn ghi)', 'hoan_tat>hoan_tat đổi:false sk:1',
  pg_temp.dong_bo(:H1, 'dang_xu_ly', NULL, 'tham_dinh', NULL, pg_temp.ev('7e573000-0000-4000-8000-0000000000e8', :H1), 'doi_soat'));
SELECT pg_temp.kiem('lịch sử H1 đủ các bước theo thứ tự', 'moi dang_xu_ly cho_bo_sung dang_xu_ly cho_phe_duyet hoan_tat', (
  SELECT string_agg(den_trang_thai, ' ' ORDER BY id) FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = :H1));
SELECT pg_temp.kiem('lịch sử H1: nguồn nộp rồi 5 lần theo quy trình', 'nop quy_trinh quy_trinh quy_trinh quy_trinh quy_trinh', (
  SELECT string_agg(nguon, ' ' ORDER BY id) FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = :H1));

-- 3. Từ chối, đối soát, tham số sai --------------------------------------------------------
SELECT pg_temp.kiem('đối soát (worker): moi → tu_choi', 'moi>tu_choi đổi:true sk:1',
  pg_temp.dong_bo(:H2, 'tu_choi', NULL, NULL, NULL, pg_temp.ev('7e573000-0000-4000-8000-0000000000e9', :H2), 'doi_soat'));
SELECT pg_temp.kiem('tu_choi không có ghi chú → lý do mặc định; lịch sử nguồn doi_soat', 'có doi_soat',
  (SELECT CASE WHEN length(ly_do) > 0 THEN 'có' ELSE 'không' END FROM mot_cua.ho_so WHERE id = :H2)
  || ' ' || (SELECT nguon FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = :H2 ORDER BY id DESC LIMIT 1));
SELECT pg_temp.kiem('quy trình không đưa hồ sơ về moi', 'chặn 22023',
  pg_temp.dong_bo(:H3, 'moi', NULL, NULL, NULL, '[]'));
SELECT pg_temp.kiem('nguồn lạ (api) → chặn', 'chặn 22023',
  pg_temp.dong_bo(:H3, 'dang_xu_ly', NULL, NULL, NULL, '[]', 'api'));
SELECT pg_temp.kiem('sự kiện của hồ sơ khác → chặn, không đổi trạng thái (một transaction)', 'chặn 22023 moi/',
  pg_temp.dong_bo(:H3, 'dang_xu_ly', NULL, NULL, NULL, pg_temp.ev('7e573000-0000-4000-8000-0000000000ea', :H1)) || ' ' || pg_temp.tt(:H3));
SELECT pg_temp.kiem('hồ sơ không tồn tại → chặn', 'chặn P0002',
  pg_temp.dong_bo('7e573000-0000-4000-8000-0000000000ff', 'dang_xu_ly', NULL, NULL, NULL, '[]'));

-- 4. Nghiệp vụ tại quầy (hồ sơ giấy, không có quy trình) giữ nguyên --------------------------------
SELECT pg_temp.vai('can_bo', 'test-tt-cb-a');
SELECT pg_temp.kiem('tại quầy: cán bộ phụ trách chuyển moi → dang_xu_ly → 1 dòng, tự giao cho mình', '7e573000-0000-4000-8000-0000000000c1',
  pg_temp.thu('UPDATE mot_cua.ho_so SET trang_thai = ''dang_xu_ly'' WHERE id = ' || :'H3' || ' RETURNING can_bo_xu_ly_id::text'));
UPDATE mot_cua.ho_so SET trang_thai = 'dang_xu_ly' WHERE id = :H3;
SELECT pg_temp.kiem('cán bộ không chuyển hồ sơ đang xử lý sang cho_phe_duyet qua /api', 'chặn 23514',
  pg_temp.thu('UPDATE mot_cua.ho_so SET trang_thai = ''cho_phe_duyet'' WHERE id = ' || :'H3'));
RESET ROLE;
SELECT pg_temp.kiem('tại quầy: lịch sử nguồn api, người = sub cán bộ', 'moi>dang_xu_ly api test-tt-cb-a', (
  SELECT tu_trang_thai || '>' || den_trang_thai || ' ' || nguon || ' ' || nguoi_sub
    FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = :H3 ORDER BY id DESC LIMIT 1));
UPDATE mot_cua.ho_so SET trang_thai = 'cho_bo_sung', ly_do = 'Quản trị thử' WHERE id = :H3;
SELECT pg_temp.kiem('SQL quản trị (superuser): lịch sử nguồn he_thong', 'he_thong', (
  SELECT nguon FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = :H3 ORDER BY id DESC LIMIT 1));

-- 5. Lịch sử: RLS, chỉ thêm ---------------------------------------------------------------
SELECT pg_temp.vai('cong_dan', 'test-tt-cd-x');
SELECT pg_temp.kiem('công dân X thấy lịch sử hồ sơ của mình (H1: 6 dòng)', '6',
  pg_temp.dem('SELECT 1 FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = ' || :'H1'));
SELECT pg_temp.kiem('công dân không thêm được lịch sử', 'chặn 42501',
  pg_temp.thu('INSERT INTO mot_cua.lich_su_trang_thai (ho_so_id, den_trang_thai, nguon) VALUES (' || :'H1' || ', ''hoan_tat'', ''api'')'));
SELECT pg_temp.vai('cong_dan', 'test-tt-cd-y');
SELECT pg_temp.kiem('công dân khác không thấy lịch sử', '0',
  pg_temp.dem('SELECT 1 FROM mot_cua.lich_su_trang_thai WHERE ho_so_id IN (' || :'H1' || ', ' || :'H2' || ', ' || :'H3' || ')'));
SELECT pg_temp.vai('can_bo', 'test-tt-cb-a');
SELECT pg_temp.kiem('cán bộ phụ trách lĩnh vực thấy lịch sử H1', '6',
  pg_temp.dem('SELECT 1 FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = ' || :'H1'));
SELECT pg_temp.vai('can_bo', 'test-tt-cb-b');
SELECT pg_temp.kiem('cán bộ lĩnh vực khác không thấy lịch sử', '0',
  pg_temp.dem('SELECT 1 FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = ' || :'H1'));
SELECT pg_temp.vai('lanh_dao', 'test-tt-ld');
SELECT pg_temp.kiem('lãnh đạo thấy lịch sử mọi hồ sơ', '6',
  pg_temp.dem('SELECT 1 FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = ' || :'H1'));
SELECT pg_temp.vai('anon');
SELECT pg_temp.kiem('anon không đọc được lịch sử', 'chặn 42501',
  pg_temp.dem('SELECT 1 FROM mot_cua.lich_su_trang_thai'));
RESET ROLE;
SELECT pg_temp.kiem('lịch sử chỉ thêm: superuser sửa → chặn', 'chặn 42501',
  pg_temp.thu('UPDATE mot_cua.lich_su_trang_thai SET den_trang_thai = ''moi'' WHERE ho_so_id = ' || :'H1'));

-- 6. Ánh xạ của gói ----------------------------------------------------------------------
SELECT pg_temp.vai('dich_vu_danh_muc', 'service-account-test');
SELECT mot_cua.nap_thu_tuc(jsonb_build_object(
  'goi', 'test-tt-goi', 'ma', 'TEST_TT_GOI', 'ten', 'Thủ tục gói test trạng thái', 'linh_vuc', 'test_tt_a',
  'so_ngay_xu_ly', 1, 'can_cu_phap_ly', 'Văn bản test', 'quy_trinh', 'quy_trinh_test_tt',
  'bien_theo_buoc', '{"buoc_a": {}}'::jsonb, 'trang_thai_buoc', '{"buoc_a": "moi", "buoc_b": "cho_phe_duyet"}'::jsonb,
  'json_schema', '{"type": "object"}'::jsonb, 'goi_sha256', repeat('b', 64), 'thanh_phan', '[]'::jsonb));
RESET ROLE;
SELECT pg_temp.kiem('nap_thu_tuc ghi trang_thai_buoc của gói', 'cho_phe_duyet', (
  SELECT trang_thai_buoc ->> 'buoc_b' FROM mot_cua.thu_tuc WHERE ma = 'TEST_TT_GOI'));
SELECT pg_temp.vai('dich_vu_su_kien', 'service-account-mot_cua_su_kien');
SELECT pg_temp.kiem('dịch vụ sự kiện (đối soát) đọc được ánh xạ theo quy trình', 'moi',
  (SELECT trang_thai_buoc ->> 'buoc_a' FROM mot_cua.thu_tuc WHERE quy_trinh = 'quy_trinh_test_tt'));
SELECT pg_temp.kiem('dịch vụ sự kiện không đọc cột dữ liệu cá nhân của hồ sơ', 'chặn 42501',
  pg_temp.dem('SELECT ho_ten_nguoi_nop FROM mot_cua.ho_so'));
RESET ROLE;
SELECT coalesce(array_agg(goi)::text, '{}') AS goi_khac FROM mot_cua.thu_tuc WHERE goi IS NOT NULL AND goi <> 'test-tt-goi' \gset
SELECT pg_temp.vai('dich_vu_danh_muc', 'service-account-test');
SELECT mot_cua.rut_goi_vang(:'goi_khac'::text[]);
RESET ROLE;
SELECT pg_temp.kiem('rut_goi_vang xóa ánh xạ cùng quy trình', 'NULL', (
  SELECT coalesce(trang_thai_buoc::text, 'NULL') FROM mot_cua.thu_tuc WHERE ma = 'TEST_TT_GOI'));

-- Kết quả -------------------------------------------------------------------------------
RESET ROLE;
SELECT CASE WHEN mong_doi IS NOT DISTINCT FROM thuc_te THEN 'ĐẠT' ELSE 'TRƯỢT' END,
       mo_ta, mong_doi, coalesce(thuc_te, 'NULL')
  FROM ket_qua ORDER BY stt;
SELECT count(*) FILTER (WHERE mong_doi IS DISTINCT FROM thuc_te) > 0 AS co_truot FROM ket_qua \gset
ROLLBACK;
\if :co_truot
  DO $$ BEGIN RAISE EXCEPTION 'Có kiểm tra trạng thái hồ sơ trượt'; END $$;
\endif

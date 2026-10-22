-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Test danh mục nạp từ gói thủ tục (D-009, migration 005): RPC nạp/rút gói chỉ cho tài khoản
-- dịch vụ dich_vu_danh_muc, upsert theo mã, hạn "trong ngày", ràng buộc gói/quy trình duy nhất.
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

-- Dữ liệu test --------------------------------------------------------------------------
-- Một gói giả "test-goi" (TEST_GOI, lĩnh vực mới test_goi_lv, hạn trong ngày) và các gói thật
-- đang nạp (nếu có, khi chạy trong make smoke) được giữ nguyên khi thử rút gói.
CREATE TEMP TABLE goi_mau AS SELECT jsonb_build_object(
  'goi', 'test-goi', 'ma', 'TEST_GOI', 'ten', 'Thủ tục gói test', 'linh_vuc', 'test_goi_lv',
  'ten_linh_vuc', 'Lĩnh vực gói test', 'so_ngay_xu_ly', 0, 'le_phi', 1000, 'ghi_chu_le_phi', 'mẫu',
  'can_cu_phap_ly', 'Văn bản test', 'cong_khai', true, 'quy_trinh', 'quy_trinh_test_goi',
  'bien_theo_buoc', '{"buoc_a": {"ok": {"kieu": "boolean", "bat_buoc": true}}}'::jsonb,
  'json_schema', '{"title": "Schema gói test", "type": "object"}'::jsonb,
  'goi_sha256', repeat('a', 64),
  'thanh_phan', '[{"ma": "giay_a", "ten": "Giấy A", "bat_buoc": true, "so_luong": 1},
                  {"ma": "giay_b", "ten": "Giấy B", "bat_buoc": true, "so_luong": 2, "ghi_chu": "hai bản"}]'::jsonb
) AS g;
GRANT SELECT ON goi_mau TO PUBLIC;
CREATE TEMP TABLE goi_dang_nap AS SELECT goi FROM mot_cua.thu_tuc WHERE goi IS NOT NULL;
GRANT SELECT ON goi_dang_nap TO PUBLIC;

-- Ai được gọi RPC nạp/rút gói --------------------------------------------------------------
SELECT pg_temp.vai('anon');
SELECT pg_temp.kiem('anon: gọi nap_thu_tuc bị chặn', 'chặn 42501', pg_temp.thu(
  $$SELECT mot_cua.nap_thu_tuc(g) FROM pg_temp.goi_mau$$));
SELECT pg_temp.vai('cong_dan', '7e570000-0000-4000-8000-0000000000c9');
SELECT pg_temp.kiem('cong_dan: gọi nap_thu_tuc bị chặn', 'chặn 42501', pg_temp.thu(
  $$SELECT mot_cua.nap_thu_tuc(g) FROM pg_temp.goi_mau$$));
SELECT pg_temp.vai('can_bo', '7e570000-0000-4000-8000-0000000000b9');
SELECT pg_temp.kiem('can_bo: gọi rut_goi_vang bị chặn', 'chặn 42501', pg_temp.thu(
  $$SELECT mot_cua.rut_goi_vang(ARRAY[]::text[])$$));
SELECT pg_temp.vai('lanh_dao', '7e570000-0000-4000-8000-0000000000d9');
SELECT pg_temp.kiem('lanh_dao: gọi nap_thu_tuc bị chặn', 'chặn 42501', pg_temp.thu(
  $$SELECT mot_cua.nap_thu_tuc(g) FROM pg_temp.goi_mau$$));
SELECT pg_temp.vai('dich_vu_tep', 'service-account-test');
SELECT pg_temp.kiem('dich_vu_tep: gọi nap_thu_tuc bị chặn', 'chặn 42501', pg_temp.thu(
  $$SELECT mot_cua.nap_thu_tuc(g) FROM pg_temp.goi_mau$$));

-- dich_vu_danh_muc: chỉ hai RPC, không đọc/ghi bảng trực tiếp ----------------------------------
SELECT pg_temp.vai('dich_vu_danh_muc', 'service-account-test');
SELECT pg_temp.kiem('dich_vu_danh_muc: đọc hồ sơ bị chặn', 'chặn 42501', pg_temp.dem('SELECT 1 FROM mot_cua.ho_so'));
SELECT pg_temp.kiem('dich_vu_danh_muc: ghi thẳng bảng thu_tuc bị chặn', 'chặn 42501', pg_temp.thu(
  $$UPDATE mot_cua.thu_tuc SET le_phi = 0$$));
SELECT pg_temp.kiem('dich_vu_danh_muc: nạp gói mới → thêm thủ tục', 'true', (
  SELECT mot_cua.nap_thu_tuc(g) ->> 'moi' FROM pg_temp.goi_mau));

RESET ROLE;
SELECT pg_temp.kiem('nạp gói: thủ tục có quy trình, gói, hạn 0 ngày (trong ngày)', 'quy_trinh_test_goi test-goi 0', (
  SELECT quy_trinh || ' ' || goi || ' ' || so_ngay_xu_ly FROM mot_cua.thu_tuc WHERE ma = 'TEST_GOI'));
SELECT pg_temp.kiem('nạp gói: tự tạo lĩnh vực chưa có', 'Lĩnh vực gói test', (
  SELECT ten FROM mot_cua.linh_vuc WHERE ma = 'test_goi_lv'));
SELECT pg_temp.kiem('nạp gói: thành phần theo thứ tự, số lượng', 'giay_a:1:t,giay_b:2:t', (
  SELECT string_agg(y.ma || ':' || y.so_luong || ':' || left(y.bat_buoc::text, 1), ',' ORDER BY y.thu_tu)
    FROM mot_cua.thanh_phan_yeu_cau y JOIN mot_cua.thu_tuc t ON t.id = y.thu_tuc_id WHERE t.ma = 'TEST_GOI'));
SELECT pg_temp.kiem('json_schema_thu_tuc trả schema của gói', 'Schema gói test', (
  SELECT mot_cua.json_schema_thu_tuc('TEST_GOI') ->> 'title'));

-- Hạn trong ngày: nộp thứ Tư 21/10/2026 lúc 10 giờ → hạn chính ngày đó; nộp thứ Bảy → thứ Hai.
INSERT INTO mot_cua.ho_so (ma_ho_so, thu_tuc_id, nguoi_nop_sub, ho_ten_nguoi_nop, ngay_nhan)
SELECT v.ma, t.id, '7e570000-0000-4000-8000-0000000000c9', 'Người nộp test', v.luc
  FROM mot_cua.thu_tuc t,
       (VALUES ('TESTGOI-1', timestamptz '2026-10-21 10:00+07'), ('TESTGOI-2', timestamptz '2026-10-24 10:00+07')) v (ma, luc)
 WHERE t.ma = 'TEST_GOI';
SELECT pg_temp.kiem('hạn trong ngày: nộp ngày làm việc → hạn là ngày nộp', '2026-10-21', (
  SELECT han_xu_ly::text FROM mot_cua.ho_so WHERE ma_ho_so = 'TESTGOI-1'));
SELECT pg_temp.kiem('hạn trong ngày: nộp thứ Bảy → hạn thứ Hai kế tiếp', '2026-10-26', (
  SELECT han_xu_ly::text FROM mot_cua.ho_so WHERE ma_ho_so = 'TESTGOI-2'));

-- Nạp lại: cập nhật, thành phần bỏ khỏi gói thôi bắt buộc (không xóa) --------------------------
SELECT pg_temp.vai('dich_vu_danh_muc', 'service-account-test');
SELECT pg_temp.kiem('nạp lại cùng mã → cập nhật, không thêm', 'false', (
  SELECT mot_cua.nap_thu_tuc(jsonb_set(jsonb_set(g, '{le_phi}', '5000'), '{thanh_phan}',
           '[{"ma": "giay_a", "ten": "Giấy A (mới)", "bat_buoc": true, "so_luong": 1}]')) ->> 'moi'
    FROM pg_temp.goi_mau));
RESET ROLE;
SELECT pg_temp.kiem('nạp lại: lệ phí, tên thành phần mới; giay_b còn nhưng thôi bắt buộc', '5000 Giấy A (mới) giay_b:f', (
  SELECT t.le_phi || ' ' || (SELECT ten FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = t.id AND ma = 'giay_a')
         || ' giay_b:' || (SELECT left(bat_buoc::text, 1) FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = t.id AND ma = 'giay_b')
    FROM mot_cua.thu_tuc t WHERE t.ma = 'TEST_GOI'));

-- Ràng buộc: gói khác dùng cùng process id hoặc gói đổi mã → bị từ chối ---------------------------
SELECT pg_temp.vai('dich_vu_danh_muc', 'service-account-test');
SELECT pg_temp.kiem('gói khác trùng process id → chặn 23505', 'chặn 23505', pg_temp.thu(
  $$SELECT mot_cua.nap_thu_tuc(g || '{"goi": "goi-khac", "ma": "TEST_KHAC"}') FROM pg_temp.goi_mau$$));
SELECT pg_temp.kiem('cùng gói đổi sang mã khác → chặn 23505', 'chặn 23505', pg_temp.thu(
  $$SELECT mot_cua.nap_thu_tuc(g || '{"ma": "TEST_KHAC", "quy_trinh": "quy_trinh_khac"}') FROM pg_temp.goi_mau$$));
SELECT pg_temp.kiem('thời hạn âm → chặn 23514', 'chặn 23514', pg_temp.thu(
  $$SELECT mot_cua.nap_thu_tuc(g || '{"so_ngay_xu_ly": -1}') FROM pg_temp.goi_mau$$));

-- Công khai: người ngoài thấy thủ tục có gói và quy trình của nó --------------------------------
SELECT pg_temp.vai('anon');
SELECT pg_temp.kiem('anon: thấy thủ tục của gói kèm quy_trinh', 'quy_trinh_test_goi', (
  SELECT quy_trinh FROM mot_cua.thu_tuc WHERE ma = 'TEST_GOI'));

-- Rút gói: xóa thư mục → thủ tục thôi có quy trình; gói còn thư mục giữ nguyên --------------------
SELECT pg_temp.vai('dich_vu_danh_muc', 'service-account-test');
SELECT pg_temp.kiem('rut_goi_vang: chỉ rút gói không còn trong danh sách', '["TEST_GOI"]', (
  SELECT mot_cua.rut_goi_vang(ARRAY(SELECT goi FROM pg_temp.goi_dang_nap))::text));
RESET ROLE;
SELECT pg_temp.kiem('sau khi rút: không còn quy trình, gói; hồ sơ cũ vẫn còn', 'NULL NULL 2', (
  SELECT coalesce(quy_trinh, 'NULL') || ' ' || coalesce(goi, 'NULL') || ' '
         || (SELECT count(*) FROM mot_cua.ho_so h WHERE h.thu_tuc_id = t.id)
    FROM mot_cua.thu_tuc t WHERE ma = 'TEST_GOI'));
SELECT pg_temp.kiem('sau khi rút: gói thật đang nạp vẫn còn', (SELECT count(*)::text FROM goi_dang_nap), (
  SELECT count(*)::text FROM mot_cua.thu_tuc WHERE goi IN (SELECT goi FROM goi_dang_nap)));

-- Kết quả -------------------------------------------------------------------------------
RESET ROLE;
SELECT CASE WHEN mong_doi IS NOT DISTINCT FROM thuc_te THEN 'ĐẠT' ELSE 'TRƯỢT' END,
       mo_ta, mong_doi, coalesce(thuc_te, 'NULL')
  FROM ket_qua ORDER BY stt;
SELECT count(*) FILTER (WHERE mong_doi IS DISTINCT FROM thuc_te) > 0 AS co_truot FROM ket_qua \gset
ROLLBACK;
\if :co_truot
  DO $$ BEGIN RAISE EXCEPTION 'Có kiểm tra gói thủ tục trượt'; END $$;
\endif

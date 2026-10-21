-- SPDX-License-Identifier: Apache-2.0
-- Test quyền và RLS của schema mot_cua (#5): mỗi vai trò thấy/sửa đúng phần được phép.
-- Chạy bằng superuser trong container postgres, toàn bộ trong MỘT transaction rồi
-- ROLLBACK, nên không để lại dữ liệu và không phụ thuộc seed (DXOS_SEED có thể là false):
--   docker compose exec -T postgres psql -XqtA -U postgres -d commune < apps/mot-cua/db/tests/rls.sql
-- Mỗi dòng in ra: KẾT_QUẢ|mô tả|mong đợi|thực tế. Có dòng TRƯỢT → psql thoát mã khác 0.
-- `make smoke` (apps/mot-cua/tests/smoke.sh) chạy tệp này và tính từng dòng là một kiểm tra.
--
-- Đổi vai trò giống hệt PostgREST cho mỗi request: SET ROLE <role> + request.jwt.claims.
-- Mỗi thao tác ghi chạy trong subtransaction và luôn bị hoàn tác, nên các kiểm tra độc lập.
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

-- Dữ liệu test (superuser, bỏ qua RLS) --------------------------------------------------
-- Lĩnh vực A, B; thủ tục TEST_A, TEST_B công khai, TEST_AN nội bộ (thuộc A).
-- Cán bộ CB_A phụ trách A, CB_B phụ trách B. Công dân X, Y.
INSERT INTO mot_cua.linh_vuc (id, ma, ten) VALUES
  ('7e570000-0000-4000-8000-0000000000a1', 'test_a', 'Lĩnh vực test A'),
  ('7e570000-0000-4000-8000-0000000000b1', 'test_b', 'Lĩnh vực test B');
INSERT INTO mot_cua.thu_tuc (id, ma, ten, linh_vuc_id, so_ngay_xu_ly, cong_khai) VALUES
  ('7e570000-0000-4000-8000-0000000000a2', 'TEST_A',  'Thủ tục test A',       '7e570000-0000-4000-8000-0000000000a1', 2, true),
  ('7e570000-0000-4000-8000-0000000000b2', 'TEST_B',  'Thủ tục test B',       '7e570000-0000-4000-8000-0000000000b1', 2, true),
  ('7e570000-0000-4000-8000-0000000000a3', 'TEST_AN', 'Thủ tục test nội bộ',  '7e570000-0000-4000-8000-0000000000a1', 2, false);
INSERT INTO mot_cua.thanh_phan_yeu_cau (id, thu_tuc_id, ma, ten, bat_buoc) VALUES
  ('7e570000-0000-4000-8000-0000000000a4', '7e570000-0000-4000-8000-0000000000a2', 'to_khai', 'Tờ khai', true),
  ('7e570000-0000-4000-8000-0000000000a5', '7e570000-0000-4000-8000-0000000000a2', 'phu_luc', 'Phụ lục', false),
  ('7e570000-0000-4000-8000-0000000000b4', '7e570000-0000-4000-8000-0000000000b2', 'don', 'Đơn', true),
  ('7e570000-0000-4000-8000-0000000000a6', '7e570000-0000-4000-8000-0000000000a3', 'noi_bo', 'Giấy nội bộ', true);
INSERT INTO mot_cua.can_bo (id, sub, ho_ten, chuc_vu) VALUES
  ('7e570000-0000-4000-8000-0000000000c1', 'test-cb-a', 'Cán bộ test A', 'Thử'),
  ('7e570000-0000-4000-8000-0000000000c2', 'test-cb-b', 'Cán bộ test B', 'Thử');
INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES
  ('7e570000-0000-4000-8000-0000000000c1', '7e570000-0000-4000-8000-0000000000a1'),
  ('7e570000-0000-4000-8000-0000000000c2', '7e570000-0000-4000-8000-0000000000b1');
-- X1: X, thủ tục A, mới · X2: X, thủ tục B, chờ bổ sung · Y1: Y, A, đang xử lý · Y2: Y, A, hoàn tất
INSERT INTO mot_cua.ho_so (id, ma_ho_so, thu_tuc_id, nguoi_nop_sub, ho_ten_nguoi_nop, trang_thai, ly_do, can_bo_xu_ly_id) VALUES
  ('7e570000-0000-4000-8000-000000000001', 'TEST-X1', '7e570000-0000-4000-8000-0000000000a2', 'test-cd-x', 'Công dân X', 'moi', NULL, NULL),
  ('7e570000-0000-4000-8000-000000000002', 'TEST-X2', '7e570000-0000-4000-8000-0000000000b2', 'test-cd-x', 'Công dân X', 'cho_bo_sung', 'Thiếu đơn', '7e570000-0000-4000-8000-0000000000c2'),
  ('7e570000-0000-4000-8000-000000000003', 'TEST-Y1', '7e570000-0000-4000-8000-0000000000a2', 'test-cd-y', 'Công dân Y', 'dang_xu_ly', NULL, '7e570000-0000-4000-8000-0000000000c1'),
  ('7e570000-0000-4000-8000-000000000004', 'TEST-Y2', '7e570000-0000-4000-8000-0000000000a2', 'test-cd-y', 'Công dân Y', 'hoan_tat', NULL, '7e570000-0000-4000-8000-0000000000c1');
INSERT INTO mot_cua.thanh_phan_ho_so (id, ho_so_id, thanh_phan_yeu_cau_id, ten_tep, loai_mime, kich_thuoc) VALUES
  ('7e570000-0000-4000-8000-000000000011', '7e570000-0000-4000-8000-000000000001', '7e570000-0000-4000-8000-0000000000a4', 'x1.pdf', 'application/pdf', 1000),
  ('7e570000-0000-4000-8000-000000000012', '7e570000-0000-4000-8000-000000000002', '7e570000-0000-4000-8000-0000000000b4', 'x2.pdf', 'application/pdf', 1000);
INSERT INTO mot_cua.ngay_nghi (ngay, ten) VALUES ('2030-01-02', 'Ngày nghỉ test');

GRANT EXECUTE ON FUNCTION pg_temp.vai(text, text), pg_temp.kiem(text, text, text),
                          pg_temp.dem(text), pg_temp.thu(text) TO PUBLIC;

-- Câu SQL dùng lại
\set HS_TEST 'SELECT 1 FROM mot_cua.ho_so WHERE ma_ho_so LIKE ''TEST-%'''
\set X1 '''7e570000-0000-4000-8000-000000000001'''
\set X2 '''7e570000-0000-4000-8000-000000000002'''
\set Y1 '''7e570000-0000-4000-8000-000000000003'''
\set Y2 '''7e570000-0000-4000-8000-000000000004'''

-- Toàn schema --------------------------------------------------------------------------
SELECT pg_temp.kiem('mọi bảng mot_cua bật và ép RLS (ENABLE + FORCE)', '0',
  (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'mot_cua' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)));
SELECT pg_temp.kiem('hạn: thứ Sáu 23/10/2026 + 1 ngày làm việc = thứ Hai 26/10', '2026-10-26',
  mot_cua_noi_bo.cong_ngay_lam_viec('2026-10-23', 1)::text);
SELECT pg_temp.kiem('hạn: nộp thứ Bảy 24/10/2026 + 1 ngày làm việc = thứ Ba 27/10', '2026-10-27',
  mot_cua_noi_bo.cong_ngay_lam_viec('2026-10-24', 1)::text);
SELECT pg_temp.kiem('hạn: bỏ qua ngày nghỉ lễ (01/01/2030 + 1 = 03/01/2030)', '2030-01-03',
  mot_cua_noi_bo.cong_ngay_lam_viec('2030-01-01', 1)::text);

-- anon -----------------------------------------------------------------------------------
SELECT pg_temp.vai('anon');
SELECT pg_temp.kiem('anon: thấy 2 thủ tục test công khai, không thấy thủ tục nội bộ', '2',
  pg_temp.dem($$SELECT 1 FROM mot_cua.thu_tuc WHERE ma LIKE 'TEST%'$$));
SELECT pg_temp.kiem('anon: thấy thành phần yêu cầu của thủ tục công khai (3), không của nội bộ', '3',
  pg_temp.dem($$SELECT 1 FROM mot_cua.thanh_phan_yeu_cau y JOIN mot_cua.thu_tuc t ON t.id = y.thu_tuc_id WHERE t.ma LIKE 'TEST%'$$));
SELECT pg_temp.kiem('anon: đọc lĩnh vực', '2', pg_temp.dem($$SELECT 1 FROM mot_cua.linh_vuc WHERE ma LIKE 'test_%'$$));
SELECT pg_temp.kiem('anon: JSON Schema thủ tục công khai có required = [to_khai]', '["to_khai"]',
  (mot_cua.json_schema_thu_tuc('TEST_A') #> '{properties,thanh_phan,required}')::text);
SELECT pg_temp.kiem('anon: JSON Schema thủ tục nội bộ → NULL', 'NULL',
  coalesce(mot_cua.json_schema_thu_tuc('TEST_AN')::text, 'NULL'));
SELECT pg_temp.kiem('anon: đọc ho_so bị chặn', 'chặn 42501', pg_temp.dem(:'HS_TEST'));
SELECT pg_temp.kiem('anon: đọc thanh_phan_ho_so bị chặn', 'chặn 42501', pg_temp.dem('SELECT 1 FROM mot_cua.thanh_phan_ho_so'));
SELECT pg_temp.kiem('anon: đọc can_bo bị chặn', 'chặn 42501', pg_temp.dem('SELECT 1 FROM mot_cua.can_bo'));
SELECT pg_temp.kiem('anon: nộp hồ sơ bị chặn', 'chặn 42501', pg_temp.thu(
  $$INSERT INTO mot_cua.ho_so (thu_tuc_id, ho_ten_nguoi_nop) VALUES ('7e570000-0000-4000-8000-0000000000a2', 'A')$$));
SELECT pg_temp.kiem('anon: sửa thủ tục bị chặn', 'chặn 42501', pg_temp.thu($$UPDATE mot_cua.thu_tuc SET ten = 'x'$$));

-- cong_dan X ----------------------------------------------------------------------------
SELECT pg_temp.vai('cong_dan', 'test-cd-x');
SELECT pg_temp.kiem('cong_dan X: chỉ thấy 2 hồ sơ của mình', '2', pg_temp.dem(:'HS_TEST'));
SELECT pg_temp.kiem('cong_dan X: không thấy hồ sơ của Y', '0',
  pg_temp.dem($$SELECT 1 FROM mot_cua.ho_so WHERE nguoi_nop_sub = 'test-cd-y'$$));
SELECT pg_temp.kiem('cong_dan X: không thấy thủ tục nội bộ', '0',
  pg_temp.dem($$SELECT 1 FROM mot_cua.thu_tuc WHERE ma = 'TEST_AN'$$));
SELECT pg_temp.kiem('cong_dan X: nộp hồ sơ → trạng thái moi, người nộp = sub, có mã và hạn', 'moi test-cd-x t t',
  pg_temp.thu($$INSERT INTO mot_cua.ho_so (thu_tuc_id, ho_ten_nguoi_nop, so_dien_thoai)
               VALUES ('7e570000-0000-4000-8000-0000000000a2', 'Công dân X', '0900000009')
               RETURNING concat_ws(' ', trang_thai, nguoi_nop_sub, ma_ho_so LIKE 'HS%', han_xu_ly > ngay_nhan::date)$$));
SELECT pg_temp.kiem('cong_dan X: nộp hồ sơ thủ tục nội bộ bị RLS chặn', 'chặn 42501', pg_temp.thu(
  $$INSERT INTO mot_cua.ho_so (thu_tuc_id, ho_ten_nguoi_nop) VALUES ('7e570000-0000-4000-8000-0000000000a3', 'X')$$));
SELECT pg_temp.kiem('cong_dan X: tự đặt trạng thái khi nộp bị chặn (quyền cột)', 'chặn 42501', pg_temp.thu(
  $$INSERT INTO mot_cua.ho_so (thu_tuc_id, ho_ten_nguoi_nop, trang_thai) VALUES ('7e570000-0000-4000-8000-0000000000a2', 'X', 'hoan_tat')$$));
SELECT pg_temp.kiem('cong_dan X: nộp thay người khác (đặt nguoi_nop_sub) bị chặn', 'chặn 42501', pg_temp.thu(
  $$INSERT INTO mot_cua.ho_so (thu_tuc_id, ho_ten_nguoi_nop, nguoi_nop_sub) VALUES ('7e570000-0000-4000-8000-0000000000a2', 'X', 'test-cd-y')$$));
SELECT pg_temp.kiem('cong_dan X: sửa hồ sơ trạng thái moi → 0 dòng', '0 dòng',
  pg_temp.thu('UPDATE mot_cua.ho_so SET so_dien_thoai = ''0911111111'' WHERE id = ' || :'X1'));
SELECT pg_temp.kiem('cong_dan X: sửa hồ sơ chờ bổ sung → 1 dòng', '1 dòng',
  pg_temp.thu('UPDATE mot_cua.ho_so SET so_dien_thoai = ''0911111111'' WHERE id = ' || :'X2'));
SELECT pg_temp.kiem('cong_dan X: báo đã bổ sung (cho_bo_sung → dang_xu_ly) → 1 dòng', '1 dòng',
  pg_temp.thu('UPDATE mot_cua.ho_so SET trang_thai = ''dang_xu_ly'' WHERE id = ' || :'X2'));
-- cho_bo_sung → tu_choi là bước hợp lệ (trigger cho qua) nhưng chỉ cán bộ được làm: RLS chặn.
SELECT pg_temp.kiem('cong_dan X: tự đóng hồ sơ (cho_bo_sung → tu_choi) bị RLS chặn', 'chặn 42501',
  pg_temp.thu('UPDATE mot_cua.ho_so SET trang_thai = ''tu_choi'' WHERE id = ' || :'X2'));
SELECT pg_temp.kiem('cong_dan X: chuyển trạng thái sai (cho_bo_sung → hoan_tat) bị chặn', 'chặn 23514',
  pg_temp.thu('UPDATE mot_cua.ho_so SET trang_thai = ''hoan_tat'' WHERE id = ' || :'X2'));
SELECT pg_temp.kiem('cong_dan X: sửa cán bộ xử lý bị chặn (quyền cột)', 'chặn 42501',
  pg_temp.thu('UPDATE mot_cua.ho_so SET can_bo_xu_ly_id = NULL WHERE id = ' || :'X2'));
SELECT pg_temp.kiem('cong_dan X: sửa hồ sơ của Y → 0 dòng', '0 dòng',
  pg_temp.thu('UPDATE mot_cua.ho_so SET so_dien_thoai = ''0911111111'' WHERE id = ' || :'Y1'));
SELECT pg_temp.kiem('cong_dan X: xóa hồ sơ bị chặn', 'chặn 42501',
  pg_temp.thu('DELETE FROM mot_cua.ho_so WHERE id = ' || :'X1'));
SELECT pg_temp.kiem('cong_dan X: thấy giấy tờ của mình (2), không của người khác', '2',
  pg_temp.dem('SELECT 1 FROM mot_cua.thanh_phan_ho_so'));
SELECT pg_temp.kiem('cong_dan X: đính kèm giấy tờ vào hồ sơ mới của mình → 1 dòng', '1 dòng', pg_temp.thu(
  'INSERT INTO mot_cua.thanh_phan_ho_so (ho_so_id, thanh_phan_yeu_cau_id, ten_tep, loai_mime, kich_thuoc) VALUES ('
  || :'X1' || ', ''7e570000-0000-4000-8000-0000000000a5'', ''phu-luc.pdf'', ''application/pdf'', 2000)'));
SELECT pg_temp.kiem('cong_dan X: đính kèm vào hồ sơ của Y bị chặn', 'chặn 42501', pg_temp.thu(
  'INSERT INTO mot_cua.thanh_phan_ho_so (ho_so_id, ten_tep, loai_mime, kich_thuoc) VALUES ('
  || :'Y1' || ', ''a.pdf'', ''application/pdf'', 2000)'));
SELECT pg_temp.kiem('cong_dan X: thành phần không thuộc thủ tục của hồ sơ bị chặn', 'chặn 23514', pg_temp.thu(
  'INSERT INTO mot_cua.thanh_phan_ho_so (ho_so_id, thanh_phan_yeu_cau_id, ten_tep, loai_mime, kich_thuoc) VALUES ('
  || :'X1' || ', ''7e570000-0000-4000-8000-0000000000b4'', ''don.pdf'', ''application/pdf'', 2000)'));
SELECT pg_temp.kiem('cong_dan X: tự đánh dấu giấy tờ hợp lệ bị chặn', 'chặn 42501', pg_temp.thu(
  'UPDATE mot_cua.thanh_phan_ho_so SET trang_thai_kiem_tra = ''hop_le'''));
SELECT pg_temp.kiem('cong_dan X: đọc danh sách cán bộ bị chặn', 'chặn 42501', pg_temp.dem('SELECT 1 FROM mot_cua.can_bo'));

-- cong_dan Y ----------------------------------------------------------------------------
SELECT pg_temp.vai('cong_dan', 'test-cd-y');
SELECT pg_temp.kiem('cong_dan Y: chỉ thấy 2 hồ sơ của mình', '2', pg_temp.dem(:'HS_TEST'));
SELECT pg_temp.kiem('cong_dan Y: không thấy giấy tờ của X', '0',
  pg_temp.dem($$SELECT 1 FROM mot_cua.thanh_phan_ho_so WHERE ten_tep LIKE 'x%.pdf'$$));

-- can_bo A (lĩnh vực A) -------------------------------------------------------------------
SELECT pg_temp.vai('can_bo', 'test-cb-a');
SELECT pg_temp.kiem('can_bo A: chỉ thấy 3 hồ sơ thuộc lĩnh vực A', '3', pg_temp.dem(:'HS_TEST'));
SELECT pg_temp.kiem('can_bo A: không thấy hồ sơ lĩnh vực B', '0',
  pg_temp.dem('SELECT 1 FROM mot_cua.ho_so WHERE id = ' || :'X2'));
SELECT pg_temp.kiem('can_bo A: thấy cả thủ tục nội bộ', '3', pg_temp.dem($$SELECT 1 FROM mot_cua.thu_tuc WHERE ma LIKE 'TEST%'$$));
SELECT pg_temp.kiem('can_bo A: nhận xử lý hồ sơ mới → tự giao cho mình', 'true', pg_temp.thu(
  'UPDATE mot_cua.ho_so SET trang_thai = ''dang_xu_ly'' WHERE id = ' || :'X1'
  || ' RETURNING (can_bo_xu_ly_id = ''7e570000-0000-4000-8000-0000000000c1'')::text'));
SELECT pg_temp.kiem('can_bo A: yêu cầu bổ sung có lý do → 1 dòng', '1 dòng', pg_temp.thu(
  'UPDATE mot_cua.ho_so SET trang_thai = ''cho_bo_sung'', ly_do = ''Thiếu tờ khai'' WHERE id = ' || :'Y1'));
SELECT pg_temp.kiem('can_bo A: hoàn tất → ghi ngày hoàn tất', 'true', pg_temp.thu(
  'UPDATE mot_cua.ho_so SET trang_thai = ''hoan_tat'' WHERE id = ' || :'Y1' || ' RETURNING (ngay_hoan_tat IS NOT NULL)::text'));
SELECT pg_temp.kiem('can_bo A: sửa hồ sơ lĩnh vực B → 0 dòng', '0 dòng', pg_temp.thu(
  'UPDATE mot_cua.ho_so SET trang_thai = ''dang_xu_ly'' WHERE id = ' || :'X2'));
SELECT pg_temp.kiem('can_bo A: sửa hồ sơ đã hoàn tất → 0 dòng', '0 dòng', pg_temp.thu(
  'UPDATE mot_cua.ho_so SET trang_thai = ''tu_choi'', ly_do = ''x'' WHERE id = ' || :'Y2'));
SELECT pg_temp.kiem('can_bo A: chuyển trạng thái sai (dang_xu_ly → moi) bị chặn', 'chặn 23514', pg_temp.thu(
  'UPDATE mot_cua.ho_so SET trang_thai = ''moi'' WHERE id = ' || :'Y1'));
SELECT pg_temp.kiem('can_bo A: từ chối không ghi lý do bị chặn', 'chặn 23514', pg_temp.thu(
  'UPDATE mot_cua.ho_so SET trang_thai = ''tu_choi'' WHERE id = ' || :'Y1'));
SELECT pg_temp.kiem('can_bo A: giao hồ sơ cho cán bộ khác lĩnh vực bị chặn', 'chặn 23514', pg_temp.thu(
  'UPDATE mot_cua.ho_so SET can_bo_xu_ly_id = ''7e570000-0000-4000-8000-0000000000c2'' WHERE id = ' || :'Y1'));
SELECT pg_temp.kiem('can_bo A: sửa người nộp bị chặn (quyền cột)', 'chặn 42501', pg_temp.thu(
  'UPDATE mot_cua.ho_so SET nguoi_nop_sub = ''khac'' WHERE id = ' || :'Y1'));
SELECT pg_temp.kiem('can_bo A: nộp hồ sơ bị chặn', 'chặn 42501', pg_temp.thu(
  $$INSERT INTO mot_cua.ho_so (thu_tuc_id, ho_ten_nguoi_nop) VALUES ('7e570000-0000-4000-8000-0000000000a2', 'A')$$));
SELECT pg_temp.kiem('can_bo A: sửa danh mục thủ tục bị chặn', 'chặn 42501', pg_temp.thu($$UPDATE mot_cua.thu_tuc SET le_phi = 1$$));
SELECT pg_temp.kiem('can_bo A: kiểm tra giấy tờ hồ sơ lĩnh vực A → ghi người kiểm tra', 'true', pg_temp.thu(
  $$UPDATE mot_cua.thanh_phan_ho_so SET trang_thai_kiem_tra = 'hop_le' WHERE id = '7e570000-0000-4000-8000-000000000011'
    RETURNING (nguoi_kiem_tra_id = '7e570000-0000-4000-8000-0000000000c1' AND kiem_tra_luc IS NOT NULL)::text$$));
SELECT pg_temp.kiem('can_bo A: không thấy giấy tờ hồ sơ lĩnh vực B', '0',
  pg_temp.dem($$SELECT 1 FROM mot_cua.thanh_phan_ho_so WHERE id = '7e570000-0000-4000-8000-000000000012'$$));
SELECT pg_temp.kiem('can_bo A: kiểm tra giấy tờ hồ sơ lĩnh vực B → 0 dòng', '0 dòng', pg_temp.thu(
  $$UPDATE mot_cua.thanh_phan_ho_so SET trang_thai_kiem_tra = 'hop_le' WHERE id = '7e570000-0000-4000-8000-000000000012'$$));

-- can_bo B, cán bộ chưa có trong danh sách ------------------------------------------------
SELECT pg_temp.vai('can_bo', 'test-cb-b');
SELECT pg_temp.kiem('can_bo B: chỉ thấy 1 hồ sơ thuộc lĩnh vực B', '1', pg_temp.dem(:'HS_TEST'));
SELECT pg_temp.vai('can_bo', 'test-cb-khong-co');
SELECT pg_temp.kiem('can_bo không có trong mot_cua.can_bo: không thấy hồ sơ nào', '0', pg_temp.dem('SELECT 1 FROM mot_cua.ho_so'));

-- lanh_dao -------------------------------------------------------------------------------
SELECT pg_temp.vai('lanh_dao', 'test-ld');
SELECT pg_temp.kiem('lanh_dao: thấy cả 4 hồ sơ test', '4', pg_temp.dem(:'HS_TEST'));
SELECT pg_temp.kiem('lanh_dao: thấy giấy tờ của mọi hồ sơ test', '2',
  pg_temp.dem($$SELECT 1 FROM mot_cua.thanh_phan_ho_so WHERE ten_tep LIKE 'x%.pdf'$$));
SELECT pg_temp.kiem('lanh_dao: thấy danh sách cán bộ', '2', pg_temp.dem($$SELECT 1 FROM mot_cua.can_bo WHERE sub LIKE 'test-%'$$));
SELECT pg_temp.kiem('lanh_dao: sửa hồ sơ bị chặn', 'chặn 42501', pg_temp.thu(
  'UPDATE mot_cua.ho_so SET trang_thai = ''dang_xu_ly'' WHERE id = ' || :'X1'));
SELECT pg_temp.kiem('lanh_dao: nộp hồ sơ bị chặn', 'chặn 42501', pg_temp.thu(
  $$INSERT INTO mot_cua.ho_so (thu_tuc_id, ho_ten_nguoi_nop) VALUES ('7e570000-0000-4000-8000-0000000000a2', 'L')$$));
SELECT pg_temp.kiem('lanh_dao: sửa giấy tờ bị chặn', 'chặn 42501', pg_temp.thu(
  $$UPDATE mot_cua.thanh_phan_ho_so SET trang_thai_kiem_tra = 'hop_le'$$));
SELECT pg_temp.kiem('lanh_dao: sửa phân công lĩnh vực bị chặn', 'chặn 42501', pg_temp.thu(
  'DELETE FROM mot_cua.can_bo_linh_vuc'));

-- Kết quả -------------------------------------------------------------------------------
RESET ROLE;
SELECT CASE WHEN mong_doi IS NOT DISTINCT FROM thuc_te THEN 'ĐẠT' ELSE 'TRƯỢT' END,
       mo_ta, mong_doi, coalesce(thuc_te, 'NULL')
  FROM ket_qua ORDER BY stt;
SELECT count(*) FILTER (WHERE mong_doi IS DISTINCT FROM thuc_te) > 0 AS co_truot FROM ket_qua \gset
ROLLBACK;
\if :co_truot
  DO $$ BEGIN RAISE EXCEPTION 'Có kiểm tra RLS trượt'; END $$;
\endif

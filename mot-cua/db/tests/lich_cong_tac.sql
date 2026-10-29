-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Test lịch công tác (#117, migration 017): ai ghi được (văn thư soạn dự kiến, lãnh đạo duyệt), cán bộ chỉ thấy lịch
-- đã duyệt, hủy phải có lý do và không sửa được nữa, không xóa, Poka-yoke trùng địa điểm + chồng giờ, nhật ký
-- kiểm toán lich.* không chứa tiêu đề hay ghi chú.
-- Cùng khung với wiki_van_ban.sql: một transaction rồi ROLLBACK, mỗi dòng in ra KẾT_QUẢ|mô tả|mong đợi|thực tế.
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

-- Lịch thử đặt năm 2030 để không đụng lịch mẫu. Mọi tiêu đề có dấu ZQLICH để kiểm nhật ký không lộ tiêu đề.
CREATE TEMP TABLE ids (ten text PRIMARY KEY, id uuid);
GRANT SELECT, INSERT ON ids TO PUBLIC;
-- them(tiêu đề, giờ bắt đầu, giờ kết thúc, địa điểm, trạng thái) → câu INSERT như cổng cán bộ gửi qua PostgREST.
CREATE FUNCTION pg_temp.them(td text, bd text, kt text, dd text, tt text DEFAULT 'du_kien') RETURNS text
LANGUAGE sql AS $$
  SELECT format($q$INSERT INTO mot_cua.lich_cong_tac (tieu_de, loai, bat_dau, ket_thuc, dia_diem, chu_tri, trang_thai)
                   VALUES (%L, 'hop', %L, %L, %L, 'Chủ tịch UBND xã', %L)$q$,
                'Họp ZQLICH ' || td, '2030-03-04 ' || bd || '+07', '2030-03-04 ' || kt || '+07', dd, tt)
$$;
-- giu(tên, câu INSERT) → thêm thật và nhớ id theo tên.
CREATE FUNCTION pg_temp.giu(ten text, cau text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('WITH x AS (%s RETURNING id) INSERT INTO pg_temp.ids SELECT %L, id FROM x', cau, ten);
END
$$;
CREATE FUNCTION pg_temp.id(ten text) RETURNS text
LANGUAGE sql AS $$ SELECT id::text FROM pg_temp.ids WHERE ids.ten = $1 $$;
-- thay(câu) → đổi :L1, :L2, :L3 thành id thật.
CREATE FUNCTION pg_temp.thay(cau text) RETURNS text
LANGUAGE sql AS $$
  SELECT replace(replace(replace(cau, ':L1', coalesce(pg_temp.id('L1'), ':L1')), ':L2', coalesce(pg_temp.id('L2'), ':L2')),
                 ':L3', coalesce(pg_temp.id('L3'), ':L3'))
$$;
CREATE FUNCTION pg_temp.dem_thay() RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(i.ten || ':' || l.trang_thai, ',' ORDER BY i.ten), '')
    FROM mot_cua.lich_cong_tac l JOIN pg_temp.ids i ON i.id = l.id
$$;

-- 1. Ai ghi được --------------------------------------------------------------------------------
SELECT pg_temp.vai('can_bo', 'test-lich-cb');
SELECT pg_temp.kiem('cán bộ thêm lịch → chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.them('cán bộ', '08:00', '09:00', 'Phòng thử')));
SELECT pg_temp.vai('cong_dan', 'test-lich-cd');
SELECT pg_temp.kiem('công dân thêm lịch → chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.them('công dân', '08:00', '09:00', 'Phòng thử')));
SELECT pg_temp.kiem('công dân đọc lịch → chặn', 'chặn 42501',
  pg_temp.thu('SELECT 1 FROM mot_cua.lich_cong_tac'));
SELECT pg_temp.vai('anon');
SELECT pg_temp.kiem('không đăng nhập đọc lịch → chặn', 'chặn 42501',
  pg_temp.thu('SELECT 1 FROM mot_cua.lich_cong_tac'));

RESET ROLE;
SELECT stt AS dau_truoc FROM mot_cua.dau_chuoi_kiem_toan \gset
SELECT pg_temp.vai('van_thu', 'test-lich-vt');
SELECT pg_temp.giu('L1', pg_temp.them('giao ban', '08:00', '10:00', 'Phòng họp số 1'));
SELECT pg_temp.kiem('văn thư thêm lịch dự kiến; người tạo lấy từ JWT, chưa có người duyệt',
  'du_kien test-lich-vt test-lich-vt true',
  (SELECT trang_thai || ' ' || nguoi_tao_sub || ' ' || nguoi_sua_sub || ' ' || (nguoi_duyet_sub IS NULL AND duyet_luc IS NULL)
     FROM mot_cua.lich_cong_tac WHERE id::text = pg_temp.id('L1')));
SELECT pg_temp.kiem('văn thư thêm lịch đã duyệt → chặn (RLS)', 'chặn 42501',
  pg_temp.thu(pg_temp.them('tự duyệt', '13:00', '14:00', 'Phòng thử', 'da_duyet')));
SELECT pg_temp.kiem('văn thư tự khai người tạo → chặn (không có quyền cột)', 'chặn 42501',
  pg_temp.thu($q$INSERT INTO mot_cua.lich_cong_tac (tieu_de, loai, bat_dau, ket_thuc, nguoi_tao_sub)
                VALUES ('Giả mạo', 'khac', now(), now() + interval '1 hour', 'nguoi-khac')$q$));
SELECT pg_temp.kiem('kết thúc không sau bắt đầu → chặn 23514', 'chặn 23514',
  pg_temp.thu(pg_temp.them('ngược giờ', '10:00', '09:00', 'Phòng thử')));
SELECT pg_temp.kiem('kéo dài quá 7 ngày → chặn 23514', 'chặn 23514',
  pg_temp.thu($q$INSERT INTO mot_cua.lich_cong_tac (tieu_de, loai, bat_dau, ket_thuc)
                VALUES ('Công tác ZQLICH dài', 'cong_tac', '2030-03-04 08:00+07', '2030-03-12 08:00+07')$q$));
SELECT pg_temp.kiem('loại lịch lạ → chặn 23514', 'chặn 23514',
  pg_temp.thu($q$INSERT INTO mot_cua.lich_cong_tac (tieu_de, loai, bat_dau, ket_thuc)
                VALUES ('Lịch ZQLICH lạ', 'du_tiec', '2030-03-04 08:00+07', '2030-03-04 09:00+07')$q$));

-- 2. Poka-yoke: trùng địa điểm + chồng giờ ------------------------------------------------------------
SELECT pg_temp.kiem('trùng địa điểm (khác hoa thường, khoảng trắng) và chồng giờ → chặn 23P01', 'chặn 23P01',
  pg_temp.thu(pg_temp.them('trùng', '09:30', '11:00', '  phòng họp SỐ 1 ')));
SELECT pg_temp.kiem('cùng địa điểm, nối tiếp ngay sau (10:00–11:00) → được', '1 dòng',
  pg_temp.thu(pg_temp.them('nối tiếp', '10:00', '11:00', 'Phòng họp số 1')));
SELECT pg_temp.kiem('khác địa điểm, chồng giờ → được', '1 dòng',
  pg_temp.thu(pg_temp.them('nơi khác', '08:30', '09:30', 'Hội trường')));
SELECT pg_temp.kiem('không ghi địa điểm → không kiểm trùng', '1 dòng',
  pg_temp.thu(pg_temp.them('không địa điểm', '08:00', '10:00', NULL)));

-- 3. Cán bộ chỉ thấy lịch đã duyệt ---------------------------------------------------------------------
SELECT pg_temp.giu('L3', pg_temp.them('tiếp dân', '14:00', '16:00', 'Phòng tiếp dân'));
UPDATE mot_cua.lich_cong_tac SET ghi_chu = 'Ghi chú ZQLICH nội bộ' WHERE id::text = pg_temp.id('L1');
SELECT pg_temp.kiem('văn thư sửa lịch dự kiến: người sửa đổi, vẫn dự kiến', 'du_kien test-lich-vt',
  (SELECT trang_thai || ' ' || nguoi_sua_sub FROM mot_cua.lich_cong_tac WHERE id::text = pg_temp.id('L1')));
SELECT pg_temp.kiem('văn thư duyệt lịch → chặn (RLS)', 'chặn 42501',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.lich_cong_tac SET trang_thai = 'da_duyet' WHERE id = ':L1'$q$)));
SELECT pg_temp.kiem('văn thư tự ghi người duyệt → chặn (không có quyền cột)', 'chặn 42501',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.lich_cong_tac SET nguoi_duyet_sub = 'x' WHERE id = ':L1'$q$)));
SELECT pg_temp.vai('can_bo', 'test-lich-cb');
SELECT pg_temp.kiem('cán bộ chưa thấy lịch dự kiến', '', pg_temp.dem_thay());

SELECT pg_temp.vai('lanh_dao', 'test-lich-ld');
SELECT pg_temp.kiem('lãnh đạo thấy lịch dự kiến', 'L1:du_kien,L3:du_kien', pg_temp.dem_thay());
UPDATE mot_cua.lich_cong_tac SET trang_thai = 'da_duyet' WHERE id::text = pg_temp.id('L1');
SELECT pg_temp.kiem('lãnh đạo duyệt: CSDL ghi người duyệt, giờ duyệt', 'da_duyet test-lich-ld true',
  (SELECT trang_thai || ' ' || nguoi_duyet_sub || ' ' || (duyet_luc IS NOT NULL)
     FROM mot_cua.lich_cong_tac WHERE id::text = pg_temp.id('L1')));
SELECT pg_temp.giu('L2', pg_temp.them('lãnh đạo', '15:00', '16:00', 'Hội trường', 'da_duyet'));
SELECT pg_temp.kiem('lãnh đạo thêm thẳng lịch đã duyệt: người duyệt là mình', 'da_duyet test-lich-ld',
  (SELECT trang_thai || ' ' || nguoi_duyet_sub FROM mot_cua.lich_cong_tac WHERE id::text = pg_temp.id('L2')));
SELECT pg_temp.kiem('lãnh đạo thêm lịch đã hủy → chặn 23514', 'chặn 23514',
  pg_temp.thu($q$INSERT INTO mot_cua.lich_cong_tac (tieu_de, loai, bat_dau, ket_thuc, trang_thai)
                VALUES ('Lịch ZQLICH hủy sẵn', 'hop', '2030-03-05 08:00+07', '2030-03-05 09:00+07', 'da_huy')$q$));
SELECT pg_temp.kiem('lịch đã duyệt không trở lại dự kiến → chặn 23514', 'chặn 23514',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.lich_cong_tac SET trang_thai = 'du_kien' WHERE id = ':L1'$q$)));

SELECT pg_temp.vai('can_bo', 'test-lich-cb');
SELECT pg_temp.kiem('cán bộ thấy lịch đã duyệt, không thấy lịch dự kiến', 'L1:da_duyet,L2:da_duyet', pg_temp.dem_thay());
SELECT pg_temp.kiem('cán bộ sửa lịch → chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.lich_cong_tac SET tieu_de = 'Sửa ZQLICH' WHERE id = ':L1'$q$)));
SELECT pg_temp.vai('van_thu', 'test-lich-vt');
SELECT pg_temp.kiem('văn thư sửa lịch đã duyệt → không dòng nào (RLS)', '0 dòng',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.lich_cong_tac SET tieu_de = 'Sửa ZQLICH' WHERE id = ':L1'$q$)));

-- 4. Hủy ------------------------------------------------------------------------------------------------
SELECT pg_temp.kiem('hủy không ghi lý do → chặn 23514', 'chặn 23514',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.lich_cong_tac SET trang_thai = 'da_huy' WHERE id = ':L3'$q$)));
SELECT pg_temp.kiem('hủy với lý do toàn khoảng trắng → chặn 23514', 'chặn 23514',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.lich_cong_tac SET trang_thai = 'da_huy', ly_do_huy = '   ' WHERE id = ':L3'$q$)));
UPDATE mot_cua.lich_cong_tac SET trang_thai = 'da_huy', ly_do_huy = 'Đổi sang tuần sau' WHERE id::text = pg_temp.id('L3');
SELECT pg_temp.kiem('văn thư hủy lịch dự kiến có lý do', 'da_huy', (SELECT trang_thai FROM mot_cua.lich_cong_tac WHERE id::text = pg_temp.id('L3')));
SELECT pg_temp.vai('lanh_dao', 'test-lich-ld');
UPDATE mot_cua.lich_cong_tac SET trang_thai = 'da_huy', ly_do_huy = 'Chủ tịch đi họp huyện' WHERE id::text = pg_temp.id('L1');
SELECT pg_temp.kiem('lịch đã hủy không sửa được → chặn 23514', 'chặn 23514',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.lich_cong_tac SET tieu_de = 'Sửa ZQLICH' WHERE id = ':L1'$q$)));
SELECT pg_temp.kiem('lịch đã hủy không làm trùng: đặt lại giờ, nơi của lịch đã hủy → được', '1 dòng',
  pg_temp.thu(pg_temp.them('đặt lại', '08:00', '10:00', 'Phòng họp số 1')));
-- Một lịch còn hiệu lực ở Phòng tiếp dân (L3 ở đó đã hủy) để có chỗ trùng; không nằm trong ids.
DO $$ BEGIN EXECUTE pg_temp.them('chặn chỗ', '15:00', '16:00', 'Phòng tiếp dân'); END $$;
SELECT pg_temp.kiem('sửa lịch đã duyệt sang địa điểm đang bận cùng giờ → chặn 23P01', 'chặn 23P01',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.lich_cong_tac SET dia_diem = 'Phòng tiếp dân' WHERE id = ':L2'$q$)));
SELECT pg_temp.kiem('lãnh đạo tự ghi người duyệt → chặn (không có quyền cột)', 'chặn 42501',
  pg_temp.thu(pg_temp.thay($q$UPDATE mot_cua.lich_cong_tac SET nguoi_duyet_sub = 'x' WHERE id = ':L2'$q$)));
SELECT pg_temp.kiem('lãnh đạo xóa lịch → chặn', 'chặn 42501',
  pg_temp.thu(pg_temp.thay($q$DELETE FROM mot_cua.lich_cong_tac WHERE id = ':L2'$q$)));
-- Sửa mà không đổi gì: giữ người sửa, không ghi nhật ký.
UPDATE mot_cua.lich_cong_tac SET tieu_de = tieu_de WHERE id::text = pg_temp.id('L2');

SELECT pg_temp.vai('can_bo', 'test-lich-cb');
SELECT pg_temp.kiem('cán bộ vẫn thấy lịch đã duyệt rồi hủy (để biết lịch bị bỏ), không thấy lịch hủy khi còn dự kiến',
  'L1:da_huy,L2:da_duyet', pg_temp.dem_thay());

RESET ROLE;
SELECT pg_temp.kiem('superuser cũng không xóa được lịch', 'chặn 42501',
  pg_temp.thu(pg_temp.thay($q$DELETE FROM mot_cua.lich_cong_tac WHERE id = ':L2'$q$)));
SELECT pg_temp.kiem('không TRUNCATE được bảng lịch', 'chặn 42501', pg_temp.thu('TRUNCATE mot_cua.lich_cong_tac'));

-- 5. Nhật ký kiểm toán ------------------------------------------------------------------------------------
SELECT pg_temp.kiem('nhật ký lich.* đủ theo thứ tự',
  'L1:lich.them,L3:lich.them,L1:lich.sua,L1:lich.duyet,L2:lich.them,L3:lich.huy,L1:lich.huy',
  (SELECT string_agg(i.ten || ':' || k.hanh_dong, ',' ORDER BY k.stt)
     FROM mot_cua.nhat_ky_kiem_toan k JOIN pg_temp.ids i ON i.id::text = k.doi_tuong_id
    WHERE k.stt > :dau_truoc AND k.doi_tuong = 'lich_cong_tac'));
SELECT pg_temp.kiem('nhật ký sửa: người sửa, trường đổi', 'test-lich-vt ["ghi_chu"]',
  (SELECT k.nguoi_sub || ' ' || (k.du_lieu -> 'truongDoi')::text FROM mot_cua.nhat_ky_kiem_toan k
    WHERE k.stt > :dau_truoc AND k.hanh_dong = 'lich.sua' AND k.doi_tuong_id = pg_temp.id('L1')));
SELECT pg_temp.kiem('nhật ký duyệt và hủy ghi người làm, nguồn api', 'api test-lich-ld api test-lich-ld',
  (SELECT string_agg(k.nguon || ' ' || k.nguoi_sub, ' ' ORDER BY k.stt) FROM mot_cua.nhat_ky_kiem_toan k
    WHERE k.stt > :dau_truoc AND k.hanh_dong IN ('lich.duyet', 'lich.huy') AND k.doi_tuong_id = pg_temp.id('L1')));
SELECT pg_temp.kiem('nhật ký không chứa tiêu đề, ghi chú hay lý do hủy', '0',
  (SELECT count(*)::text FROM mot_cua.nhat_ky_kiem_toan
    WHERE stt > :dau_truoc AND (du_lieu::text LIKE '%ZQLICH%' OR du_lieu::text LIKE '%họp huyện%')));
SELECT pg_temp.kiem('chuỗi kiểm toán vẫn hợp lệ', 'true', (mot_cua.xac_minh_kiem_toan() ->> 'hopLe'));

SELECT CASE WHEN mong_doi IS NOT DISTINCT FROM thuc_te THEN 'ĐẠT' ELSE 'TRƯỢT' END,
       mo_ta, mong_doi, coalesce(thuc_te, 'NULL')
  FROM ket_qua ORDER BY stt;
SELECT count(*) FILTER (WHERE mong_doi IS DISTINCT FROM thuc_te) > 0 AS co_truot FROM ket_qua \gset
ROLLBACK;
\if :co_truot
  DO $$ BEGIN RAISE EXCEPTION 'Có kiểm tra lịch công tác trượt'; END $$;
\endif

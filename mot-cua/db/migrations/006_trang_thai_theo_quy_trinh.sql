-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Bộ máy một cửa – trạng thái hồ sơ đi theo bước quy trình Flowable (#73).
-- nen-tang/scripts/tang2-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- Flowable là nguồn đúng của tiến độ; ho_so.trang_thai là bản chiếu để RLS, cổng công dân, báo
-- cáo đọc mà không gọi Flowable. Ánh xạ bước → trạng thái của từng thủ tục do bộ nạp gói tính
-- (mot-cua/backend/trang_thai.py) và ghi vào thu_tuc.trang_thai_buoc. mot-cua-api (sau khi gọi
-- Flowable thành công) và mot-cua-worker (đối soát định kỳ) gọi RPC dong_bo_trang_thai: đổi
-- trạng thái, ghi lịch sử, ghi sự kiện vào hộp thư đi trong CÙNG một transaction.
--
-- Thêm trạng thái cho_phe_duyet: hồ sơ đang chờ lãnh đạo phê duyệt/ký. Chỉ quy trình đưa hồ sơ
-- vào và ra khỏi trạng thái này; cán bộ không tự chuyển qua /api (không vượt quyền lãnh đạo).

-- 1. Giá trị trạng thái ------------------------------------------------------------
ALTER TABLE mot_cua.ho_so DROP CONSTRAINT ho_so_trang_thai_check;
ALTER TABLE mot_cua.ho_so ADD CONSTRAINT ho_so_trang_thai_check
  CHECK (trang_thai IN ('moi', 'dang_xu_ly', 'cho_bo_sung', 'cho_phe_duyet', 'hoan_tat', 'tu_choi'));
COMMENT ON COLUMN mot_cua.ho_so.trang_thai IS
  'moi → dang_xu_ly ⇄ cho_bo_sung, dang_xu_ly ⇄ cho_phe_duyet → hoan_tat | tu_choi. Hồ sơ có quy trình: đi theo bước Flowable (thu_tuc.trang_thai_buoc, RPC dong_bo_trang_thai); hồ sơ giấy: cán bộ chuyển tại quầy. Chuyển sai bị trigger chặn';

-- 2. Ánh xạ bước → trạng thái của gói ----------------------------------------------------
ALTER TABLE mot_cua.thu_tuc
  ADD COLUMN trang_thai_buoc jsonb CHECK (jsonb_typeof(trang_thai_buoc) = 'object');
COMMENT ON COLUMN mot_cua.thu_tuc.trang_thai_buoc IS
  'Trạng thái hồ sơ khi đang ở từng userTask: {"<buoc>": "moi|dang_xu_ly|cho_bo_sung|cho_phe_duyet"}. Bộ nạp gói tính từ BPMN (công dân → cho_bo_sung, lanh_dao → cho_phe_duyet, còn lại → dang_xu_ly) và trang_thai_theo_buoc của thu-tuc.yaml';

-- 3. Lịch sử chuyển trạng thái (chỉ thêm) ---------------------------------------------------
-- Mọi lần trang_thai đổi, dù qua quy trình, qua /api (tại quầy, công dân báo đã bổ sung) hay SQL
-- trực tiếp, đều có một dòng: trigger AFTER trên ho_so ghi, cùng transaction với thay đổi.
CREATE TABLE mot_cua.lich_su_trang_thai (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ho_so_id       uuid NOT NULL REFERENCES mot_cua.ho_so (id) ON DELETE CASCADE,
  tu_trang_thai  text,
  den_trang_thai text NOT NULL,
  ly_do          text,
  buoc           text,
  nguon          text NOT NULL CHECK (nguon IN ('nop', 'api', 'quy_trinh', 'doi_soat', 'he_thong')),
  nguoi_sub      text,
  luc            timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON mot_cua.lich_su_trang_thai (ho_so_id, id);
COMMENT ON TABLE mot_cua.lich_su_trang_thai IS 'Lịch sử chuyển trạng thái hồ sơ (#73). Chỉ thêm, theo quyền xem hồ sơ';
COMMENT ON COLUMN mot_cua.lich_su_trang_thai.tu_trang_thai IS 'NULL = lúc nộp hồ sơ';
COMMENT ON COLUMN mot_cua.lich_su_trang_thai.buoc IS 'Bước Flowable (taskDefinitionKey) vừa hoàn thành dẫn tới thay đổi, nếu có';
COMMENT ON COLUMN mot_cua.lich_su_trang_thai.nguon IS
  'nop: nộp hồ sơ · api: người dùng sửa qua /api · quy_trinh: mot-cua-api sau khi gọi Flowable · doi_soat: mot-cua-worker sửa lệch với Flowable · he_thong: SQL quản trị';

CREATE FUNCTION mot_cua_noi_bo.chan_sua_lich_su() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Lịch sử trạng thái chỉ được thêm, không sửa' USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER chan_sua_lich_su BEFORE UPDATE ON mot_cua.lich_su_trang_thai
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.chan_sua_lich_su();
CREATE TRIGGER chan_xoa_het_lich_su BEFORE TRUNCATE ON mot_cua.lich_su_trang_thai
  FOR EACH STATEMENT EXECUTE FUNCTION mot_cua_noi_bo.chan_sua_lich_su();

-- Role mà PostgREST chuyển sang theo JWT: thay đổi của các role này là "api", không phải quy trình.
CREATE FUNCTION mot_cua_noi_bo.la_role_api(r name) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT r IN ('authenticator', 'anon', 'cong_dan', 'can_bo', 'lanh_dao',
               'dich_vu_tep', 'dich_vu_su_kien', 'dich_vu_danh_muc')
$$;

-- Nguồn thay đổi do RPC dong_bo_trang_thai đặt (set_config cục bộ trong transaction). Chỉ có
-- nghĩa khi đang chạy với quyền chủ hàm (không phải role API): PostgREST không cho client đặt
-- GUC tùy ý, và role API có đặt được cũng bị bỏ qua.
CREATE FUNCTION mot_cua_noi_bo.nguon_dong_bo() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN NOT mot_cua_noi_bo.la_role_api(current_user)
                   AND current_setting('mot_cua.dong_bo_nguon', true) IN ('quy_trinh', 'doi_soat')
              THEN current_setting('mot_cua.dong_bo_nguon', true) END
$$;

CREATE FUNCTION mot_cua_noi_bo.ghi_lich_su_trang_thai() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_nguon text := mot_cua_noi_bo.nguon_dong_bo();
BEGIN
  INSERT INTO mot_cua.lich_su_trang_thai (ho_so_id, tu_trang_thai, den_trang_thai, ly_do, buoc, nguon, nguoi_sub)
  VALUES (NEW.id,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.trang_thai END,
          NEW.trang_thai,
          CASE WHEN NEW.trang_thai IN ('cho_bo_sung', 'tu_choi') THEN NEW.ly_do END,
          CASE WHEN v_nguon IS NOT NULL THEN nullif(current_setting('mot_cua.dong_bo_buoc', true), '') END,
          CASE WHEN TG_OP = 'INSERT' THEN 'nop'
               WHEN v_nguon IS NOT NULL THEN v_nguon
               -- Hàm chạy với quyền chủ hàm: role của request đọc từ GUC role (PostgREST SET LOCAL ROLE).
               WHEN mot_cua_noi_bo.la_role_api(session_user)
                    OR mot_cua_noi_bo.la_role_api(current_setting('role', true)::name) THEN 'api'
               ELSE 'he_thong' END,
          CASE WHEN v_nguon IS NOT NULL THEN nullif(current_setting('mot_cua.dong_bo_nguoi', true), '')
               ELSE dxos.jwt_sub() END);
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION mot_cua_noi_bo.ghi_lich_su_trang_thai() FROM PUBLIC;

CREATE TRIGGER ghi_lich_su_khi_nop AFTER INSERT ON mot_cua.ho_so
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.ghi_lich_su_trang_thai();
CREATE TRIGGER ghi_lich_su_khi_doi AFTER UPDATE OF trang_thai ON mot_cua.ho_so
  FOR EACH ROW WHEN (OLD.trang_thai IS DISTINCT FROM NEW.trang_thai)
  EXECUTE FUNCTION mot_cua_noi_bo.ghi_lich_su_trang_thai();

-- Hồ sơ đã có trước migration này: một dòng "he_thong" với trạng thái hiện tại làm mốc.
INSERT INTO mot_cua.lich_su_trang_thai (ho_so_id, tu_trang_thai, den_trang_thai, ly_do, nguon, luc)
SELECT id, NULL, trang_thai, CASE WHEN trang_thai IN ('cho_bo_sung', 'tu_choi') THEN ly_do END, 'he_thong', updated_at
  FROM mot_cua.ho_so;

-- 4. Trigger hồ sơ: thêm cho_phe_duyet, cho quy trình đi mọi bước ----------------------------
-- Giữ nguyên 002 (sinh mã, tính hạn, khóa cột đã nộp, tự giao cán bộ, ngày hoàn tất), chỉ đổi
-- bảng chuyển trạng thái:
--   người dùng qua /api, SQL: như 002; cho_phe_duyet không ai tự chuyển vào/ra.
--   quy trình (RPC dong_bo_trang_thai): từ trạng thái chưa đóng sang bất kỳ trạng thái nào
--     trừ moi, vì Flowable có thể đi qua nhiều bước giữa hai lần đối soát.
CREATE OR REPLACE FUNCTION mot_cua_noi_bo.ho_so_truoc_ghi() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  so_ngay integer;
  hop_le  text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ma_ho_so IS NULL THEN
      NEW.ma_ho_so := 'HS' || to_char(NEW.ngay_nhan AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD')
                      || '-' || lpad(nextval('mot_cua.ma_ho_so_seq')::text, 6, '0');
    END IF;
    SELECT t.so_ngay_xu_ly INTO so_ngay FROM mot_cua.thu_tuc t WHERE t.id = NEW.thu_tuc_id;
    IF so_ngay IS NOT NULL THEN
      NEW.han_xu_ly := mot_cua_noi_bo.cong_ngay_lam_viec(
        (NEW.ngay_nhan AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, so_ngay);
    END IF;
  ELSE
    IF NEW.trang_thai IS DISTINCT FROM OLD.trang_thai THEN
      IF mot_cua_noi_bo.nguon_dong_bo() IS NOT NULL THEN
        hop_le := CASE WHEN OLD.trang_thai IN ('hoan_tat', 'tu_choi') THEN ARRAY[]::text[]
                       ELSE ARRAY['dang_xu_ly', 'cho_bo_sung', 'cho_phe_duyet', 'hoan_tat', 'tu_choi'] END;
      ELSE
        hop_le := CASE OLD.trang_thai
          WHEN 'moi'         THEN ARRAY['dang_xu_ly', 'cho_bo_sung', 'tu_choi']
          WHEN 'dang_xu_ly'  THEN ARRAY['cho_bo_sung', 'hoan_tat', 'tu_choi']
          WHEN 'cho_bo_sung' THEN ARRAY['dang_xu_ly', 'tu_choi']
          ELSE ARRAY[]::text[]
        END;
      END IF;
      IF NOT NEW.trang_thai = ANY (hop_le) THEN
        RAISE EXCEPTION 'Không chuyển được hồ sơ % từ "%" sang "%"', OLD.ma_ho_so, OLD.trang_thai, NEW.trang_thai
          USING ERRCODE = 'check_violation';
      END IF;
      -- Cán bộ nhận xử lý hồ sơ chưa giao thì hồ sơ được giao cho chính cán bộ đó.
      IF NEW.can_bo_xu_ly_id IS NULL AND current_user = 'can_bo' THEN
        NEW.can_bo_xu_ly_id := mot_cua_noi_bo.can_bo_hien_tai();
      END IF;
    END IF;
    IF NEW.thu_tuc_id IS DISTINCT FROM OLD.thu_tuc_id OR NEW.ma_ho_so IS DISTINCT FROM OLD.ma_ho_so
       OR NEW.nguoi_nop_sub IS DISTINCT FROM OLD.nguoi_nop_sub OR NEW.ngay_nhan IS DISTINCT FROM OLD.ngay_nhan THEN
      RAISE EXCEPTION 'Không sửa được thủ tục, mã, người nộp hay ngày nhận của hồ sơ đã nộp'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.trang_thai IN ('hoan_tat', 'tu_choi') THEN
    NEW.ngay_hoan_tat := coalesce(NEW.ngay_hoan_tat, now());
  ELSE
    NEW.ngay_hoan_tat := NULL;
  END IF;
  IF NEW.can_bo_xu_ly_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.can_bo_xu_ly_id IS DISTINCT FROM OLD.can_bo_xu_ly_id)
     AND NOT mot_cua_noi_bo.can_bo_phu_trach(NEW.can_bo_xu_ly_id, NEW.thu_tuc_id) THEN
    RAISE EXCEPTION 'Cán bộ được giao không phụ trách lĩnh vực của thủ tục này'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- 5. RPC đồng bộ trạng thái theo quy trình -------------------------------------------------
-- POST /rpc/dong_bo_trang_thai (chỉ dich_vu_su_kien: mot-cua-api và mot-cua-worker). Một lời
-- gọi = một transaction của PostgREST:
--   khóa dòng hồ sơ (FOR UPDATE: API và worker gọi cùng lúc thì lần lượt) → đổi trạng thái nếu
--   khác (lý do, giao cán bộ đã xử lý nếu chưa giao) → trigger ghi lịch sử → ghi các sự kiện vào
--   hộp thư đi, mỗi sự kiện được thêm duLieu.trangThai = trạng thái sau khi đổi. Sự kiện trùng id
--   hoặc khóa chống trùng bị bỏ qua (gọi lại an toàn). Lỗi ở bất kỳ đâu → không ghi gì.
-- p_trang_thai NULL = chỉ ghi sự kiện. Hồ sơ đã đóng thì không đổi nữa (sự kiện vẫn ghi).
CREATE FUNCTION mot_cua.dong_bo_trang_thai(
  p_ho_so_id   uuid,
  p_trang_thai text DEFAULT NULL,
  p_ly_do      text DEFAULT NULL,
  p_buoc       text DEFAULT NULL,
  p_nguon      text DEFAULT 'quy_trinh',
  p_nguoi_sub  text DEFAULT NULL,
  p_su_kien    jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hs     mot_cua.ho_so%ROWTYPE;
  v_sau    text;
  v_cb     uuid;
  v_ev     record;
  v_so     integer := 0;
  v_n      integer;
BEGIN
  IF p_nguon NOT IN ('quy_trinh', 'doi_soat') THEN
    RAISE EXCEPTION 'p_nguon phải là quy_trinh hoặc doi_soat' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_trang_thai IS NOT NULL AND p_trang_thai NOT IN ('dang_xu_ly', 'cho_bo_sung', 'cho_phe_duyet', 'hoan_tat', 'tu_choi') THEN
    RAISE EXCEPTION 'Trạng thái "%" không đặt được theo quy trình', p_trang_thai USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_typeof(coalesce(p_su_kien, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_su_kien phải là mảng' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT * INTO v_hs FROM mot_cua.ho_so WHERE id = p_ho_so_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không thấy hồ sơ %', p_ho_so_id USING ERRCODE = 'no_data_found';
  END IF;

  v_sau := v_hs.trang_thai;
  IF p_trang_thai IS NOT NULL AND p_trang_thai <> v_hs.trang_thai AND v_hs.trang_thai NOT IN ('hoan_tat', 'tu_choi') THEN
    v_sau := p_trang_thai;
    IF v_hs.can_bo_xu_ly_id IS NULL AND p_nguoi_sub IS NOT NULL THEN
      SELECT c.id INTO v_cb FROM mot_cua.can_bo c
       WHERE c.sub = p_nguoi_sub AND c.dang_lam_viec AND mot_cua_noi_bo.can_bo_phu_trach(c.id, v_hs.thu_tuc_id);
    END IF;
    PERFORM set_config('mot_cua.dong_bo_nguon', p_nguon, true),
            set_config('mot_cua.dong_bo_buoc', coalesce(p_buoc, ''), true),
            set_config('mot_cua.dong_bo_nguoi', coalesce(p_nguoi_sub, ''), true);
    UPDATE mot_cua.ho_so
       SET trang_thai = v_sau,
           ly_do = CASE WHEN v_sau IN ('cho_bo_sung', 'tu_choi')
                        THEN coalesce(nullif(btrim(p_ly_do), ''), ly_do, 'Theo kết quả xử lý của quy trình')
                        ELSE ly_do END,
           can_bo_xu_ly_id = coalesce(can_bo_xu_ly_id, v_cb)
     WHERE id = p_ho_so_id;
    PERFORM set_config('mot_cua.dong_bo_nguon', '', true),
            set_config('mot_cua.dong_bo_buoc', '', true),
            set_config('mot_cua.dong_bo_nguoi', '', true);
  END IF;

  FOR v_ev IN SELECT * FROM jsonb_to_recordset(coalesce(p_su_kien, '[]'::jsonb))
                AS e(id uuid, loai text, ho_so_id uuid, khoa_chong_trung text, noi_dung jsonb) LOOP
    IF v_ev.ho_so_id IS DISTINCT FROM p_ho_so_id THEN
      RAISE EXCEPTION 'Sự kiện % không thuộc hồ sơ %', v_ev.id, p_ho_so_id USING ERRCODE = 'invalid_parameter_value';
    END IF;
    INSERT INTO mot_cua.hop_thu_su_kien (id, loai, ho_so_id, khoa_chong_trung, noi_dung)
    VALUES (v_ev.id, v_ev.loai, v_ev.ho_so_id, v_ev.khoa_chong_trung,
            jsonb_set(v_ev.noi_dung, '{duLieu,trangThai}', to_jsonb(v_sau)))
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_so := v_so + v_n;
  END LOOP;

  RETURN jsonb_build_object('trangThaiTruoc', v_hs.trang_thai, 'trangThai', v_sau,
                            'daDoi', v_sau IS DISTINCT FROM v_hs.trang_thai, 'soSuKien', v_so);
END
$$;
COMMENT ON FUNCTION mot_cua.dong_bo_trang_thai(uuid, text, text, text, text, text, jsonb) IS
  'Đổi trạng thái hồ sơ theo quy trình + ghi lịch sử + ghi sự kiện vào hộp thư đi trong một transaction (chỉ dich_vu_su_kien, #73)';

-- 6. Bộ nạp gói ghi ánh xạ ------------------------------------------------------------
-- Như 005, thêm trang_thai_buoc (p_goi ->> 'trang_thai_buoc').
CREATE OR REPLACE FUNCTION mot_cua.nap_thu_tuc(p_goi jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_linh_vuc uuid;
  v_thu_tuc  uuid;
  v_moi      boolean;
  v_tp       jsonb;
  v_thu_tu   integer := 0;
  v_ma_tp    text[] := ARRAY[]::text[];
BEGIN
  INSERT INTO mot_cua.linh_vuc (ma, ten)
  VALUES (p_goi ->> 'linh_vuc', coalesce(p_goi ->> 'ten_linh_vuc', p_goi ->> 'linh_vuc'))
  ON CONFLICT (ma) DO NOTHING;
  SELECT id INTO v_linh_vuc FROM mot_cua.linh_vuc WHERE ma = p_goi ->> 'linh_vuc';

  INSERT INTO mot_cua.thu_tuc AS t (ma, ten, linh_vuc_id, so_ngay_xu_ly, le_phi, ghi_chu_le_phi,
                                    can_cu_phap_ly, cong_khai, goi, quy_trinh, bien_theo_buoc,
                                    trang_thai_buoc, json_schema, goi_sha256, nap_luc)
  VALUES (p_goi ->> 'ma', p_goi ->> 'ten', v_linh_vuc, (p_goi ->> 'so_ngay_xu_ly')::integer,
          coalesce((p_goi ->> 'le_phi')::integer, 0), p_goi ->> 'ghi_chu_le_phi',
          p_goi ->> 'can_cu_phap_ly', coalesce((p_goi ->> 'cong_khai')::boolean, true),
          p_goi ->> 'goi', p_goi ->> 'quy_trinh', p_goi -> 'bien_theo_buoc', p_goi -> 'trang_thai_buoc',
          p_goi -> 'json_schema', p_goi ->> 'goi_sha256', now())
  ON CONFLICT (ma) DO UPDATE SET
    ten = EXCLUDED.ten, linh_vuc_id = EXCLUDED.linh_vuc_id, so_ngay_xu_ly = EXCLUDED.so_ngay_xu_ly,
    le_phi = EXCLUDED.le_phi, ghi_chu_le_phi = EXCLUDED.ghi_chu_le_phi,
    can_cu_phap_ly = EXCLUDED.can_cu_phap_ly, cong_khai = EXCLUDED.cong_khai, goi = EXCLUDED.goi,
    quy_trinh = EXCLUDED.quy_trinh, bien_theo_buoc = EXCLUDED.bien_theo_buoc,
    trang_thai_buoc = EXCLUDED.trang_thai_buoc,
    json_schema = EXCLUDED.json_schema, goi_sha256 = EXCLUDED.goi_sha256, nap_luc = EXCLUDED.nap_luc
  RETURNING t.id, (t.xmax = 0) INTO v_thu_tuc, v_moi;

  FOR v_tp IN SELECT e FROM jsonb_array_elements(coalesce(p_goi -> 'thanh_phan', '[]'::jsonb)) AS e LOOP
    v_thu_tu := v_thu_tu + 1;
    v_ma_tp := v_ma_tp || (v_tp ->> 'ma');
    INSERT INTO mot_cua.thanh_phan_yeu_cau (thu_tuc_id, ma, ten, bat_buoc, so_luong, ghi_chu, thu_tu)
    VALUES (v_thu_tuc, v_tp ->> 'ma', v_tp ->> 'ten', (v_tp ->> 'bat_buoc')::boolean,
            coalesce((v_tp ->> 'so_luong')::integer, 1), v_tp ->> 'ghi_chu', v_thu_tu)
    ON CONFLICT (thu_tuc_id, ma) DO UPDATE SET
      ten = EXCLUDED.ten, bat_buoc = EXCLUDED.bat_buoc, so_luong = EXCLUDED.so_luong,
      ghi_chu = EXCLUDED.ghi_chu, thu_tu = EXCLUDED.thu_tu;
  END LOOP;
  UPDATE mot_cua.thanh_phan_yeu_cau
     SET bat_buoc = false
   WHERE thu_tuc_id = v_thu_tuc AND bat_buoc AND NOT (ma = ANY (v_ma_tp));

  RETURN jsonb_build_object('id', v_thu_tuc, 'ma', p_goi ->> 'ma', 'moi', v_moi,
                            'soThanhPhan', v_thu_tu);
END
$$;

CREATE OR REPLACE FUNCTION mot_cua.rut_goi_vang(p_con_lai text[]) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH rut AS (
    UPDATE mot_cua.thu_tuc
       SET goi = NULL, quy_trinh = NULL, bien_theo_buoc = NULL, trang_thai_buoc = NULL, json_schema = NULL,
           goi_sha256 = NULL, nap_luc = now()
     WHERE goi IS NOT NULL AND NOT (goi = ANY (coalesce(p_con_lai, ARRAY[]::text[])))
    RETURNING ma)
  SELECT coalesce(jsonb_agg(ma ORDER BY ma), '[]'::jsonb) FROM rut
$$;

-- 7. Quyền và RLS ----------------------------------------------------------------------
REVOKE ALL ON FUNCTION mot_cua.dong_bo_trang_thai(uuid, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mot_cua.dong_bo_trang_thai(uuid, text, text, text, text, text, jsonb) TO dich_vu_su_kien;
-- Đối soát của mot-cua-worker cần ánh xạ của thủ tục (không có dữ liệu cá nhân).
GRANT SELECT (quy_trinh, trang_thai_buoc) ON mot_cua.thu_tuc TO dich_vu_su_kien;

GRANT SELECT ON mot_cua.lich_su_trang_thai TO cong_dan, can_bo, lanh_dao;
ALTER TABLE mot_cua.lich_su_trang_thai ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.lich_su_trang_thai FORCE ROW LEVEL SECURITY;
-- Theo quyền xem hồ sơ (truy vấn con chịu RLS của ho_so): công dân – hồ sơ của mình, cán bộ –
-- lĩnh vực phụ trách, lãnh đạo – tất cả.
CREATE POLICY xem_lich_su_trang_thai ON mot_cua.lich_su_trang_thai
  FOR SELECT TO cong_dan, can_bo, lanh_dao
  USING (EXISTS (SELECT 1 FROM mot_cua.ho_so h WHERE h.id = ho_so_id));

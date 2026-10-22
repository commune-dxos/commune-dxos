-- SPDX-License-Identifier: Apache-2.0
-- Bộ máy một cửa – danh mục thủ tục nạp từ gói thu-tuc/<ma>/ (D-009).
-- nen-tang/scripts/tang2-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- Mỗi thủ tục là một gói (thu-tuc.yaml, quy-trinh.bpmn20.xml, thanh-phan-ho-so.schema.json,
-- du-lieu-mau.json). Dịch vụ một lần nap-thu-tuc (mot-cua/backend/nap_thu_tuc.py) kiểm gói,
-- deploy BPMN lên Flowable rồi gọi RPC dưới đây bằng tài khoản dịch vụ `dich_vu_danh_muc`
-- (client Keycloak mot_cua_danh_muc). API một cửa đọc quy trình và biến từng bước từ danh mục,
-- nên thêm thủ tục = thêm thư mục, không sửa mã bộ máy (docs/thu-tuc.md).
-- Thủ tục có sẵn trong seed mà không có gói vẫn nằm trong danh mục, nhưng chưa có quy trình
-- (nộp qua /workflow → 422) cho tới khi có gói.

-- 1. Role dịch vụ ----------------------------------------------------------------
-- Trùng tên client role `dich_vu_danh_muc` của dxos_api (mot-cua/keycloak/realm.json), chỉ gán
-- cho service account của client mot_cua_danh_muc. Chỉ gọi được hai RPC nạp/rút gói.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dich_vu_danh_muc') THEN
    CREATE ROLE dich_vu_danh_muc NOLOGIN;
  END IF;
END
$$;
GRANT dich_vu_danh_muc TO authenticator;

-- 2. Cột của gói trong danh mục -----------------------------------------------------
ALTER TABLE mot_cua.thu_tuc
  ADD COLUMN goi            text UNIQUE CHECK (goi ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  ADD COLUMN quy_trinh      text UNIQUE CHECK (quy_trinh ~ '^[A-Za-z_][A-Za-z0-9_-]{0,254}$'),
  ADD COLUMN bien_theo_buoc jsonb CHECK (jsonb_typeof(bien_theo_buoc) = 'object'),
  ADD COLUMN json_schema    jsonb CHECK (jsonb_typeof(json_schema) = 'object'),
  ADD COLUMN goi_sha256     text CHECK (goi_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN nap_luc        timestamptz,
  ADD CHECK ((goi IS NULL) = (quy_trinh IS NULL));
COMMENT ON COLUMN mot_cua.thu_tuc.goi IS 'Thư mục gói thu-tuc/<goi>/ đã nạp thủ tục này; NULL = chưa có gói (không khởi tạo được quy trình)';
COMMENT ON COLUMN mot_cua.thu_tuc.quy_trinh IS 'process id trong quy-trinh.bpmn20.xml của gói (processDefinitionKey của Flowable)';
COMMENT ON COLUMN mot_cua.thu_tuc.bien_theo_buoc IS 'Biến người xử lý được đặt khi hoàn thành từng userTask: {"<buoc>": {"<bien>": {"kieu": "boolean|string|long", "bat_buoc": bool}}}, lấy từ flowable:formProperty trong BPMN';
COMMENT ON COLUMN mot_cua.thu_tuc.json_schema IS 'thanh-phan-ho-so.schema.json của gói (JSON Schema 2020-12), dùng cho Poka-yoke';
COMMENT ON COLUMN mot_cua.thu_tuc.goi_sha256 IS 'SHA-256 nội dung gói lần nạp gần nhất (bỏ qua nạp lại khi không đổi)';

-- Hạn "trong ngày" (chứng thực bản sao): 0 ngày làm việc = hạn là ngày tiếp nhận (nộp vào
-- ngày nghỉ thì là ngày làm việc kế tiếp, xem mot_cua_noi_bo.cong_ngay_lam_viec).
ALTER TABLE mot_cua.thu_tuc DROP CONSTRAINT thu_tuc_so_ngay_xu_ly_check;
ALTER TABLE mot_cua.thu_tuc ADD CONSTRAINT thu_tuc_so_ngay_xu_ly_check CHECK (so_ngay_xu_ly BETWEEN 0 AND 365);
COMMENT ON COLUMN mot_cua.thu_tuc.so_ngay_xu_ly IS 'Thời hạn giải quyết, tính bằng NGÀY LÀM VIỆC (bỏ thứ Bảy, Chủ nhật, mot_cua.ngay_nghi); 0 = trong ngày';

-- 3. RPC nạp một gói ---------------------------------------------------------------
-- POST /rpc/nap_thu_tuc {"p_goi": {...}} (chỉ dich_vu_danh_muc). Upsert thủ tục theo mã, tạo
-- lĩnh vực nếu chưa có, upsert thành phần yêu cầu theo mã; thành phần không còn trong gói thì
-- thôi bắt buộc (không xóa: hồ sơ cũ còn tham chiếu). Lỗi ràng buộc (mã gói đổi, process id
-- trùng gói khác…) → cả lần nạp gói đó rollback, bộ nạp báo lỗi và bỏ qua gói.
CREATE FUNCTION mot_cua.nap_thu_tuc(p_goi jsonb) RETURNS jsonb
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
                                    json_schema, goi_sha256, nap_luc)
  VALUES (p_goi ->> 'ma', p_goi ->> 'ten', v_linh_vuc, (p_goi ->> 'so_ngay_xu_ly')::integer,
          coalesce((p_goi ->> 'le_phi')::integer, 0), p_goi ->> 'ghi_chu_le_phi',
          p_goi ->> 'can_cu_phap_ly', coalesce((p_goi ->> 'cong_khai')::boolean, true),
          p_goi ->> 'goi', p_goi ->> 'quy_trinh', p_goi -> 'bien_theo_buoc', p_goi -> 'json_schema',
          p_goi ->> 'goi_sha256', now())
  ON CONFLICT (ma) DO UPDATE SET
    ten = EXCLUDED.ten, linh_vuc_id = EXCLUDED.linh_vuc_id, so_ngay_xu_ly = EXCLUDED.so_ngay_xu_ly,
    le_phi = EXCLUDED.le_phi, ghi_chu_le_phi = EXCLUDED.ghi_chu_le_phi,
    can_cu_phap_ly = EXCLUDED.can_cu_phap_ly, cong_khai = EXCLUDED.cong_khai, goi = EXCLUDED.goi,
    quy_trinh = EXCLUDED.quy_trinh, bien_theo_buoc = EXCLUDED.bien_theo_buoc,
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
COMMENT ON FUNCTION mot_cua.nap_thu_tuc(jsonb) IS 'Nạp một gói thủ tục vào danh mục (chỉ tài khoản dịch vụ dich_vu_danh_muc, dịch vụ nap-thu-tuc)';

-- 4. RPC rút gói đã xóa thư mục ------------------------------------------------------
-- POST /rpc/rut_goi_vang {"p_con_lai": ["khai-sinh", …]}: thủ tục có gói không còn trong
-- thu-tuc/ thì thôi có quy trình (hồ sơ mới → 422; quy trình đang chạy trong Flowable vẫn chạy
-- tiếp tới khi xong). Gói còn thư mục nhưng lỗi KHÔNG bị rút: bản nạp tốt gần nhất được giữ.
CREATE FUNCTION mot_cua.rut_goi_vang(p_con_lai text[]) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH rut AS (
    UPDATE mot_cua.thu_tuc
       SET goi = NULL, quy_trinh = NULL, bien_theo_buoc = NULL, json_schema = NULL,
           goi_sha256 = NULL, nap_luc = now()
     WHERE goi IS NOT NULL AND NOT (goi = ANY (coalesce(p_con_lai, ARRAY[]::text[])))
    RETURNING ma)
  SELECT coalesce(jsonb_agg(ma ORDER BY ma), '[]'::jsonb) FROM rut
$$;
COMMENT ON FUNCTION mot_cua.rut_goi_vang(text[]) IS 'Rút các gói không còn thư mục trong thu-tuc/ (chỉ dich_vu_danh_muc)';

REVOKE ALL ON FUNCTION mot_cua.nap_thu_tuc(jsonb), mot_cua.rut_goi_vang(text[]) FROM PUBLIC;
GRANT USAGE ON SCHEMA mot_cua TO dich_vu_danh_muc;
GRANT EXECUTE ON FUNCTION mot_cua.nap_thu_tuc(jsonb), mot_cua.rut_goi_vang(text[]) TO dich_vu_danh_muc;

-- 5. JSON Schema thành phần hồ sơ: ưu tiên schema của gói ------------------------------
-- Thủ tục có gói trả đúng thanh-phan-ho-so.schema.json của gói; thủ tục chưa có gói vẫn sinh
-- từ bảng thanh_phan_yeu_cau như trước (002).
CREATE OR REPLACE FUNCTION mot_cua.json_schema_thu_tuc(ma text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(t.json_schema, jsonb_build_object(
    '$schema', 'https://json-schema.org/draft/2020-12/schema',
    '$id', 'urn:dxos:mot-cua:thu-tuc:' || t.ma,
    'title', t.ten,
    'type', 'object',
    'required', jsonb_build_array('thanh_phan'),
    'properties', jsonb_build_object(
      'thanh_phan', jsonb_build_object(
        'type', 'object',
        'additionalProperties', false,
        'required', coalesce((SELECT jsonb_agg(y.ma ORDER BY y.thu_tu, y.ma)
                                FROM mot_cua.thanh_phan_yeu_cau y
                               WHERE y.thu_tuc_id = t.id AND y.bat_buoc), '[]'::jsonb),
        'properties', coalesce((SELECT jsonb_object_agg(y.ma, jsonb_strip_nulls(jsonb_build_object(
                                   'title', y.ten,
                                   'description', y.ghi_chu,
                                   'type', 'array',
                                   'items', jsonb_build_object('type', 'string', 'format', 'uuid'),
                                   'minItems', CASE WHEN y.bat_buoc THEN y.so_luong ELSE 0 END)))
                                  FROM mot_cua.thanh_phan_yeu_cau y
                                 WHERE y.thu_tuc_id = t.id), '{}'::jsonb)))))
    FROM mot_cua.thu_tuc t
   WHERE t.ma = json_schema_thu_tuc.ma
$$;

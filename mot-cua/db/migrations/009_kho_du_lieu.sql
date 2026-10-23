-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Bộ máy một cửa – kho dữ liệu lịch sử và báo cáo (#80).
-- nen-tang/scripts/tang2-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- Luồng (mot-cua/kho-du-lieu/, docs/architecture.md §4.8):
--   kho-du-lieu đọc hồ sơ ĐÃ ĐÓNG (hoan_tat, tu_choi), lịch sử trạng thái của chúng và ngày nghỉ
--   qua PostgREST bằng tài khoản dịch vụ `dich_vu_bao_cao` (client Keycloak mot_cua_bao_cao) →
--   Parquet (khử định danh) → dbt-core + DuckDB dựng mart → gọi RPC nap_bao_cao đẩy bảng mart về
--   schema bao_cao để Superset đọc bằng driver PostgreSQL.
-- Role dịch vụ chỉ có quyền CỘT không phải dữ liệu cá nhân: họ tên, số điện thoại, sub người nộp,
-- lý do (chữ tự do), người đổi trạng thái đều bị chặn ở CSDL (42501), không chỉ lọc trong mã.

-- 1. Role dịch vụ ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dich_vu_bao_cao') THEN
    CREATE ROLE dich_vu_bao_cao NOLOGIN;
  END IF;
END
$$;
GRANT dich_vu_bao_cao TO authenticator;

GRANT USAGE ON SCHEMA mot_cua TO dich_vu_bao_cao;
GRANT SELECT (id, ma_ho_so, thu_tuc_id, trang_thai, ngay_nhan, han_xu_ly, ngay_hoan_tat) ON mot_cua.ho_so TO dich_vu_bao_cao;
GRANT SELECT (id, ma, ten, linh_vuc_id, so_ngay_xu_ly) ON mot_cua.thu_tuc TO dich_vu_bao_cao;
GRANT SELECT (id, ma, ten) ON mot_cua.linh_vuc TO dich_vu_bao_cao;
GRANT SELECT (ho_so_id, id, tu_trang_thai, den_trang_thai, buoc, nguon, luc) ON mot_cua.lich_su_trang_thai TO dich_vu_bao_cao;
GRANT SELECT (ngay) ON mot_cua.ngay_nghi TO dich_vu_bao_cao;

-- Chỉ hồ sơ đã đóng: dữ liệu lịch sử không đổi nữa, hồ sơ đang xử lý ở lại kho nóng.
CREATE POLICY dich_vu_bao_cao_doc_ho_so ON mot_cua.ho_so
  FOR SELECT TO dich_vu_bao_cao USING (trang_thai IN ('hoan_tat', 'tu_choi'));
CREATE POLICY dich_vu_bao_cao_doc_lich_su ON mot_cua.lich_su_trang_thai
  FOR SELECT TO dich_vu_bao_cao USING (EXISTS (SELECT 1 FROM mot_cua.ho_so h WHERE h.id = ho_so_id));
CREATE POLICY dich_vu_bao_cao_doc_thu_tuc ON mot_cua.thu_tuc
  FOR SELECT TO dich_vu_bao_cao USING (true);
CREATE POLICY dich_vu_bao_cao_doc_linh_vuc ON mot_cua.linh_vuc
  FOR SELECT TO dich_vu_bao_cao USING (true);
CREATE POLICY dich_vu_bao_cao_doc_ngay_nghi ON mot_cua.ngay_nghi
  FOR SELECT TO dich_vu_bao_cao USING (true);

-- 2. Schema báo cáo ----------------------------------------------------------------
-- Bảng mart do dbt dựng (mot-cua/kho-du-lieu/dbt/models/marts/), nạp lại toàn bộ mỗi lần chạy.
-- Không phơi ra PostgREST (PGRST_DB_SCHEMAS chỉ có mot_cua); Superset đọc bằng role chỉ đọc riêng.
CREATE SCHEMA bao_cao;
COMMENT ON SCHEMA bao_cao IS 'Bảng mart của kho dữ liệu (#80), khử định danh, nạp bằng RPC mot_cua.nap_bao_cao. Không có dữ liệu cá nhân';

CREATE TABLE bao_cao.fct_ho_so (
  ho_so_id          uuid PRIMARY KEY,
  ma_ho_so          text NOT NULL,
  thu_tuc           text NOT NULL,
  ten_thu_tuc       text NOT NULL,
  linh_vuc          text NOT NULL,
  ten_linh_vuc      text NOT NULL,
  ket_qua           text NOT NULL CHECK (ket_qua IN ('hoan_tat', 'tu_choi')),
  thang             date NOT NULL,
  ngay_nhan         timestamp NOT NULL,
  ngay_hoan_tat     timestamp NOT NULL,
  han_xu_ly         date,
  so_ngay_quy_dinh  integer,
  so_gio_giai_quyet numeric NOT NULL,
  so_ngay_lam_viec  integer NOT NULL,
  so_lan_bo_sung    integer NOT NULL,
  tre_han           boolean NOT NULL
);
COMMENT ON TABLE bao_cao.fct_ho_so IS 'Một dòng mỗi hồ sơ đã đóng (dbt fct_ho_so). Giờ Việt Nam, không múi giờ';
COMMENT ON COLUMN bao_cao.fct_ho_so.thang IS 'Ngày đầu tháng hoàn tất/từ chối (giờ Việt Nam)';
COMMENT ON COLUMN bao_cao.fct_ho_so.so_ngay_lam_viec IS 'Số ngày làm việc từ sau ngày nhận tới ngày đóng (bỏ thứ Bảy, Chủ nhật, ngày nghỉ)';
COMMENT ON COLUMN bao_cao.fct_ho_so.tre_han IS 'Đóng sau 17:00 ngày hạn xử lý';

CREATE TABLE bao_cao.hieu_suat_thang (
  thang              date NOT NULL,
  linh_vuc           text NOT NULL,
  ten_linh_vuc       text NOT NULL,
  thu_tuc            text NOT NULL,
  ten_thu_tuc        text NOT NULL,
  so_ho_so           integer NOT NULL,
  so_hoan_tat        integer NOT NULL,
  so_tu_choi         integer NOT NULL,
  so_tre_han         integer NOT NULL,
  ty_le_tre_han      numeric NOT NULL CHECK (ty_le_tre_han BETWEEN 0 AND 1),
  tb_ngay_lam_viec   numeric NOT NULL,
  tb_gio_giai_quyet  numeric NOT NULL,
  PRIMARY KEY (thang, thu_tuc)
);
COMMENT ON TABLE bao_cao.hieu_suat_thang IS 'Thời gian giải quyết, tỷ lệ trễ hạn theo tháng × thủ tục (dbt hieu_suat_thang)';

CREATE TABLE bao_cao.lan_nap (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  luc        timestamptz NOT NULL DEFAULT now(),
  so_dong    jsonb NOT NULL,
  dbt_run_id text
);
COMMENT ON TABLE bao_cao.lan_nap IS 'Mỗi lần kho-du-lieu nạp mart: số dòng từng bảng, invocation_id của dbt (đối chiếu lineage)';

-- 3. RPC nạp mart -------------------------------------------------------------------
-- POST /rpc/nap_bao_cao {"p_du_lieu": {"fct_ho_so": [...], "hieu_suat_thang": [...]}, "p_dbt_run_id": "…"}
-- (chỉ dich_vu_bao_cao). Thay toàn bộ nội dung các bảng trong MỘT transaction: Superset không bao
-- giờ thấy nửa cũ nửa mới. Bảng không có trong danh sách → lỗi, không nạp gì.
CREATE FUNCTION mot_cua.nap_bao_cao(p_du_lieu jsonb, p_dbt_run_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_bang text;
  v_so   jsonb := '{}'::jsonb;
  v_n    integer;
BEGIN
  IF jsonb_typeof(p_du_lieu) <> 'object' THEN
    RAISE EXCEPTION 'p_du_lieu phải là object' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  FOR v_bang IN SELECT jsonb_object_keys(p_du_lieu) LOOP
    IF v_bang NOT IN ('fct_ho_so', 'hieu_suat_thang') THEN
      RAISE EXCEPTION 'Không nạp được bảng "%"', v_bang USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF jsonb_typeof(p_du_lieu -> v_bang) <> 'array' THEN
      RAISE EXCEPTION 'Dữ liệu bảng % phải là mảng', v_bang USING ERRCODE = 'invalid_parameter_value';
    END IF;
    EXECUTE format('DELETE FROM bao_cao.%I', v_bang);
    EXECUTE format('INSERT INTO bao_cao.%1$I SELECT * FROM jsonb_populate_recordset(NULL::bao_cao.%1$I, $1)', v_bang)
      USING p_du_lieu -> v_bang;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_so := v_so || jsonb_build_object(v_bang, v_n);
  END LOOP;
  INSERT INTO bao_cao.lan_nap (so_dong, dbt_run_id) VALUES (v_so, p_dbt_run_id);
  RETURN v_so;
END
$$;
COMMENT ON FUNCTION mot_cua.nap_bao_cao(jsonb, text) IS 'Thay nội dung bảng mart trong schema bao_cao trong một transaction (chỉ dich_vu_bao_cao, #80)';
REVOKE ALL ON FUNCTION mot_cua.nap_bao_cao(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mot_cua.nap_bao_cao(jsonb, text) TO dich_vu_bao_cao;
REVOKE ALL ON ALL TABLES IN SCHEMA bao_cao FROM PUBLIC;

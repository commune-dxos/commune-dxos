-- SPDX-License-Identifier: Apache-2.0
-- Ứng dụng mot-cua – sự kiện hồ sơ qua RabbitMQ (#9).
-- core/scripts/app-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- Luồng (apps/mot-cua/README.md, docs/architecture.md §4.5):
--   app-backend gọi Flowable thành công → ghi sự kiện vào hop_thu_su_kien (outbox)
--   app-worker quét hồ sơ sắp trễ hạn → ghi sự kiện vào hop_thu_su_kien (chống trùng bằng khóa)
--   app-worker phát các dòng chưa phát lên RabbitMQ (chờ RECEIPT) → đánh dấu da_phat_luc
--   consumer mẫu nhận từ queue mot_cua.nhat_ky → ghi nhat_ky_su_kien (chống trùng bằng id)
-- Mọi ghi/đọc đều bằng tài khoản dịch vụ `dich_vu_su_kien` (client Keycloak mot_cua_su_kien).
-- Sự kiện không chứa dữ liệu cá nhân của công dân: chỉ mã định danh nội bộ của hồ sơ.

-- 1. Role dịch vụ ----------------------------------------------------------------
-- Trùng tên client role `dich_vu_su_kien` của dxos_api (apps/mot-cua/keycloak/realm.json),
-- chỉ gán cho service account của client mot_cua_su_kien, không gán cho người.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dich_vu_su_kien') THEN
    CREATE ROLE dich_vu_su_kien NOLOGIN;
  END IF;
END
$$;
GRANT dich_vu_su_kien TO authenticator;

-- 2. Hộp thư đi (transactional outbox) ------------------------------------------------
-- Một dòng = một sự kiện đã xảy ra, chờ hoặc đã phát lên RabbitMQ. noi_dung là đúng JSON phát
-- đi (phiên bản 1, xem README). Phát lại (at-least-once) không sinh sự kiện mới: id giữ nguyên.
CREATE TABLE mot_cua.hop_thu_su_kien (
  id               uuid PRIMARY KEY,
  loai             text NOT NULL CHECK (loai IN ('ho_so.moi', 'ho_so.chuyen_buoc', 'ho_so.hoan_tat',
                                                 'ho_so.tu_choi', 'ho_so.sap_tre_han')),
  ho_so_id         uuid NOT NULL REFERENCES mot_cua.ho_so (id),
  -- Sự kiện chỉ được có một lần (ví dụ sắp trễ hạn của một hồ sơ với một hạn xử lý): ghi trùng
  -- khóa bị bỏ qua (ON CONFLICT DO NOTHING). NULL = không giới hạn.
  khoa_chong_trung text UNIQUE,
  noi_dung         jsonb NOT NULL,
  tao_luc          timestamptz NOT NULL DEFAULT now(),
  da_phat_luc      timestamptz,
  so_lan_thu       integer NOT NULL DEFAULT 0,
  loi_cuoi         text,
  CHECK (noi_dung ->> 'id' = id::text AND noi_dung ->> 'loai' = loai
         AND noi_dung ->> 'hoSoId' = ho_so_id::text AND (noi_dung -> 'phienBan') IS NOT NULL)
);
CREATE INDEX hop_thu_su_kien_chua_phat ON mot_cua.hop_thu_su_kien (tao_luc) WHERE da_phat_luc IS NULL;
CREATE INDEX ON mot_cua.hop_thu_su_kien (ho_so_id);
COMMENT ON TABLE mot_cua.hop_thu_su_kien IS 'Outbox sự kiện hồ sơ: app-backend/app-worker ghi, app-worker phát lên RabbitMQ (#9)';
COMMENT ON COLUMN mot_cua.hop_thu_su_kien.khoa_chong_trung IS 'Khóa duy nhất của sự kiện chỉ phát một lần, ví dụ ho_so.sap_tre_han:<ho_so_id>:<han_xu_ly>';
COMMENT ON COLUMN mot_cua.hop_thu_su_kien.da_phat_luc IS 'Lúc RabbitMQ xác nhận đã nhận (RECEIPT); NULL = chưa phát';

-- 3. Nhật ký sự kiện (consumer mẫu, chỉ thêm) --------------------------------------------
-- Ghi lại mỗi sự kiện nhận được từ queue mot_cua.nhat_ky đúng một lần (khóa = id sự kiện):
-- bằng chứng sự kiện đã đi qua RabbitMQ, nền cho thông báo (tuần 3) và dashboard ([D]).
CREATE TABLE mot_cua.nhat_ky_su_kien (
  su_kien_id  uuid PRIMARY KEY,
  loai        text NOT NULL,
  ho_so_id    uuid NOT NULL,
  ma_ho_so    text NOT NULL,
  linh_vuc    text,
  xay_ra_luc  timestamptz NOT NULL,
  nhan_luc    timestamptz NOT NULL DEFAULT now(),
  noi_dung    jsonb NOT NULL
);
CREATE INDEX ON mot_cua.nhat_ky_su_kien (ho_so_id);
CREATE INDEX ON mot_cua.nhat_ky_su_kien (loai, xay_ra_luc);
COMMENT ON TABLE mot_cua.nhat_ky_su_kien IS 'Sự kiện hồ sơ consumer mẫu đã nhận từ RabbitMQ (queue mot_cua.nhat_ky). Chỉ thêm';

CREATE FUNCTION mot_cua_noi_bo.chan_sua_nhat_ky_su_kien() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Nhật ký sự kiện chỉ được thêm, không sửa hay xóa' USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER chan_sua_nhat_ky BEFORE UPDATE OR DELETE ON mot_cua.nhat_ky_su_kien
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.chan_sua_nhat_ky_su_kien();
CREATE TRIGGER chan_xoa_het_nhat_ky BEFORE TRUNCATE ON mot_cua.nhat_ky_su_kien
  FOR EACH STATEMENT EXECUTE FUNCTION mot_cua_noi_bo.chan_sua_nhat_ky_su_kien();

-- 4. Quyền ---------------------------------------------------------------------------
-- Dịch vụ sự kiện chỉ đọc các cột hồ sơ không phải dữ liệu cá nhân (không có họ tên, số
-- điện thoại, sub người nộp), danh mục để lấy mã lĩnh vực/thủ tục, ngày nghỉ để tính ngày
-- làm việc.
GRANT USAGE ON SCHEMA mot_cua TO dich_vu_su_kien;
GRANT SELECT (id, ma_ho_so, thu_tuc_id, trang_thai, han_xu_ly) ON mot_cua.ho_so TO dich_vu_su_kien;
GRANT SELECT (id, ma, linh_vuc_id) ON mot_cua.thu_tuc TO dich_vu_su_kien;
GRANT SELECT (id, ma) ON mot_cua.linh_vuc TO dich_vu_su_kien;
GRANT SELECT (ngay) ON mot_cua.ngay_nghi TO dich_vu_su_kien;
GRANT SELECT, INSERT (id, loai, ho_so_id, khoa_chong_trung, noi_dung) ON mot_cua.hop_thu_su_kien TO dich_vu_su_kien;
GRANT UPDATE (da_phat_luc, so_lan_thu, loi_cuoi) ON mot_cua.hop_thu_su_kien TO dich_vu_su_kien;
GRANT SELECT, INSERT (su_kien_id, loai, ho_so_id, ma_ho_so, linh_vuc, xay_ra_luc, noi_dung)
  ON mot_cua.nhat_ky_su_kien TO dich_vu_su_kien;
-- Lãnh đạo xem nhật ký sự kiện (dashboard, kiểm tra).
GRANT SELECT ON mot_cua.nhat_ky_su_kien TO lanh_dao;

-- 5. RLS ----------------------------------------------------------------------------
ALTER TABLE mot_cua.hop_thu_su_kien ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.hop_thu_su_kien FORCE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.nhat_ky_su_kien ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.nhat_ky_su_kien FORCE ROW LEVEL SECURITY;

CREATE POLICY dich_vu_su_kien_doc_ho_so ON mot_cua.ho_so
  FOR SELECT TO dich_vu_su_kien USING (true);
CREATE POLICY dich_vu_su_kien_doc_thu_tuc ON mot_cua.thu_tuc
  FOR SELECT TO dich_vu_su_kien USING (true);
CREATE POLICY dich_vu_su_kien_doc_linh_vuc ON mot_cua.linh_vuc
  FOR SELECT TO dich_vu_su_kien USING (true);
CREATE POLICY dich_vu_su_kien_doc_ngay_nghi ON mot_cua.ngay_nghi
  FOR SELECT TO dich_vu_su_kien USING (true);
CREATE POLICY dich_vu_su_kien_hop_thu ON mot_cua.hop_thu_su_kien
  FOR ALL TO dich_vu_su_kien USING (true) WITH CHECK (true);
-- Đã phát thì không "bỏ phát" được (da_phat_luc chỉ đi từ NULL sang có giá trị).
CREATE POLICY dich_vu_su_kien_khong_bo_phat ON mot_cua.hop_thu_su_kien
  AS RESTRICTIVE FOR UPDATE TO dich_vu_su_kien USING (da_phat_luc IS NULL) WITH CHECK (true);
CREATE POLICY dich_vu_su_kien_ghi_nhat_ky ON mot_cua.nhat_ky_su_kien
  FOR ALL TO dich_vu_su_kien USING (true) WITH CHECK (true);
CREATE POLICY lanh_dao_xem_nhat_ky_su_kien ON mot_cua.nhat_ky_su_kien
  FOR SELECT TO lanh_dao USING (true);

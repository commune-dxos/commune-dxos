-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Bộ máy một cửa – trợ lý thủ tục hành chính (RAG, #91).
-- nen-tang/scripts/tang2-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- Luồng (mot-cua/backend/nap_tri_thuc.py, tro_ly.py; docs/architecture.md §4.11):
--   nap-tri-thuc chia kho tri thức (mot-cua/tro-ly/kho-tri-thuc/*.md + gói thu-tuc/*/) thành đoạn, ghi
--   chữ vào Meilisearch (tìm từ khóa) và chữ + vector nhúng vào bảng tri_thuc_doan (tìm ngữ nghĩa bằng
--   pgvector). Dịch vụ tro-ly tìm lai hai nguồn rồi đưa các đoạn khớp nhất cho mô hình ngôn ngữ.
-- Kho tri thức là văn bản công khai (thủ tục hành chính, văn bản pháp luật), không có dữ liệu cá nhân.
-- Chỉ tài khoản dịch vụ `dich_vu_tro_ly` (client Keycloak mot_cua_tro_ly) đọc/ghi; người dân hỏi qua
-- dịch vụ tro-ly, không đọc bảng này qua /api hay /public.

-- pgvector (PostgreSQL License) biên dịch sẵn trong image PostgreSQL của nền tảng (nen-tang/postgres/).
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Role dịch vụ ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dich_vu_tro_ly') THEN
    CREATE ROLE dich_vu_tro_ly NOLOGIN;
  END IF;
END
$$;
GRANT dich_vu_tro_ly TO authenticator;
GRANT USAGE ON SCHEMA mot_cua TO dich_vu_tro_ly;

-- 2. Đoạn tri thức ----------------------------------------------------------------
-- Một dòng = một đoạn (mục ## của tệp Markdown hoặc một phần của gói thủ tục). id ổn định theo nguồn và
-- thứ tự đoạn (ví dụ KS01-0), cùng id với tài liệu trong Meilisearch. Vector 1024 chiều = bge-m3; đổi
-- mô hình nhúng thì nap-tri-thuc nhúng lại (mo_hinh khác), tìm ngữ nghĩa chỉ so vector cùng mô hình.
CREATE TABLE mot_cua.tri_thuc_doan (
  id            text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  nguon         text NOT NULL,
  ma_thu_tuc    text,
  tieu_de       text NOT NULL CHECK (length(tieu_de) BETWEEN 1 AND 300),
  noi_dung      text NOT NULL CHECK (length(noi_dung) BETWEEN 1 AND 4000),
  lien_ket      text,
  sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mo_hinh       text,
  nhung         vector(1024),
  cap_nhat_luc  timestamptz NOT NULL DEFAULT now(),
  CHECK ((mo_hinh IS NULL) = (nhung IS NULL))
);
COMMENT ON TABLE mot_cua.tri_thuc_doan IS
  'Đoạn kho tri thức thủ tục hành chính công khai cho trợ lý RAG (#91): chữ + vector nhúng (pgvector). Không có dữ liệu cá nhân';
COMMENT ON COLUMN mot_cua.tri_thuc_doan.sha256 IS 'SHA-256 của tiêu đề + nội dung: không đổi thì nap-tri-thuc không nhúng lại';
COMMENT ON COLUMN mot_cua.tri_thuc_doan.mo_hinh IS 'Mô hình nhúng đã sinh vector (ví dụ ollama/bge-m3); NULL = chưa nhúng';

-- Không tạo chỉ mục HNSW: kho tri thức cấp xã chỉ vài trăm đến vài nghìn đoạn, quét tuần tự cho kết quả chính
-- xác và đủ nhanh. Chỉ mục xấp xỉ lấy trước một số ứng viên rồi mới lọc theo mô hình/mã thủ tục nên có thể trả
-- thiếu đoạn. Khi kho lên hàng chục nghìn đoạn: CREATE INDEX … USING hnsw (nhung vector_cosine_ops) kèm
-- SET hnsw.iterative_scan = relaxed_order trong tim_doan_gan.

ALTER TABLE mot_cua.tri_thuc_doan ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.tri_thuc_doan FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON mot_cua.tri_thuc_doan TO dich_vu_tro_ly;
CREATE POLICY dich_vu_tro_ly_tat_ca ON mot_cua.tri_thuc_doan
  FOR ALL TO dich_vu_tro_ly USING (true) WITH CHECK (true);

-- 3. Tìm ngữ nghĩa -----------------------------------------------------------------
-- p_vec: vector dạng chữ '[0.1,…]' (PostgREST truyền tham số RPC dạng JSON). Chỉ so với đoạn nhúng bằng cùng
-- mô hình p_mo_hinh; trả gần nhất trước, kèm độ tương đồng cosin (1 = trùng hướng). p_ma_thu_tuc: chỉ đoạn của
-- thủ tục đó.
CREATE FUNCTION mot_cua.tim_doan_gan(p_vec text, p_mo_hinh text, p_so_luong integer DEFAULT 8, p_ma_thu_tuc text DEFAULT NULL)
RETURNS TABLE (id text, nguon text, ma_thu_tuc text, tieu_de text, noi_dung text, lien_ket text, tuong_dong double precision)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = mot_cua, public
AS $$
  SELECT d.id, d.nguon, d.ma_thu_tuc, d.tieu_de, d.noi_dung, d.lien_ket,
         1 - (d.nhung <=> p_vec::vector) AS tuong_dong
    FROM mot_cua.tri_thuc_doan d
   WHERE d.mo_hinh = p_mo_hinh
     AND (p_ma_thu_tuc IS NULL OR d.ma_thu_tuc = p_ma_thu_tuc)
   ORDER BY d.nhung <=> p_vec::vector
   LIMIT least(greatest(p_so_luong, 1), 20)
$$;
REVOKE ALL ON FUNCTION mot_cua.tim_doan_gan(text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mot_cua.tim_doan_gan(text, text, integer, text) TO dich_vu_tro_ly;

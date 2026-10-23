-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Bộ máy một cửa – nhật ký kiểm toán append-only, chuỗi băm SHA-256, xác minh toàn vẹn (#75).
-- nen-tang/scripts/tang2-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- Mỗi thao tác nghiệp vụ quan trọng (nộp hồ sơ, chuyển trạng thái, cập nhật hồ sơ, xử lý bước
-- quy trình, tải/kiểm tra tệp, nạp/rút gói thủ tục, phân công lĩnh vực cán bộ) ghi đúng một bản
-- ghi vào mot_cua.nhat_ky_kiem_toan, bằng trigger hoặc trong RPC, CÙNG transaction với thao tác:
-- thao tác rollback thì bản ghi kiểm toán cũng không có, và ngược lại.
--
-- Chuỗi băm: bản ghi số stt lưu bam_truoc = bam của bản ghi stt - 1 (bản ghi 1: 64 chữ số 0) và
--   bam = hex(SHA-256(bam_truoc || noi_dung))
-- với noi_dung = văn bản jsonb của {stt, luc (UTC, micro giây), hanhDong, doiTuong, doiTuongId,
-- nguoiSub, vaiTro, nguon, duLieu} (mot_cua_noi_bo.noi_dung_kiem_toan). Sửa một bản ghi thì bam
-- của nó sai; tính lại bam thì bam_truoc của bản ghi sau sai; xóa thì hở stt hoặc lệch đầu chuỗi.
-- SHA-256 dùng hàm sha256(bytea) có sẵn của PostgreSQL (từ bản 11), không cần pgcrypto.
--
-- Ghi đồng thời: mot_cua.dau_chuoi_kiem_toan có đúng một dòng (stt, bam cuối). Người ghi khóa
-- dòng đó (FOR UPDATE) tới hết transaction, nên các transaction ghi kiểm toán nối vào chuỗi lần
-- lượt theo thứ tự commit: stt liền, không trùng, không đứt. Đổi lại, hai transaction cùng ghi
-- kiểm toán thì cái sau chờ cái trước commit (request PostgREST ngắn, chấp nhận được ở quy mô xã).
--
-- Ai cũng không sửa, xóa được (trigger chặn cả superuser, trừ khi superuser tắt trigger: chỉ
-- phát hiện được, không ngăn được, nên xác minh nhận mốc stt/bam đã lưu ở ngoài). Không role API
-- nào ghi trực tiếp; lãnh đạo đọc và gọi xác minh qua APISIX /api.

-- 1. Bảng ----------------------------------------------------------------------------
CREATE TABLE mot_cua.nhat_ky_kiem_toan (
  stt          bigint PRIMARY KEY CHECK (stt > 0),
  luc          timestamptz NOT NULL,
  hanh_dong    text NOT NULL CHECK (hanh_dong ~ '^[a-z_]+\.[a-z_]+$'),
  doi_tuong    text NOT NULL CHECK (doi_tuong ~ '^[a-z_]+$'),
  doi_tuong_id text,
  nguoi_sub    text,
  vai_tro      text NOT NULL,
  nguon        text NOT NULL CHECK (nguon IN ('nop', 'api', 'quy_trinh', 'doi_soat', 'he_thong')),
  du_lieu      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(du_lieu) = 'object'),
  bam_truoc    text NOT NULL CHECK (bam_truoc ~ '^[0-9a-f]{64}$'),
  bam          text NOT NULL UNIQUE CHECK (bam ~ '^[0-9a-f]{64}$')
);
CREATE INDEX ON mot_cua.nhat_ky_kiem_toan (doi_tuong, doi_tuong_id);
CREATE INDEX ON mot_cua.nhat_ky_kiem_toan (hanh_dong, luc);
COMMENT ON TABLE mot_cua.nhat_ky_kiem_toan IS
  'Nhật ký kiểm toán chỉ thêm, chuỗi băm SHA-256 (#75). Ghi bằng trigger/RPC cùng transaction với thao tác; xác minh: RPC xac_minh_kiem_toan';
COMMENT ON COLUMN mot_cua.nhat_ky_kiem_toan.stt IS 'Số thứ tự trong chuỗi, liền từ 1';
COMMENT ON COLUMN mot_cua.nhat_ky_kiem_toan.hanh_dong IS
  'ho_so.nop · ho_so.chuyen_trang_thai · ho_so.cap_nhat · ho_so.xoa · quy_trinh.xu_ly_buoc · quy_trinh.dong_bo · tep.tai_len · tep.kiem_tra · thu_tuc.them · thu_tuc.nap_goi · thu_tuc.rut_goi · can_bo.them_linh_vuc · can_bo.bo_linh_vuc · kiem_toan.khoi_tao';
COMMENT ON COLUMN mot_cua.nhat_ky_kiem_toan.nguoi_sub IS 'sub Keycloak của người thực hiện (công dân, cán bộ; tài khoản dịch vụ khi không có người); NULL = SQL quản trị';
COMMENT ON COLUMN mot_cua.nhat_ky_kiem_toan.vai_tro IS 'Role PostgreSQL của request (PostgREST SET ROLE), hoặc người dùng phiên SQL';
COMMENT ON COLUMN mot_cua.nhat_ky_kiem_toan.du_lieu IS 'Chi tiết thao tác. KHÔNG chứa họ tên, số điện thoại, tên tệp: chỉ mã, trạng thái, tên cột đã đổi, SHA-256 tệp';
COMMENT ON COLUMN mot_cua.nhat_ky_kiem_toan.bam IS 'hex(SHA-256(bam_truoc || noi_dung_kiem_toan(bản ghi)))';

CREATE TABLE mot_cua.dau_chuoi_kiem_toan (
  khoa boolean PRIMARY KEY DEFAULT true CHECK (khoa),
  stt  bigint NOT NULL CHECK (stt >= 0),
  bam  text NOT NULL CHECK (bam ~ '^[0-9a-f]{64}$')
);
COMMENT ON TABLE mot_cua.dau_chuoi_kiem_toan IS
  'Đầu chuỗi kiểm toán (một dòng): stt và bam của bản ghi cuối. Khóa dòng này = khóa tuần tự khi ghi; phát hiện xóa bản ghi cuối';
INSERT INTO mot_cua.dau_chuoi_kiem_toan (stt, bam) VALUES (0, repeat('0', 64));

-- 2. Chặn sửa, xóa -------------------------------------------------------------------------
CREATE FUNCTION mot_cua_noi_bo.chan_sua_kiem_toan() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Nhật ký kiểm toán chỉ được thêm, không sửa hay xóa' USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER chan_sua_kiem_toan BEFORE UPDATE OR DELETE ON mot_cua.nhat_ky_kiem_toan
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.chan_sua_kiem_toan();
CREATE TRIGGER chan_xoa_het_kiem_toan BEFORE TRUNCATE ON mot_cua.nhat_ky_kiem_toan
  FOR EACH STATEMENT EXECUTE FUNCTION mot_cua_noi_bo.chan_sua_kiem_toan();
CREATE TRIGGER chan_xoa_dau_chuoi BEFORE DELETE ON mot_cua.dau_chuoi_kiem_toan
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.chan_sua_kiem_toan();
CREATE TRIGGER chan_xoa_het_dau_chuoi BEFORE TRUNCATE ON mot_cua.dau_chuoi_kiem_toan
  FOR EACH STATEMENT EXECUTE FUNCTION mot_cua_noi_bo.chan_sua_kiem_toan();

-- Đầu chuỗi chỉ tiến đúng một bước, tới bản ghi vừa thêm.
CREATE FUNCTION mot_cua_noi_bo.dau_chuoi_chi_tien() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stt <> OLD.stt + 1 OR NOT EXISTS (
       SELECT 1 FROM mot_cua.nhat_ky_kiem_toan k WHERE k.stt = NEW.stt AND k.bam = NEW.bam AND k.bam_truoc = OLD.bam) THEN
    RAISE EXCEPTION 'Đầu chuỗi kiểm toán chỉ tiến tới bản ghi vừa thêm' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER dau_chuoi_chi_tien BEFORE UPDATE ON mot_cua.dau_chuoi_kiem_toan
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.dau_chuoi_chi_tien();

-- 3. Nội dung chuẩn và ghi -------------------------------------------------------------------
-- Văn bản jsonb ổn định: khóa sắp theo độ dài rồi theo byte, phân cách ", " và ": ", không phụ
-- thuộc múi giờ hay cấu hình phiên. Trình xác minh độc lập mot-cua/backend/kiem_toan.py dựng lại
-- đúng chuỗi này từ bản ghi đọc qua API.
CREATE FUNCTION mot_cua_noi_bo.noi_dung_kiem_toan(k mot_cua.nhat_ky_kiem_toan) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'stt', k.stt,
    'luc', to_char(k.luc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'hanhDong', k.hanh_dong, 'doiTuong', k.doi_tuong, 'doiTuongId', k.doi_tuong_id,
    'nguoiSub', k.nguoi_sub, 'vaiTro', k.vai_tro, 'nguon', k.nguon, 'duLieu', k.du_lieu)::text
$$;

CREATE FUNCTION mot_cua_noi_bo.bam_kiem_toan(k mot_cua.nhat_ky_kiem_toan) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT encode(pg_catalog.sha256(convert_to(k.bam_truoc || mot_cua_noi_bo.noi_dung_kiem_toan(k), 'UTF8')), 'hex')
$$;

-- Role của request: PostgREST SET LOCAL ROLE theo JWT; phiên SQL thường thì người dùng phiên.
CREATE FUNCTION mot_cua_noi_bo.vai_tro_request() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('role', true), 'none'), session_user::text)
$$;

-- Ghi một bản ghi kiểm toán, nối vào cuối chuỗi. Chỉ trigger và RPC của bộ máy gọi (chạy với quyền
-- chủ hàm); không cấp cho role nào. p_nguon NULL: role API → api, còn lại → he_thong.
CREATE FUNCTION mot_cua_noi_bo.ghi_kiem_toan(
  p_hanh_dong    text,
  p_doi_tuong    text,
  p_doi_tuong_id text,
  p_du_lieu      jsonb DEFAULT '{}'::jsonb,
  p_nguoi_sub    text DEFAULT NULL,
  p_nguon        text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_dau mot_cua.dau_chuoi_kiem_toan%ROWTYPE;
  v_k   mot_cua.nhat_ky_kiem_toan%ROWTYPE;
BEGIN
  -- Khóa tuần tự: giữ tới hết transaction. Ở READ COMMITTED, chờ xong thì đọc được đầu chuỗi
  -- mới nhất; ở REPEATABLE READ trở lên thì báo lỗi tuần tự hóa thay vì làm đứt chuỗi.
  SELECT * INTO STRICT v_dau FROM mot_cua.dau_chuoi_kiem_toan WHERE khoa FOR UPDATE;
  v_k.stt          := v_dau.stt + 1;
  v_k.luc          := clock_timestamp();  -- sau khi có khóa: luc tăng theo stt
  v_k.hanh_dong    := p_hanh_dong;
  v_k.doi_tuong    := p_doi_tuong;
  v_k.doi_tuong_id := p_doi_tuong_id;
  v_k.nguoi_sub    := coalesce(p_nguoi_sub, dxos.jwt_sub());
  v_k.vai_tro      := mot_cua_noi_bo.vai_tro_request();
  v_k.nguon        := coalesce(p_nguon, CASE WHEN mot_cua_noi_bo.la_role_api(v_k.vai_tro::name) THEN 'api' ELSE 'he_thong' END);
  v_k.du_lieu      := jsonb_strip_nulls(coalesce(p_du_lieu, '{}'::jsonb));
  v_k.bam_truoc    := v_dau.bam;
  v_k.bam          := mot_cua_noi_bo.bam_kiem_toan(v_k);
  INSERT INTO mot_cua.nhat_ky_kiem_toan VALUES (v_k.*);
  UPDATE mot_cua.dau_chuoi_kiem_toan SET stt = v_k.stt, bam = v_k.bam WHERE khoa;
  RETURN v_k.stt;
END
$$;
REVOKE ALL ON FUNCTION mot_cua_noi_bo.ghi_kiem_toan(text, text, text, jsonb, text, text) FROM PUBLIC;

-- 4. Xác minh toàn vẹn -------------------------------------------------------------------
-- GET/POST /api/rpc/xac_minh_kiem_toan (lãnh đạo). Duyệt cả chuỗi theo stt, dừng ở chỗ hỏng đầu
-- tiên. → {"hopLe", "soBanGhi" (đã duyệt), "sttCuoi", "bamCuoi", "dauChuoi": {stt, bam},
--          "loi": null | {"stt", "loai", "moTa"}}. Loại lỗi:
--   thieu_ban_ghi       stt bị hở: bản ghi "stt" không còn (bị xóa)
--   lien_ket_dut        bam_truoc của bản ghi "stt" khác bam của bản ghi trước (bản ghi trước bị
--                       sửa rồi tính lại bam, hoặc bản ghi này bị thay)
--   noi_dung_bi_sua     bam tính lại của bản ghi "stt" khác bam đã lưu
--   dau_chuoi_lech      đầu chuỗi khác bản ghi cuối (bản ghi cuối bị xóa, hoặc thêm ngoài chuỗi)
--   moc_khong_khop      bản ghi "stt" khác mốc p_stt_moc/p_bam_moc lưu ở ngoài (chuỗi bị viết lại)
CREATE FUNCTION mot_cua.xac_minh_kiem_toan(p_stt_moc bigint DEFAULT NULL, p_bam_moc text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_k     mot_cua.nhat_ky_kiem_toan%ROWTYPE;
  v_dau   mot_cua.dau_chuoi_kiem_toan%ROWTYPE;
  v_truoc text := repeat('0', 64);
  v_stt   bigint := 0;
  v_loi   jsonb;
  v_moc   boolean := p_stt_moc IS NULL;
BEGIN
  IF (p_stt_moc IS NULL) <> (p_bam_moc IS NULL) THEN
    RAISE EXCEPTION 'Mốc cần đủ p_stt_moc và p_bam_moc' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT * INTO v_dau FROM mot_cua.dau_chuoi_kiem_toan WHERE khoa;
  FOR v_k IN SELECT * FROM mot_cua.nhat_ky_kiem_toan ORDER BY stt LOOP
    IF v_k.stt <> v_stt + 1 THEN
      v_loi := jsonb_build_object('stt', v_stt + 1, 'loai', 'thieu_ban_ghi',
                                  'moTa', format('Không còn bản ghi %s (bản ghi kế tiếp là %s)', v_stt + 1, v_k.stt));
    ELSIF v_k.bam_truoc <> v_truoc THEN
      v_loi := jsonb_build_object('stt', v_k.stt, 'loai', 'lien_ket_dut',
                                  'moTa', format('bam_truoc của bản ghi %s khác bam của bản ghi %s', v_k.stt, v_stt));
    ELSIF mot_cua_noi_bo.bam_kiem_toan(v_k) <> v_k.bam THEN
      v_loi := jsonb_build_object('stt', v_k.stt, 'loai', 'noi_dung_bi_sua',
                                  'moTa', format('Nội dung bản ghi %s không khớp bam đã lưu', v_k.stt));
    ELSIF v_k.stt = p_stt_moc AND v_k.bam <> p_bam_moc THEN
      v_loi := jsonb_build_object('stt', v_k.stt, 'loai', 'moc_khong_khop',
                                  'moTa', format('Bản ghi %s khác mốc đã lưu', v_k.stt));
    END IF;
    EXIT WHEN v_loi IS NOT NULL;
    v_moc := v_moc OR v_k.stt = p_stt_moc;
    v_truoc := v_k.bam;
    v_stt := v_k.stt;
  END LOOP;
  IF v_loi IS NULL AND NOT v_moc THEN
    v_loi := jsonb_build_object('stt', p_stt_moc, 'loai', 'moc_khong_khop',
                                'moTa', format('Không có bản ghi %s của mốc đã lưu', p_stt_moc));
  ELSIF v_loi IS NULL AND (v_dau.stt <> v_stt OR v_dau.bam <> v_truoc) THEN
    v_loi := jsonb_build_object('stt', greatest(v_dau.stt, v_stt), 'loai', 'dau_chuoi_lech',
                                'moTa', format('Đầu chuỗi ở bản ghi %s nhưng chuỗi dừng ở bản ghi %s', v_dau.stt, v_stt));
  END IF;
  RETURN jsonb_build_object('hopLe', v_loi IS NULL, 'soBanGhi', v_stt, 'sttCuoi', v_stt, 'bamCuoi', v_truoc,
                            'dauChuoi', jsonb_build_object('stt', v_dau.stt, 'bam', v_dau.bam), 'loi', v_loi);
END
$$;
COMMENT ON FUNCTION mot_cua.xac_minh_kiem_toan(bigint, text) IS
  'Xác minh chuỗi băm của nhật ký kiểm toán: hợp lệ hay không, vị trí hỏng đầu tiên; tùy chọn so với mốc stt/bam lưu ở ngoài (#75, lãnh đạo)';

-- 5. Ghi kiểm toán theo thao tác ------------------------------------------------------------
-- Nộp hồ sơ, chuyển trạng thái: theo lịch sử trạng thái (006), đã có nguồn, bước, người thực hiện.
CREATE FUNCTION mot_cua_noi_bo.kiem_toan_lich_su() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ma text;
  v_tt text;
BEGIN
  SELECT h.ma_ho_so, t.ma INTO v_ma, v_tt
    FROM mot_cua.ho_so h JOIN mot_cua.thu_tuc t ON t.id = h.thu_tuc_id WHERE h.id = NEW.ho_so_id;
  PERFORM mot_cua_noi_bo.ghi_kiem_toan(
    CASE WHEN NEW.nguon = 'nop' THEN 'ho_so.nop' ELSE 'ho_so.chuyen_trang_thai' END,
    'ho_so', NEW.ho_so_id::text,
    jsonb_build_object('maHoSo', v_ma, 'thuTuc', v_tt, 'tuTrangThai', NEW.tu_trang_thai,
                       'denTrangThai', NEW.den_trang_thai, 'lyDo', NEW.ly_do, 'buoc', NEW.buoc),
    NEW.nguoi_sub, NEW.nguon);
  RETURN NULL;
END
$$;
CREATE TRIGGER kiem_toan AFTER INSERT ON mot_cua.lich_su_trang_thai
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.kiem_toan_lich_su();

-- Cập nhật hồ sơ ngoài trạng thái (thông tin người nộp, hạn, cán bộ xử lý, lý do) và xóa hồ sơ.
-- Chỉ ghi TÊN cột đã đổi, không ghi giá trị (dữ liệu cá nhân); riêng cán bộ xử lý ghi id mới.
CREATE FUNCTION mot_cua_noi_bo.kiem_toan_ho_so() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cot text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM mot_cua_noi_bo.ghi_kiem_toan('ho_so.xoa', 'ho_so', OLD.id::text,
      jsonb_build_object('maHoSo', OLD.ma_ho_so, 'trangThai', OLD.trang_thai));
    RETURN NULL;
  END IF;
  SELECT array_agg(m.key ORDER BY m.key) INTO v_cot
    FROM jsonb_each(to_jsonb(NEW)) m
   WHERE m.key IN ('ho_ten_nguoi_nop', 'so_dien_thoai', 'han_xu_ly', 'can_bo_xu_ly_id', 'ly_do')
     AND m.value IS DISTINCT FROM to_jsonb(OLD) -> m.key
     -- lý do đi cùng lần chuyển trạng thái đã nằm trong bản ghi ho_so.chuyen_trang_thai
     AND NOT (m.key = 'ly_do' AND NEW.trang_thai IS DISTINCT FROM OLD.trang_thai);
  IF v_cot IS NOT NULL THEN
    PERFORM mot_cua_noi_bo.ghi_kiem_toan('ho_so.cap_nhat', 'ho_so', NEW.id::text,
      jsonb_build_object('maHoSo', NEW.ma_ho_so, 'cot', v_cot,
                         'canBoXuLy', CASE WHEN 'can_bo_xu_ly_id' = ANY (v_cot) THEN NEW.can_bo_xu_ly_id END),
      nullif(current_setting('mot_cua.dong_bo_nguoi', true), ''), mot_cua_noi_bo.nguon_dong_bo());
  END IF;
  RETURN NULL;
END
$$;
CREATE TRIGGER kiem_toan_cap_nhat AFTER UPDATE ON mot_cua.ho_so
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.kiem_toan_ho_so();
CREATE TRIGGER kiem_toan_xoa AFTER DELETE ON mot_cua.ho_so
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.kiem_toan_ho_so();

-- Tệp hồ sơ: tải lên (SHA-256 nội dung tệp vào chuỗi: bằng chứng tệp không bị thay sau này) và
-- kết quả kiểm tra của cán bộ. Không ghi tên tệp (có thể chứa họ tên).
CREATE FUNCTION mot_cua_noi_bo.kiem_toan_tep() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ma text;
  v_tp text;
BEGIN
  SELECT h.ma_ho_so INTO v_ma FROM mot_cua.ho_so h WHERE h.id = NEW.ho_so_id;
  SELECT y.ma INTO v_tp FROM mot_cua.thanh_phan_yeu_cau y WHERE y.id = NEW.thanh_phan_yeu_cau_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM mot_cua_noi_bo.ghi_kiem_toan('tep.tai_len', 'ho_so', NEW.ho_so_id::text,
      jsonb_build_object('maHoSo', v_ma, 'tepId', NEW.id, 'thanhPhan', v_tp, 'loaiMime', NEW.loai_mime,
                         'kichThuoc', NEW.kich_thuoc, 'sha256', NEW.sha256, 'ketQuaQuet', NEW.ket_qua_quet),
      NEW.nguoi_tai_sub);
  ELSIF NEW.trang_thai_kiem_tra IS DISTINCT FROM OLD.trang_thai_kiem_tra THEN
    PERFORM mot_cua_noi_bo.ghi_kiem_toan('tep.kiem_tra', 'ho_so', NEW.ho_so_id::text,
      jsonb_build_object('maHoSo', v_ma, 'tepId', NEW.id, 'thanhPhan', v_tp,
                         'tuKetQua', OLD.trang_thai_kiem_tra, 'ketQua', NEW.trang_thai_kiem_tra));
  END IF;
  RETURN NULL;
END
$$;
CREATE TRIGGER kiem_toan AFTER INSERT OR UPDATE ON mot_cua.thanh_phan_ho_so
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.kiem_toan_tep();

-- Danh mục thủ tục: thêm, nạp gói mới/đổi (goi_sha256 đổi), rút gói. Nạp lại gói không đổi thì không ghi.
CREATE FUNCTION mot_cua_noi_bo.kiem_toan_thu_tuc() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.goi IS NOT DISTINCT FROM OLD.goi
     AND NEW.goi_sha256 IS NOT DISTINCT FROM OLD.goi_sha256 THEN
    RETURN NULL;
  END IF;
  PERFORM mot_cua_noi_bo.ghi_kiem_toan(
    CASE WHEN TG_OP = 'INSERT' THEN 'thu_tuc.them' WHEN NEW.goi IS NULL THEN 'thu_tuc.rut_goi' ELSE 'thu_tuc.nap_goi' END,
    'thu_tuc', NEW.ma,
    jsonb_build_object('goi', coalesce(NEW.goi, CASE WHEN TG_OP = 'UPDATE' THEN OLD.goi END),
                       'goiSha256', NEW.goi_sha256, 'quyTrinh', NEW.quy_trinh,
                       'goiSha256Truoc', CASE WHEN TG_OP = 'UPDATE' THEN OLD.goi_sha256 END));
  RETURN NULL;
END
$$;
CREATE TRIGGER kiem_toan AFTER INSERT OR UPDATE ON mot_cua.thu_tuc
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.kiem_toan_thu_tuc();

-- Phân công lĩnh vực cho cán bộ: quyết định cán bộ thấy hồ sơ nào (RLS) nên là thay đổi quyền.
CREATE FUNCTION mot_cua_noi_bo.kiem_toan_phan_cong() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_dong mot_cua.can_bo_linh_vuc%ROWTYPE := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
  PERFORM mot_cua_noi_bo.ghi_kiem_toan(
    CASE WHEN TG_OP = 'DELETE' THEN 'can_bo.bo_linh_vuc' ELSE 'can_bo.them_linh_vuc' END,
    'can_bo', v_dong.can_bo_id::text,
    jsonb_build_object('linhVucId', v_dong.linh_vuc_id,
                       'linhVuc', (SELECT l.ma FROM mot_cua.linh_vuc l WHERE l.id = v_dong.linh_vuc_id)));
  RETURN NULL;
END
$$;
CREATE TRIGGER kiem_toan AFTER INSERT OR DELETE ON mot_cua.can_bo_linh_vuc
  FOR EACH ROW EXECUTE FUNCTION mot_cua_noi_bo.kiem_toan_phan_cong();

REVOKE ALL ON FUNCTION mot_cua_noi_bo.kiem_toan_lich_su(), mot_cua_noi_bo.kiem_toan_ho_so(),
  mot_cua_noi_bo.kiem_toan_tep(), mot_cua_noi_bo.kiem_toan_thu_tuc(), mot_cua_noi_bo.kiem_toan_phan_cong()
  FROM PUBLIC;

-- 6. RPC đồng bộ trạng thái ghi kiểm toán bước quy trình ------------------------------------------
-- Như 006, thêm: lần gọi có thay đổi (đổi trạng thái hoặc có sự kiện mới) ghi một bản ghi
-- quy_trinh.xu_ly_buoc (có p_buoc: người xử lý vừa hoàn thành bước) hoặc quy_trinh.dong_bo, với
-- người xử lý p_nguoi_sub. Gọi lại không đổi gì (đối soát định kỳ, thử lại) thì không ghi.
CREATE OR REPLACE FUNCTION mot_cua.dong_bo_trang_thai(
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
  v_ds_sk  jsonb := '[]'::jsonb;
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
    IF v_n > 0 THEN
      v_ds_sk := v_ds_sk || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', v_ev.id, 'loai', v_ev.loai,
        'tuBuoc', v_ev.noi_dung -> 'duLieu' -> 'tuBuoc', 'denBuoc', v_ev.noi_dung -> 'duLieu' -> 'denBuoc',
        'vaiTroXuLy', v_ev.noi_dung -> 'duLieu' -> 'vaiTroXuLy', 'ketQua', v_ev.noi_dung -> 'duLieu' -> 'ketQua')));
    END IF;
  END LOOP;

  IF v_so > 0 OR v_sau IS DISTINCT FROM v_hs.trang_thai THEN
    PERFORM mot_cua_noi_bo.ghi_kiem_toan(
      CASE WHEN p_buoc IS NOT NULL THEN 'quy_trinh.xu_ly_buoc' ELSE 'quy_trinh.dong_bo' END,
      'ho_so', p_ho_so_id::text,
      jsonb_build_object('maHoSo', v_hs.ma_ho_so, 'buoc', p_buoc, 'trangThaiTruoc', v_hs.trang_thai,
                         'trangThai', v_sau, 'suKien', v_ds_sk),
      p_nguoi_sub, p_nguon);
  END IF;

  RETURN jsonb_build_object('trangThaiTruoc', v_hs.trang_thai, 'trangThai', v_sau,
                            'daDoi', v_sau IS DISTINCT FROM v_hs.trang_thai, 'soSuKien', v_so);
END
$$;
COMMENT ON FUNCTION mot_cua.dong_bo_trang_thai(uuid, text, text, text, text, text, jsonb) IS
  'Đổi trạng thái hồ sơ theo quy trình + ghi lịch sử + ghi sự kiện vào hộp thư đi + ghi kiểm toán trong một transaction (chỉ dich_vu_su_kien, #73, #75)';

-- 7. Bản ghi đầu tiên ----------------------------------------------------------------------
SELECT mot_cua_noi_bo.ghi_kiem_toan('kiem_toan.khoi_tao', 'kiem_toan', NULL,
  jsonb_build_object('phienBan', 1, 'thuatToan', 'sha256',
                     'soHoSo', (SELECT count(*) FROM mot_cua.ho_so),
                     'soThuTuc', (SELECT count(*) FROM mot_cua.thu_tuc)),
  NULL, 'he_thong');

-- 8. Quyền và RLS ------------------------------------------------------------------------
REVOKE ALL ON mot_cua.nhat_ky_kiem_toan, mot_cua.dau_chuoi_kiem_toan FROM PUBLIC;
GRANT SELECT ON mot_cua.nhat_ky_kiem_toan, mot_cua.dau_chuoi_kiem_toan TO lanh_dao;
REVOKE ALL ON FUNCTION mot_cua.xac_minh_kiem_toan(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mot_cua.xac_minh_kiem_toan(bigint, text) TO lanh_dao;

ALTER TABLE mot_cua.nhat_ky_kiem_toan ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.nhat_ky_kiem_toan FORCE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.dau_chuoi_kiem_toan ENABLE ROW LEVEL SECURITY;
ALTER TABLE mot_cua.dau_chuoi_kiem_toan FORCE ROW LEVEL SECURITY;
CREATE POLICY lanh_dao_xem_kiem_toan ON mot_cua.nhat_ky_kiem_toan FOR SELECT TO lanh_dao USING (true);
CREATE POLICY lanh_dao_xem_dau_chuoi ON mot_cua.dau_chuoi_kiem_toan FOR SELECT TO lanh_dao USING (true);

-- 9. pgAudit: theo dõi truy cập bảng có dữ liệu cá nhân -------------------------------------
-- Nền tảng nạp pgAudit với pgaudit.role = dxos_kiem_toan (nen-tang/postgres/): câu lệnh chạm vào
-- bảng mà role này có quyền tương ứng thì PostgreSQL ghi dòng "AUDIT: OBJECT,…" vào log (không
-- ghi tham số). Role không đăng nhập, không cấp cho ai: chỉ là danh sách bảng cần theo dõi.
-- PostgreSQL không có pgAudit (test-sql, CI) thì các GRANT này vô hại.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dxos_kiem_toan') THEN
    CREATE ROLE dxos_kiem_toan NOLOGIN;
  END IF;
END
$$;
GRANT SELECT, INSERT, UPDATE, DELETE ON mot_cua.ho_so, mot_cua.thanh_phan_ho_so TO dxos_kiem_toan;
GRANT INSERT, UPDATE, DELETE ON mot_cua.can_bo, mot_cua.can_bo_linh_vuc TO dxos_kiem_toan;

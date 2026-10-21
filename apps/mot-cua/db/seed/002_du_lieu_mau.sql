-- SPDX-License-Identifier: Apache-2.0
-- Dữ liệu mẫu GIẢ của ứng dụng mot-cua (schema 002, #5). Chỉ nạp khi DXOS_SEED=true
-- (mặc định trong .env.example); tắt khi triển khai thật. Viết để chạy lại vẫn không trùng.
--
-- Xã giả định "Xã Mẫu". Họ tên, số điện thoại, sub đều GIẢ: sub là id cố định của người
-- dùng mẫu trong apps/mot-cua/keycloak/realm.json (dạng 00000000-…-0000000xxxxx).
-- Không lưu số CCCD trong CSDL (xem đầu migration 002).
--
-- Thủ tục và thành phần hồ sơ lấy theo quy định công khai (Luật Hộ tịch 2014, Nghị định
-- 123/2015/NĐ-CP, Nghị định 23/2015/NĐ-CP, Luật Đất đai 2024), RÚT GỌN cho mục đích minh
-- họa; đối chiếu Cổng Dịch vụ công quốc gia trước khi dùng thật. Phí/lệ phí hộ tịch do
-- HĐND tỉnh quy định, ở đây ghi giá trị mẫu.

-- 1. Lĩnh vực -----------------------------------------------------------------------
INSERT INTO mot_cua.linh_vuc (ma, ten, mo_ta) VALUES
  ('ho_tich',    'Hộ tịch',    'Khai sinh, kết hôn, khai tử…'),
  ('chung_thuc', 'Chứng thực', 'Chứng thực bản sao, chữ ký'),
  ('dat_dai',    'Đất đai',    'Hòa giải tranh chấp, xác nhận liên quan đến đất đai')
ON CONFLICT (ma) DO NOTHING;

-- 2. Thủ tục --------------------------------------------------------------------------
INSERT INTO mot_cua.thu_tuc (ma, ten, linh_vuc_id, so_ngay_xu_ly, le_phi, ghi_chu_le_phi, can_cu_phap_ly)
SELECT v.ma, v.ten, lv.id, v.so_ngay, v.le_phi, v.ghi_chu, v.can_cu
  FROM (VALUES
    ('KS01', 'Đăng ký khai sinh', 'ho_tich', 1, 0,
     'Miễn lệ phí khi đăng ký đúng hạn', 'Luật Hộ tịch 2014 Điều 16; Nghị định 123/2015/NĐ-CP'),
    ('KH01', 'Đăng ký kết hôn', 'ho_tich', 5, 0,
     'Theo nghị quyết HĐND tỉnh (giá trị mẫu)', 'Luật Hộ tịch 2014 Điều 18'),
    ('KT01', 'Đăng ký khai tử', 'ho_tich', 1, 0,
     'Miễn lệ phí khi đăng ký đúng hạn', 'Luật Hộ tịch 2014 Điều 34'),
    ('CT01', 'Chứng thực bản sao từ bản chính', 'chung_thuc', 1, 2000,
     '2.000 đồng/trang; từ trang thứ ba 1.000 đồng/trang, tối đa 200.000 đồng/bản', 'Nghị định 23/2015/NĐ-CP Điều 20'),
    ('CT02', 'Chứng thực chữ ký', 'chung_thuc', 1, 10000,
     '10.000 đồng/trường hợp', 'Nghị định 23/2015/NĐ-CP Điều 24'),
    ('DD01', 'Hòa giải tranh chấp đất đai tại xã', 'dat_dai', 30, 0,
     'Không thu phí', 'Luật Đất đai 2024 Điều 235')
  ) AS v (ma, ten, linh_vuc, so_ngay, le_phi, ghi_chu, can_cu)
  JOIN mot_cua.linh_vuc lv ON lv.ma = v.linh_vuc
ON CONFLICT (ma) DO NOTHING;

-- 3. Thành phần hồ sơ yêu cầu ---------------------------------------------------------
INSERT INTO mot_cua.thanh_phan_yeu_cau (thu_tuc_id, ma, ten, bat_buoc, so_luong, ghi_chu, thu_tu)
SELECT t.id, v.ma, v.ten, v.bat_buoc, 1, v.ghi_chu, v.thu_tu
  FROM (VALUES
    ('KS01', 'to_khai',          'Tờ khai đăng ký khai sinh (theo mẫu)', true, NULL, 1),
    ('KS01', 'giay_chung_sinh',  'Giấy chứng sinh', true,
     'Không có thì thay bằng văn bản của người làm chứng hoặc giấy cam đoan về việc sinh', 2),
    ('KS01', 'giay_to_tuy_than', 'Giấy tờ tùy thân của người đi đăng ký', true, 'Xuất trình bản chính hoặc ảnh chụp', 3),
    ('KS01', 'giay_ket_hon_cha_me', 'Giấy chứng nhận kết hôn của cha mẹ', false, 'Nếu cha mẹ đã đăng ký kết hôn', 4),
    ('KH01', 'to_khai',          'Tờ khai đăng ký kết hôn (theo mẫu)', true, NULL, 1),
    ('KH01', 'giay_to_tuy_than', 'Giấy tờ tùy thân của hai bên nam, nữ', true, NULL, 2),
    ('KH01', 'xac_nhan_hon_nhan', 'Giấy xác nhận tình trạng hôn nhân', false,
     'Khi một bên không cư trú tại xã đăng ký', 3),
    ('KT01', 'to_khai',          'Tờ khai đăng ký khai tử (theo mẫu)', true, NULL, 1),
    ('KT01', 'giay_bao_tu',      'Giấy báo tử hoặc giấy tờ thay giấy báo tử', true, NULL, 2),
    ('KT01', 'giay_to_tuy_than', 'Giấy tờ tùy thân của người đi đăng ký', true, NULL, 3),
    ('CT01', 'ban_chinh',        'Bản chính giấy tờ cần chứng thực', true, 'Xuất trình tại bộ phận một cửa', 1),
    ('CT01', 'ban_sao',          'Bản sao cần chứng thực', false, 'Nếu người yêu cầu tự chuẩn bị bản sao', 2),
    ('CT02', 'giay_to_tuy_than', 'Giấy tờ tùy thân còn giá trị của người yêu cầu', true, NULL, 1),
    ('CT02', 'van_ban_ky',       'Giấy tờ, văn bản cần chứng thực chữ ký', true, NULL, 2),
    ('DD01', 'don_yeu_cau',      'Đơn yêu cầu hòa giải tranh chấp đất đai', true, NULL, 1),
    ('DD01', 'giay_to_dat',      'Giấy tờ liên quan đến thửa đất', false, 'Nếu có', 2)
  ) AS v (thu_tuc, ma, ten, bat_buoc, ghi_chu, thu_tu)
  JOIN mot_cua.thu_tuc t ON t.ma = v.thu_tuc
ON CONFLICT (thu_tuc_id, ma) DO NOTHING;

-- 4. Ngày nghỉ năm 2026 (lịch nghỉ mẫu của cơ quan hành chính; cập nhật theo thông báo
-- hằng năm của Bộ Nội vụ) ------------------------------------------------------------
INSERT INTO mot_cua.ngay_nghi (ngay, ten) VALUES
  ('2026-01-01', 'Tết Dương lịch'),
  ('2026-02-16', 'Tết Nguyên đán'),
  ('2026-02-17', 'Tết Nguyên đán'),
  ('2026-02-18', 'Tết Nguyên đán'),
  ('2026-02-19', 'Tết Nguyên đán'),
  ('2026-02-20', 'Tết Nguyên đán'),
  ('2026-04-27', 'Nghỉ bù Giỗ Tổ Hùng Vương (10/3 âm lịch rơi vào Chủ nhật)'),
  ('2026-04-30', 'Ngày Chiến thắng'),
  ('2026-05-01', 'Quốc tế Lao động'),
  ('2026-09-01', 'Quốc khánh'),
  ('2026-09-02', 'Quốc khánh')
ON CONFLICT (ngay) DO NOTHING;

-- 5. Cán bộ, mỗi người một lĩnh vực ----------------------------------------------------
INSERT INTO mot_cua.can_bo (sub, ho_ten, chuc_vu) VALUES
  ('00000000-0000-0000-0000-00000000b001', 'Trần Thị Một Cửa',  'Công chức Tư pháp – Hộ tịch'),
  ('00000000-0000-0000-0000-00000000b002', 'Phạm Văn Chứng',    'Công chức Văn phòng – Thống kê (chứng thực)'),
  ('00000000-0000-0000-0000-00000000b003', 'Hoàng Thị Địa Chính', 'Công chức Địa chính – Xây dựng')
ON CONFLICT (sub) DO NOTHING;

INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id)
SELECT c.id, lv.id
  FROM (VALUES
    ('00000000-0000-0000-0000-00000000b001', 'ho_tich'),
    ('00000000-0000-0000-0000-00000000b002', 'chung_thuc'),
    ('00000000-0000-0000-0000-00000000b003', 'dat_dai')
  ) AS v (sub, linh_vuc)
  JOIN mot_cua.can_bo c ON c.sub = v.sub
  JOIN mot_cua.linh_vuc lv ON lv.ma = v.linh_vuc
ON CONFLICT DO NOTHING;

-- 6. Hồ sơ ở các trạng thái (ngày nhận tính lùi từ lúc nạp để luôn có hồ sơ trễ hạn) ----
-- congdan01 = …c001 (Nguyễn Văn Mẫu), congdan02 = …c002 (Lê Thị Thử).
INSERT INTO mot_cua.ho_so (id, ma_ho_so, thu_tuc_id, nguoi_nop_sub, ho_ten_nguoi_nop, so_dien_thoai,
                           trang_thai, ly_do, ngay_nhan, can_bo_xu_ly_id)
SELECT v.id::uuid, v.ma_ho_so, t.id, v.sub, v.ho_ten, v.sdt, v.trang_thai, v.ly_do,
       now() - make_interval(days => v.so_ngay_truoc), c.id
  FROM (VALUES
    ('a0000000-0000-4000-8000-000000000001', 'HSMAU-000001', 'KS01', '00000000-0000-0000-0000-00000000c001',
     'Nguyễn Văn Mẫu', '0900000001', 'moi', NULL, 0, NULL),
    ('a0000000-0000-4000-8000-000000000002', 'HSMAU-000002', 'KH01', '00000000-0000-0000-0000-00000000c001',
     'Nguyễn Văn Mẫu', '0900000001', 'dang_xu_ly', NULL, 12, '00000000-0000-0000-0000-00000000b001'),
    ('a0000000-0000-4000-8000-000000000003', 'HSMAU-000003', 'CT01', '00000000-0000-0000-0000-00000000c002',
     'Lê Thị Thử', '0900000002', 'cho_bo_sung', 'Bản chính bị mờ, đề nghị xuất trình lại', 2,
     '00000000-0000-0000-0000-00000000b002'),
    ('a0000000-0000-4000-8000-000000000004', 'HSMAU-000004', 'KT01', '00000000-0000-0000-0000-00000000c002',
     'Lê Thị Thử', NULL, 'hoan_tat', NULL, 9, '00000000-0000-0000-0000-00000000b001'),
    ('a0000000-0000-4000-8000-000000000005', 'HSMAU-000005', 'CT02', '00000000-0000-0000-0000-00000000c002',
     'Lê Thị Thử', '0900000002', 'tu_choi', 'Văn bản cần chứng thực chữ ký có nội dung trái pháp luật', 5,
     '00000000-0000-0000-0000-00000000b002'),
    ('a0000000-0000-4000-8000-000000000006', 'HSMAU-000006', 'DD01', '00000000-0000-0000-0000-00000000c001',
     'Nguyễn Văn Mẫu', '0900000001', 'dang_xu_ly', NULL, 3, '00000000-0000-0000-0000-00000000b003')
  ) AS v (id, ma_ho_so, thu_tuc, sub, ho_ten, sdt, trang_thai, ly_do, so_ngay_truoc, can_bo_sub)
  JOIN mot_cua.thu_tuc t ON t.ma = v.thu_tuc
  LEFT JOIN mot_cua.can_bo c ON c.sub = v.can_bo_sub
ON CONFLICT (id) DO NOTHING;

-- 7. Giấy tờ đính kèm (metadata giả, chưa có tệp trong Garage) ---------------------------
INSERT INTO mot_cua.thanh_phan_ho_so (ho_so_id, thanh_phan_yeu_cau_id, ten_tep, loai_mime, kich_thuoc,
                                      sha256, trang_thai_kiem_tra, ghi_chu_kiem_tra)
SELECT h.id, y.id, v.ten_tep, v.mime, v.kich_thuoc, encode(sha256(convert_to(v.ten_tep, 'UTF8')), 'hex'),
       v.kiem_tra, v.ghi_chu
  FROM (VALUES
    ('HSMAU-000001', 'to_khai',          'to-khai-khai-sinh.pdf',   'application/pdf', 182000, 'chua_kiem_tra', NULL),
    ('HSMAU-000001', 'giay_chung_sinh',  'giay-chung-sinh.jpg',     'image/jpeg',      640000, 'chua_kiem_tra', NULL),
    ('HSMAU-000002', 'to_khai',          'to-khai-ket-hon.pdf',     'application/pdf', 175000, 'hop_le', NULL),
    ('HSMAU-000002', 'giay_to_tuy_than', 'giay-to-tuy-than.jpg',    'image/jpeg',      512000, 'hop_le', NULL),
    ('HSMAU-000003', 'ban_chinh',        'ban-chinh-bang-tot-nghiep.jpg', 'image/jpeg', 830000, 'khong_hop_le',
     'Ảnh mờ, không đọc được số hiệu văn bằng')
  ) AS v (ma_ho_so, ma_thanh_phan, ten_tep, mime, kich_thuoc, kiem_tra, ghi_chu)
  JOIN mot_cua.ho_so h ON h.ma_ho_so = v.ma_ho_so
  JOIN mot_cua.thanh_phan_yeu_cau y ON y.thu_tuc_id = h.thu_tuc_id AND y.ma = v.ma_thanh_phan
 WHERE NOT EXISTS (SELECT 1 FROM mot_cua.thanh_phan_ho_so x WHERE x.ho_so_id = h.id AND x.ten_tep = v.ten_tep);

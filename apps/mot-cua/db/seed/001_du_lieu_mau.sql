-- SPDX-License-Identifier: Apache-2.0
-- Dữ liệu mẫu GIẢ của ứng dụng mot-cua. Chỉ nạp khi DXOS_SEED=true (mặc định trong
-- .env.example); tắt khi triển khai thật. Viết để chạy lại vẫn không trùng dòng.

INSERT INTO mot_cua.thu_tuc (ma, ten, linh_vuc, so_ngay_xu_ly) VALUES
  ('KS01', 'Đăng ký khai sinh', 'ho_tich', 1),
  ('KH01', 'Đăng ký kết hôn', 'ho_tich', 5),
  ('CT01', 'Chứng thực bản sao từ bản chính', 'chung_thuc', 1)
ON CONFLICT (ma) DO NOTHING;

-- sub giả; người dùng thật trong Keycloak có sub dạng UUID khác.
INSERT INTO mot_cua.ho_so (ma_thu_tuc, nguoi_nop_sub, ho_ten_nguoi_nop)
SELECT v.ma_thu_tuc, v.nguoi_nop_sub, v.ho_ten_nguoi_nop
  FROM (VALUES
          ('KS01', '00000000-0000-0000-0000-00000000c001', 'Nguyễn Văn Mẫu'),
          ('CT01', '00000000-0000-0000-0000-00000000c002', 'Trần Thị Thử')
       ) AS v (ma_thu_tuc, nguoi_nop_sub, ho_ten_nguoi_nop)
 WHERE NOT EXISTS (SELECT 1 FROM mot_cua.ho_so h WHERE h.nguoi_nop_sub = v.nguoi_nop_sub);

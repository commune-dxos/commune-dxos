-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Lịch công tác MẪU của "Xã Mẫu" (#117, migration 017) cho tuần đang chạy lúc nạp seed. Chỉ nạp khi DXOS_SEED=true.
-- Nội dung do đội tự viết để minh họa; người, nơi đều giả. Chạy lại không trùng (id cố định).
-- Lịch đã duyệt do lãnh đạo mẫu lanhdao01 (…d001) tạo; lịch dự kiến do văn thư mẫu vanthu01 (…e001) soạn.

INSERT INTO mot_cua.lich_cong_tac (id, tieu_de, loai, bat_dau, ket_thuc, dia_diem, chu_tri, thanh_phan, trang_thai,
                                   nguoi_tao_sub)
SELECT v.id::uuid, v.tieu_de, v.loai,
       (t.thu_hai + v.ngay * interval '1 day' + v.tu::time) AT TIME ZONE 'Asia/Ho_Chi_Minh',
       (t.thu_hai + v.ngay * interval '1 day' + v.den::time) AT TIME ZONE 'Asia/Ho_Chi_Minh',
       v.dia_diem, v.chu_tri, v.thanh_phan, v.trang_thai, v.nguoi
  FROM (SELECT date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AS thu_hai) t,
       (VALUES
    ('00000000-0000-4000-8000-00000000b001', 'Giao ban đầu tuần Ủy ban nhân dân xã', 'hop', 0, '07:30', '08:30',
     'Phòng họp Ủy ban', 'Chủ tịch UBND xã', 'Các Phó Chủ tịch, công chức chuyên môn, bộ phận một cửa',
     'da_duyet', '00000000-0000-0000-0000-00000000d001'),
    ('00000000-0000-4000-8000-00000000b002', 'Tiếp công dân định kỳ', 'tiep_dan', 1, '08:00', '11:00',
     'Phòng tiếp công dân', 'Chủ tịch UBND xã', 'Công chức tư pháp – hộ tịch, địa chính',
     'da_duyet', '00000000-0000-0000-0000-00000000d001'),
    ('00000000-0000-4000-8000-00000000b003', 'Họp triển khai kế hoạch chuyển đổi số của xã', 'hop', 2, '14:00', '16:30',
     'Hội trường Ủy ban', 'Phó Chủ tịch UBND xã', 'Trưởng các thôn, công chức văn phòng – thống kê',
     'da_duyet', '00000000-0000-0000-0000-00000000d001'),
    ('00000000-0000-4000-8000-00000000b004', 'Trực bộ phận một cửa ngoài giờ', 'truc', 3, '17:00', '19:00',
     'Bộ phận một cửa', 'Công chức văn phòng – thống kê', NULL,
     'da_duyet', '00000000-0000-0000-0000-00000000d001'),
    ('00000000-0000-4000-8000-00000000b005', 'Dự hội nghị tập huấn cải cách hành chính cấp tỉnh', 'cong_tac', 4, '08:00', '11:30',
     'Hội trường tỉnh (mẫu)', 'Phó Chủ tịch UBND xã', 'Công chức tư pháp – hộ tịch',
     'du_kien', '00000000-0000-0000-0000-00000000e001'),
    ('00000000-0000-4000-8000-00000000b006', 'Trực tiếp nhận hồ sơ sáng thứ Bảy', 'truc', 5, '07:30', '11:30',
     'Bộ phận một cửa', 'Công chức tư pháp – hộ tịch', NULL,
     'du_kien', '00000000-0000-0000-0000-00000000e001')
  ) AS v (id, tieu_de, loai, ngay, tu, den, dia_diem, chu_tri, thanh_phan, trang_thai, nguoi)
ON CONFLICT (id) DO NOTHING;

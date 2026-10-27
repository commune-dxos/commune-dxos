-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Văn bản wiki nội bộ MẪU của "Xã Mẫu" (#95, migration 016). Chỉ nạp khi DXOS_SEED=true. Nội dung do đội tự viết
-- để minh họa, không phải văn bản thật của cơ quan nào; số ký hiệu giả. Chạy lại không trùng (id cố định).
-- Người tạo: văn thư mẫu vanthu01 (…e001) và lãnh đạo mẫu lanhdao01 (…d001) trong mot-cua/keycloak/realm.json.

INSERT INTO mot_cua.wiki_van_ban (id, tieu_de, loai, so_ky_hieu, ngay_ban_hanh, tom_tat, noi_dung, pham_vi,
                                  linh_vuc_id, nguoi_tao_sub)
SELECT v.id::uuid, v.tieu_de, v.loai, v.so_ky_hieu, v.ngay::date, v.tom_tat, v.noi_dung, v.pham_vi,
       (SELECT lv.id FROM mot_cua.linh_vuc lv WHERE lv.ma = v.linh_vuc), v.nguoi
  FROM (VALUES
    ('00000000-0000-4000-8000-00000000a001', 'Quy chế làm việc của Ủy ban nhân dân Xã Mẫu', 'quy_che', '01/QC-UBND (mẫu)',
     '2026-01-05', 'Nguyên tắc làm việc, giờ tiếp công dân, trách nhiệm của cán bộ bộ phận một cửa.',
     E'1. Bộ phận một cửa tiếp nhận hồ sơ từ 7 giờ 30 đến 17 giờ các ngày làm việc.\n' ||
     E'2. Hồ sơ nộp trực tuyến được kiểm tra trong ngày làm việc kế tiếp; thiếu thành phần thì yêu cầu bổ sung một lần, ' ||
     E'ghi rõ lý do.\n3. Cán bộ không yêu cầu công dân nộp thêm giấy tờ ngoài danh mục của thủ tục.\n' ||
     E'4. Hồ sơ sắp trễ hạn phải báo lãnh đạo trước 15 giờ của ngày hết hạn.',
     'toan_xa', NULL, '00000000-0000-0000-0000-00000000e001'),
    ('00000000-0000-4000-8000-00000000a002', 'Quy trình tiếp công dân tại bộ phận một cửa', 'quy_trinh', NULL,
     '2026-02-10', 'Các bước tiếp đón, hướng dẫn, viết biên nhận và trả kết quả.',
     E'Bước 1: chào hỏi, hỏi nhu cầu, tra thủ tục trên cổng.\nBước 2: kiểm tra thành phần hồ sơ theo danh mục; ' ||
     E'hồ sơ đủ thì viết biên nhận, hẹn ngày trả.\nBước 3: chuyển hồ sơ cho cán bộ chuyên môn trong ngày.\n' ||
     E'Bước 4: trả kết quả, công dân ký nhận; ghi sổ theo dõi.',
     'toan_xa', NULL, '00000000-0000-0000-0000-00000000e001'),
    ('00000000-0000-4000-8000-00000000a003', 'Hướng dẫn nghiệp vụ đăng ký khai sinh đúng hạn', 'huong_dan', '05/HD-TP (mẫu)',
     '2026-03-02', 'Lưu ý khi thẩm định tờ khai và giấy chứng sinh.',
     E'Đối chiếu họ tên mẹ trên giấy chứng sinh với giấy tờ tùy thân. Trường hợp không có giấy chứng sinh thì cần văn bản ' ||
     E'của người làm chứng. Kiểm tra tên dự định đặt cho con không trùng ký tự đặc biệt. Kết quả trả trong ngày nếu nộp ' ||
     E'trước 15 giờ.',
     'linh_vuc', 'ho_tich', '00000000-0000-0000-0000-00000000e001'),
    ('00000000-0000-4000-8000-00000000a004', 'Hướng dẫn chứng thực bản sao từ bản chính', 'huong_dan', NULL,
     '2026-03-15', 'Các trường hợp không được chứng thực bản sao, cách ghi lời chứng.',
     E'Không chứng thực bản sao từ bản chính bị tẩy xóa, sửa chữa hoặc đã hết giá trị sử dụng. Lời chứng ghi đúng mẫu, ' ||
     E'đóng dấu giáp lai khi bản sao có từ hai trang. Ghi sổ chứng thực ngay sau khi ký.',
     'linh_vuc', 'chung_thuc', '00000000-0000-0000-0000-00000000e001'),
    ('00000000-0000-4000-8000-00000000a005', 'Mẫu phiếu yêu cầu bổ sung hồ sơ', 'bieu_mau', NULL, '2026-04-01',
     'Nội dung bắt buộc của phiếu yêu cầu bổ sung.',
     E'Phiếu gồm: mã hồ sơ, tên thủ tục, thành phần còn thiếu, lý do, hạn bổ sung, họ tên và chức vụ cán bộ. ' ||
     E'Gửi cho công dân qua cổng và lưu vào hồ sơ.',
     'toan_xa', NULL, '00000000-0000-0000-0000-00000000e001'),
    ('00000000-0000-4000-8000-00000000a006', 'Ghi chú họp giao ban lãnh đạo tháng 9 (mẫu)', 'thong_bao_noi_bo', NULL,
     '2026-09-30', 'Chỉ tiêu tỷ lệ hồ sơ đúng hạn quý IV.',
     E'Mục tiêu quý IV: tỷ lệ hồ sơ giải quyết đúng hạn từ 98 phần trăm. Rà soát các thủ tục hay phải bổ sung để cập nhật ' ||
     E'hướng dẫn trên cổng công dân.',
     'lanh_dao', NULL, '00000000-0000-0000-0000-00000000d001')
  ) AS v (id, tieu_de, loai, so_ky_hieu, ngay, tom_tat, noi_dung, pham_vi, linh_vuc, nguoi)
ON CONFLICT (id) DO NOTHING;

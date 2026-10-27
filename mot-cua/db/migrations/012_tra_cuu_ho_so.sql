-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Bộ máy một cửa – tra cứu tiến độ hồ sơ không cần đăng nhập (#54).
-- nen-tang/scripts/tang2-migrate.sh áp dụng tệp này đúng một lần, trong một transaction.
--
-- Người dân cầm biên nhận (mã hồ sơ) hỏi "xong chưa" mà không đăng nhập: GET /public/rpc/tra_cuu_ho_so
-- (role anon, APISIX giới hạn 60 request/phút/IP). Xác thực nhẹ bằng 4 số cuối số điện thoại đã khai khi
-- nộp; CSDL không lưu CCCD nên không đối chiếu CCCD. Hồ sơ không khai số điện thoại thì chỉ tra cứu được
-- sau khi đăng nhập (cổng công dân đọc /api/ho_so theo RLS như cũ).
-- Chỉ trả thông tin không định danh: thủ tục, trạng thái, ngày nộp, hạn, ngày xong và các mốc chuyển trạng
-- thái. Không trả họ tên, số điện thoại, lý do bổ sung/từ chối (có thể chứa thông tin cá nhân), tệp hay giấy
-- tờ: những thứ đó cần đăng nhập.
-- Sai mã hay sai 4 số đều trả NULL như nhau: không dò được mã nào tồn tại.

CREATE FUNCTION mot_cua.tra_cuu_ho_so(p_ma text, p_so_cuoi text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
           'ma_ho_so', h.ma_ho_so,
           'thu_tuc', jsonb_build_object('ma', t.ma, 'ten', t.ten),
           'trang_thai', h.trang_thai,
           'ngay_nhan', h.ngay_nhan,
           'han_xu_ly', h.han_xu_ly,
           'ngay_hoan_tat', h.ngay_hoan_tat,
           'lich_su', coalesce((
             SELECT jsonb_agg(jsonb_build_object('trang_thai', l.den_trang_thai, 'luc', l.luc) ORDER BY l.id)
               FROM mot_cua.lich_su_trang_thai l
              WHERE l.ho_so_id = h.id), '[]'::jsonb))
    FROM mot_cua.ho_so h
    JOIN mot_cua.thu_tuc t ON t.id = h.thu_tuc_id
   WHERE h.ma_ho_so = upper(btrim(p_ma))
     AND p_so_cuoi ~ '^[0-9]{4}$'
     AND h.so_dien_thoai IS NOT NULL
     AND right(h.so_dien_thoai, 4) = p_so_cuoi
$$;
COMMENT ON FUNCTION mot_cua.tra_cuu_ho_so(text, text) IS
  'Tra cứu tiến độ hồ sơ theo mã + 4 số cuối số điện thoại, không cần đăng nhập (#54). Sai → NULL. Không trả dữ liệu cá nhân';

REVOKE EXECUTE ON FUNCTION mot_cua.tra_cuu_ho_so(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mot_cua.tra_cuu_ho_so(text, text) TO anon, cong_dan;

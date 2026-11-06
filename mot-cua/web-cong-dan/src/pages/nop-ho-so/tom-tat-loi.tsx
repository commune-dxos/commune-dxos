// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Báo lỗi của form chỉ một cách (#140): dòng lỗi ngay dưới ô cần sửa. Không vẽ thêm hộp tóm tắt (trước đây cùng
// nội dung hiện 2 lần, trên điện thoại chiếm gần hết màn hình). Mỗi lần kiểm có lỗi: con trỏ chuyển tới ô sai đầu
// tiên (cuộn tới giữa màn hình), trình đọc màn hình nghe một câu tóm tắt qua vùng thông báo ẩn.
import { useEffect } from "react";
import type { Loi } from "./kieu";

export function TomTatLoi({ loi, lanKiem }: { loi: Loi; lanKiem: number }) {
  useEffect(() => {
    if (!loi.length) return;
    const o = document.getElementById(loi[0].id);
    if (!o) return;
    o.focus({ preventScroll: true });
    // Ô tệp bị ẩn (sr-only) trong nhãn "Chọn tệp": cuộn tới cả khối giấy tờ để thấy dòng lỗi.
    (o.closest("fieldset") ?? o).scrollIntoView?.({ block: "center" });
  }, [loi, lanKiem]);
  if (!loi.length) return null;
  return (
    <p key={lanKiem} role="alert" className="sr-only">
      {`Còn ${loi.length} mục cần sửa: ${loi.map((l) => l.thongDiep).join("; ")}.`}
    </p>
  );
}

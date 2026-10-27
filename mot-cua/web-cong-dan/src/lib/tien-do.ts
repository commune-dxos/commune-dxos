// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Các bước người dân thấy khi tra cứu (#54), dựng từ trạng thái hồ sơ và các mốc chuyển trạng thái.
// Trạng thái đi theo bước quy trình Flowable (#73, ánh xạ trong gói thủ tục), nên cùng một bảng bước
// dùng được cho mọi thủ tục mà không cần biết BPMN: thủ tục không có bước phê duyệt riêng (CT01) đi
// thẳng từ "Thẩm định" sang "Trả kết quả" và bước phê duyệt tính là xong cùng lúc.
import { tenTrangThai } from "./trang-thai";

export type TrangBuoc = "xong" | "dang" | "cho" | "can_bo_sung" | "tu_choi" | "bo_qua";

export interface BuocHienThi {
  ma: string;
  ten: string;
  trang: TrangBuoc;
  /** Lúc bước xong (ISO), nếu biết. */
  luc: string | null;
}

export const CAC_BUOC = [
  { ma: "nop", ten: "Nộp hồ sơ" },
  { ma: "tiep_nhan", ten: "Tiếp nhận, kiểm tra giấy tờ" },
  { ma: "tham_dinh", ten: "Thẩm định" },
  { ma: "phe_duyet", ten: "Lãnh đạo xã phê duyệt" },
  { ma: "ket_qua", ten: "Trả kết quả" },
] as const;

/** Trạng thái → chỉ số bước đang làm (hoan_tat = đã qua mọi bước). */
const VI_TRI: Record<string, number> = { moi: 1, cho_bo_sung: 1, dang_xu_ly: 2, cho_phe_duyet: 3, hoan_tat: 5 };

/** Lời nhắn "việc tiếp theo" cho người nộp theo trạng thái. */
export const LOI_NHAN: Record<string, string> = {
  moi: "Bộ phận một cửa sẽ kiểm tra giấy tờ trong giờ hành chính.",
  dang_xu_ly: "Cán bộ chuyên môn đang thẩm định hồ sơ.",
  cho_bo_sung: "Hồ sơ cần bổ sung giấy tờ. Đăng nhập để xem yêu cầu và nộp bổ sung trực tuyến.",
  cho_phe_duyet: "Hồ sơ đã thẩm định xong, đang chờ lãnh đạo xã phê duyệt.",
  hoan_tat: "Hồ sơ đã có kết quả. Đăng nhập để tải thông báo kết quả có ký số, hoặc nhận tại bộ phận một cửa.",
  tu_choi: "Hồ sơ không được giải quyết. Đăng nhập để xem lý do.",
};

export function cacBuoc(trangThai: string, lichSu: { trang_thai: string; luc: string }[], ngayNhan: string) {
  // Từ chối: dừng ở bước của trạng thái ngay trước đó.
  const truocTuChoi = [...lichSu].reverse().find((m) => m.trang_thai !== "tu_choi")?.trang_thai ?? "moi";
  const hienTai = trangThai === "tu_choi" ? (VI_TRI[truocTuChoi] ?? 1) : (VI_TRI[trangThai] ?? 1);
  const daQua = (i: number) => lichSu.find((m) => (VI_TRI[m.trang_thai] ?? -1) > i)?.luc ?? null;
  return CAC_BUOC.map((b, i): BuocHienThi => {
    if (i === 0) return { ...b, trang: "xong", luc: lichSu[0]?.luc ?? ngayNhan };
    if (i < hienTai) return { ...b, trang: "xong", luc: daQua(i) };
    if (i > hienTai) return { ...b, trang: trangThai === "tu_choi" ? "bo_qua" : "cho", luc: null };
    const trang: TrangBuoc =
      trangThai === "tu_choi" ? "tu_choi" : trangThai === "cho_bo_sung" ? "can_bo_sung" : "dang";
    return { ...b, trang, luc: null };
  });
}

/** Một dòng lịch sử: "Chờ công dân bổ sung" kèm lý do (chỉ có khi đã đăng nhập). */
export function dongLichSu(m: { trang_thai: string; ly_do?: string | null }) {
  return m.ly_do ? `${tenTrangThai(m.trang_thai)}: ${m.ly_do}` : tenTrangThai(m.trang_thai);
}

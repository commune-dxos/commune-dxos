// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Hộp việc: ghép task Flowable với hồ sơ (đọc qua RLS), đánh giá hạn, lọc và sắp xếp. Hồ sơ quá hạn
// và sắp trễ (≤ 1 ngày) lên đầu.
import { danhGiaHan, hanLuc, soSanhHan, type DanhGiaHan, type MucHan } from "@/lib/han";
import type { HoSoCanBo, Task } from "./api";

export interface Viec {
  task: Task;
  hoSo: HoSoCanBo | null;
  han: DanhGiaHan;
  /** Task đã được chính người đăng nhập nhận. */
  cuaToi: boolean;
}

export type LocTrangThai = "tat_ca" | "chua_nhan" | "cua_toi";
export type LocHan = "tat_ca" | "qua_han" | "sap_tre" | "can_chu_y";

export interface BoLoc {
  trangThai: LocTrangThai;
  /** Mã thủ tục, "" = tất cả. */
  thuTuc: string;
  han: LocHan;
}

export const LOC_MAC_DINH: BoLoc = { trangThai: "tat_ca", thuTuc: "", han: "tat_ca" };

export const TEN_LOC_TRANG_THAI: Record<LocTrangThai, string> = {
  tat_ca: "Mọi trạng thái",
  chua_nhan: "Chưa ai nhận",
  cua_toi: "Tôi đang xử lý",
};
export const TEN_LOC_HAN: Record<LocHan, string> = {
  tat_ca: "Mọi hạn",
  can_chu_y: "Quá hạn hoặc sắp trễ",
  qua_han: "Quá hạn",
  sap_tre: "Sắp trễ (≤ 1 ngày)",
};

export function ghepViec(tasks: Task[], hoSo: HoSoCanBo[], sub: string, bayGio: Date): Viec[] {
  const theoId = new Map(hoSo.map((h) => [h.id, h]));
  return tasks
    .map((task) => {
      const hs = (task.hoSoId && theoId.get(task.hoSoId)) || null;
      return {
        task,
        hoSo: hs,
        han: danhGiaHan(hanLuc(task.hanXuLyLuc, hs?.han_xu_ly), bayGio, task.quaHan),
        cuaToi: task.nguoiNhan === sub,
      };
    })
    .sort((a, b) => soSanhHan(a.han, b.han) || a.task.taoLuc.localeCompare(b.task.taoLuc));
}

function khopHan(muc: MucHan, loc: LocHan) {
  if (loc === "tat_ca") return true;
  if (loc === "can_chu_y") return muc === "qua_han" || muc === "sap_tre";
  return muc === loc;
}

export function locViec(ds: Viec[], loc: BoLoc): Viec[] {
  return ds.filter(
    (v) =>
      (loc.trangThai === "tat_ca" ||
        (loc.trangThai === "cua_toi" ? v.cuaToi : v.task.nguoiNhan === null)) &&
      (loc.thuTuc === "" || v.hoSo?.thu_tuc?.ma === loc.thuTuc) &&
      khopHan(v.han.muc, loc.han),
  );
}

export function demTheoHan(ds: Viec[]): Record<MucHan, number> {
  const dem: Record<MucHan, number> = { qua_han: 0, sap_tre: 0, con_han: 0, khong_ro: 0 };
  for (const v of ds) dem[v.han.muc] += 1;
  return dem;
}

/** Thủ tục có trong hộp việc (cho bộ lọc), theo mã. */
export function thuTucTrongHop(ds: Viec[]): { ma: string; ten: string }[] {
  const m = new Map<string, string>();
  for (const v of ds) if (v.hoSo?.thu_tuc) m.set(v.hoSo.thu_tuc.ma, v.hoSo.thu_tuc.ten);
  return [...m].map(([ma, ten]) => ({ ma, ten })).sort((a, b) => a.ma.localeCompare(b.ma));
}

/** Đọc bộ lọc từ query string (?trang_thai=…&thu_tuc=…&han=…), giá trị lạ → mặc định. */
export function docBoLoc(q: URLSearchParams): BoLoc {
  const tt = q.get("trang_thai");
  const han = q.get("han");
  return {
    trangThai: tt === "chua_nhan" || tt === "cua_toi" ? tt : "tat_ca",
    thuTuc: /^[A-Za-z0-9_-]{1,20}$/.test(q.get("thu_tuc") ?? "") ? (q.get("thu_tuc") as string) : "",
    han: han === "qua_han" || han === "sap_tre" || han === "can_chu_y" ? han : "tat_ca",
  };
}

export function ghiBoLoc(loc: BoLoc): URLSearchParams {
  const q = new URLSearchParams();
  if (loc.trangThai !== "tat_ca") q.set("trang_thai", loc.trangThai);
  if (loc.thuTuc) q.set("thu_tuc", loc.thuTuc);
  if (loc.han !== "tat_ca") q.set("han", loc.han);
  return q;
}

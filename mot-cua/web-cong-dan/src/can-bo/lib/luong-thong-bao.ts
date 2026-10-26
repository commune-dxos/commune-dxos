// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Luồng thông báo của chuông (#56): GET /workflow/thong-bao/luong (Server-Sent Events của mot-cua-api,
// mot-cua/backend/thong_bao.py). Đọc bằng fetch để gửi được header Authorization (EventSource không gửi
// được), tách khung SSE, báo khi số thông báo chưa đọc đổi. Máy chủ đóng luồng khi token hết hạn
// (`het-han`): bên gọi mở lại bằng token mới.
import type { CauHinh } from "@/lib/cau-hinh";

export interface TrangThaiThongBao {
  chuaDoc: number;
  moiNhat: string | null;
}

export interface KhungSse {
  suKien: string;
  duLieu: string;
}

/** Tách các khung SSE hoàn chỉnh trong bộ đệm; → khung đã đủ và phần còn dở (chờ thêm dữ liệu). */
export function tachKhung(dem: string): { khung: KhungSse[]; con: string } {
  const phan = dem.replace(/\r\n/g, "\n").split("\n\n");
  const con = phan.pop() ?? "";
  const khung = phan.flatMap((p) => {
    let suKien = "message";
    const duLieu: string[] = [];
    for (const dong of p.split("\n")) {
      if (dong.startsWith(":")) continue; // chú thích (nhịp giữ kết nối)
      const i = dong.indexOf(":");
      const ten = i < 0 ? dong : dong.slice(0, i);
      const gt = i < 0 ? "" : dong.slice(i + 1).replace(/^ /, "");
      if (ten === "event") suKien = gt;
      else if (ten === "data") duLieu.push(gt);
    }
    return duLieu.length ? [{ suKien, duLieu: duLieu.join("\n") }] : [];
  });
  return { khung, con };
}

/** Lỗi không nên thử lại (403: vai không nhận thông báo, 404: bản lõi chưa có luồng). */
export class LoiLuongKhongThuLai extends Error {}

/**
 * Mở luồng, gọi khiDoi mỗi khi có sự kiện `thong-bao`. Kết thúc (resolve) khi máy chủ đóng luồng hoặc gửi
 * `het-han`; ném LoiLuongKhongThuLai với 403/404, Error với lỗi mạng hay mã khác (bên gọi thử lại sau).
 */
export async function moLuong(
  cauHinh: CauHinh,
  token: string,
  khiDoi: (t: TrangThaiThongBao) => void,
  tinHieu: AbortSignal,
  goi: typeof fetch = (...a) => fetch(...a),
): Promise<void> {
  const res = await goi(`${cauHinh.gatewayUrl}/workflow/thong-bao/luong`, {
    headers: { Accept: "text/event-stream", Authorization: `Bearer ${token}` },
    signal: tinHieu,
    cache: "no-store",
  });
  if (res.status === 403 || res.status === 404) throw new LoiLuongKhongThuLai(`luồng thông báo ${res.status}`);
  if (!res.ok || !res.body) throw new Error(`luồng thông báo ${res.status}`);
  const doc = res.body.getReader();
  const giaiMa = new TextDecoder();
  let dem = "";
  for (;;) {
    const { done, value } = await doc.read();
    if (done) return;
    const { khung, con } = tachKhung(dem + giaiMa.decode(value, { stream: true }));
    dem = con;
    for (const k of khung) {
      if (k.suKien === "het-han") return;
      if (k.suKien === "thong-bao") {
        try {
          khiDoi(JSON.parse(k.duLieu) as TrangThaiThongBao);
        } catch {
          // khung hỏng: bỏ qua, đợi khung sau
        }
      }
    }
  }
}

// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Dữ liệu giả cho test cổng cán bộ (không phải dữ liệu thật).
import type { HoSoCanBo, Task } from "../lib/api";

/** JWT giả (chữ ký không kiểm ở web), payload UTF-8 base64url như Keycloak. */
export function jwtGia(payload: object) {
  const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64('{"alg":"RS256"}')}.${b64(JSON.stringify(payload))}.chu-ky`;
}

export function taskGia(p: Partial<Task> & { id: string }): Task {
  return {
    buoc: "tiep_nhan",
    ten: "Tiếp nhận, kiểm tra thành phần hồ sơ",
    nguoiNhan: null,
    taoLuc: "2026-10-23T01:00:00.000+0000",
    processInstanceId: "pi-" + p.id,
    hoSoId: null,
    maHoSo: "HS-" + p.id,
    hanXuLyLuc: null,
    quaHan: false,
    ...p,
  };
}

export function hoSoGia(id: string, ma: string, ten: string, han: string): HoSoCanBo {
  return {
    id,
    ma_ho_so: "HS-" + id,
    trang_thai: "moi",
    han_xu_ly: han,
    ho_ten_nguoi_nop: "Nguyễn Văn Mẫu",
    so_dien_thoai: "0900000001",
    ngay_nhan: "2026-10-22T02:00:00Z",
    thu_tuc: { id: "tt-" + ma, ma, ten, so_ngay_xu_ly: 1, bien_theo_buoc: null, linh_vuc: null },
  };
}


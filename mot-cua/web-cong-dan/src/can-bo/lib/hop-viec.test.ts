// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { hoSoGia, taskGia } from "../test/gia";
import { demTheoHan, docBoLoc, ghepViec, ghiBoLoc, locViec, thuTucTrongHop } from "./hop-viec";

const BAY_GIO = new Date("2026-10-23T09:00:00+07:00");

const TASKS = [
  taskGia({ id: "a", hoSoId: "1", hanXuLyLuc: "2026-10-30T17:00:00+07:00" }),
  taskGia({ id: "b", hoSoId: "2", hanXuLyLuc: "2026-10-23T17:00:00+07:00", nguoiNhan: "toi" }),
  taskGia({ id: "c", hoSoId: "3", hanXuLyLuc: "2026-10-21T17:00:00+07:00", nguoiNhan: "nguoi-khac" }),
  taskGia({ id: "d", hoSoId: "9" }),
];
const HO_SO = [
  hoSoGia("1", "KS01", "Đăng ký khai sinh", "2026-10-30"),
  hoSoGia("2", "CT01", "Chứng thực bản sao", "2026-10-23"),
  hoSoGia("3", "KS01", "Đăng ký khai sinh", "2026-10-21"),
];

describe("hộp việc", () => {
  const ds = ghepViec(TASKS, HO_SO, "toi", BAY_GIO);

  it("ghép task với hồ sơ đọc qua RLS; hồ sơ không đọc được vẫn giữ task, hạn từ han_xu_ly nếu thiếu biến", () => {
    expect(ds.map((v) => v.task.id)).toEqual(["c", "b", "a", "d"]);
    expect(ds.find((v) => v.task.id === "d")).toMatchObject({ hoSo: null, han: { muc: "khong_ro" } });
    const chiCot = ghepViec([taskGia({ id: "e", hoSoId: "2" })], HO_SO, "toi", BAY_GIO)[0];
    expect(chiCot.han.muc).toBe("sap_tre");
  });

  it("đếm theo hạn cho ô số liệu và chuông", () => {
    expect(demTheoHan(ds)).toEqual({ qua_han: 1, sap_tre: 1, con_han: 1, khong_ro: 1 });
  });

  it("lọc theo trạng thái nhận, thủ tục, hạn", () => {
    const loc = (q: string) => locViec(ds, docBoLoc(new URLSearchParams(q))).map((v) => v.task.id);
    expect(loc("")).toEqual(["c", "b", "a", "d"]);
    expect(loc("trang_thai=cua_toi")).toEqual(["b"]);
    expect(loc("trang_thai=chua_nhan")).toEqual(["a", "d"]);
    expect(loc("thu_tuc=KS01")).toEqual(["c", "a"]);
    expect(loc("han=qua_han")).toEqual(["c"]);
    expect(loc("han=sap_tre")).toEqual(["b"]);
    expect(loc("han=can_chu_y&thu_tuc=KS01")).toEqual(["c"]);
  });

  it("bộ lọc trên URL: giá trị lạ về mặc định, ghi lại chỉ phần khác mặc định", () => {
    expect(docBoLoc(new URLSearchParams("trang_thai=x&han=y&thu_tuc=<script>"))).toEqual({ trangThai: "tat_ca", thuTuc: "", han: "tat_ca" });
    expect(ghiBoLoc({ trangThai: "cua_toi", thuTuc: "", han: "sap_tre" }).toString()).toBe("trang_thai=cua_toi&han=sap_tre");
    expect(thuTucTrongHop(ds)).toEqual([
      { ma: "CT01", ten: "Chứng thực bản sao" },
      { ma: "KS01", ten: "Đăng ký khai sinh" },
    ]);
  });
});

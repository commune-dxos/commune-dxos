// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { danhGiaHan, hanLuc, khoangThoiGian, ngayGio, soSanhHan } from "./han";

const GIO = 3600_000;
const luc = (iso: string) => new Date(iso);

describe("hạn xử lý", () => {
  it("đọc hanXuLyLuc của quy trình; thiếu thì dựng từ han_xu_ly + 17:00 giờ Việt Nam", () => {
    expect(hanLuc("2026-10-24T17:00:00+07:00")?.toISOString()).toBe("2026-10-24T10:00:00.000Z");
    expect(hanLuc(null, "2026-10-24")?.toISOString()).toBe("2026-10-24T10:00:00.000Z");
    expect(hanLuc(null, null)).toBeNull();
    expect(hanLuc("không phải ngày")).toBeNull();
    expect(hanLuc(null, "24/10/2026")).toBeNull();
  });

  it("còn hơn 1 ngày → còn hạn; ≤ 1 ngày → sắp trễ; qua hạn → quá hạn", () => {
    const han = luc("2026-10-24T17:00:00+07:00");
    expect(danhGiaHan(han, new Date(han.getTime() - 50 * GIO))).toMatchObject({ muc: "con_han", nhan: "Còn 2 ngày 2 giờ" });
    expect(danhGiaHan(han, new Date(han.getTime() - 24 * GIO))).toMatchObject({ muc: "sap_tre", nhan: "Còn 1 ngày" });
    expect(danhGiaHan(han, new Date(han.getTime() - 5 * GIO - 1))).toMatchObject({ muc: "sap_tre", nhan: "Còn 5 giờ" });
    expect(danhGiaHan(han, new Date(han.getTime() - 10 * 60_000))).toMatchObject({ muc: "sap_tre", nhan: "Còn dưới 1 giờ" });
    expect(danhGiaHan(han, new Date(han.getTime() + 3 * GIO))).toMatchObject({ muc: "qua_han", nhan: "Quá hạn 3 giờ" });
    expect(danhGiaHan(han, new Date(han.getTime() + 4 * 24 * GIO))).toMatchObject({ muc: "qua_han", nhan: "Quá hạn 4 ngày" });
  });

  it("biến quaHan của BPMN thắng đồng hồ máy (lệch giờ vẫn báo quá hạn)", () => {
    const han = luc("2026-10-24T17:00:00+07:00");
    expect(danhGiaHan(han, new Date(han.getTime() - 2 * GIO), true).muc).toBe("qua_han");
    expect(danhGiaHan(null, new Date(), true).muc).toBe("qua_han");
    expect(danhGiaHan(null, new Date())).toMatchObject({ muc: "khong_ro", nhan: "Chưa có hạn" });
  });

  it("sắp xếp: quá hạn, sắp trễ, còn hạn, không rõ; cùng mức thì hạn sớm trước", () => {
    const bayGio = luc("2026-10-23T08:00:00+07:00");
    const ds = [
      danhGiaHan(luc("2026-10-30T17:00:00+07:00"), bayGio),
      danhGiaHan(null, bayGio),
      danhGiaHan(luc("2026-10-23T17:00:00+07:00"), bayGio),
      danhGiaHan(luc("2026-10-22T17:00:00+07:00"), bayGio),
      danhGiaHan(luc("2026-10-27T17:00:00+07:00"), bayGio),
    ].sort(soSanhHan);
    expect(ds.map((d) => d.muc)).toEqual(["qua_han", "sap_tre", "con_han", "con_han", "khong_ro"]);
    expect(ds[2].han!.getTime()).toBeLessThan(ds[3].han!.getTime());
  });

  it("viết khoảng thời gian và ngày giờ theo giờ Việt Nam", () => {
    expect(khoangThoiGian(-26 * GIO)).toBe("1 ngày 2 giờ");
    expect(khoangThoiGian(72 * GIO + 5 * GIO)).toBe("3 ngày");
    expect(ngayGio(luc("2026-10-24T10:00:00Z"))).toBe("17:00 24/10/2026");
  });
});

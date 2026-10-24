// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Form theo bước dựng từ đúng BPMN của các gói trong thu-tuc/ (đọc formProperty như bộ nạp gói), nên
// đổi BPMN mà quên web thì test này báo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { kiemForm, taoBien, tomTat, truongCuaBuoc, type BienTheoBuoc } from "./form-buoc";

/** Giống kiem_bpmn.buoc_nguoi_xu_ly (Python): {userTask: {biến: {kieu, bat_buoc, ten}}}. */
function docBpmn(goi: string): BienTheoBuoc {
  const xml = readFileSync(join(__dirname, "../../../../../thu-tuc", goi, "quy-trinh.bpmn20.xml"), "utf8");
  const kq: BienTheoBuoc = {};
  for (const m of xml.matchAll(/<userTask id="([^"]+)"[\s\S]*?<\/userTask>/g)) {
    kq[m[1]] = {};
    for (const fp of m[0].matchAll(/<flowable:formProperty ([^>]*)\/>/g)) {
      const thuoc = Object.fromEntries([...fp[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
      kq[m[1]][thuoc.id] = { kieu: thuoc.type ?? "string", bat_buoc: thuoc.required === "true", ten: thuoc.name };
    }
  }
  return kq;
}

const KS01 = docBpmn("khai-sinh");
const CT01 = docBpmn("chung-thuc-ban-sao");

describe("form xử lý bước sinh từ formProperty", () => {
  it("KS01 tiếp nhận: câu hỏi có/không bắt buộc trước, ghi chú sau, nhãn tiếng Việt", () => {
    expect(truongCuaBuoc(KS01, "tiep_nhan")).toEqual([
      { ma: "hopLe", nhan: "Đủ thành phần hồ sơ?", kieu: "boolean", batBuoc: true },
      { ma: "ghiChu", nhan: "Ghi chú", kieu: "string", batBuoc: false },
    ]);
    expect(truongCuaBuoc(KS01, "tham_dinh")?.map((t) => t.ma)).toEqual(["datYeuCau", "ghiChu"]);
    expect(truongCuaBuoc(KS01, "phe_duyet")?.map((t) => t.ma)).toEqual(["pheDuyet", "ghiChu"]);
  });

  it("CT01: số bắt buộc ở bước trả kết quả; số không bắt buộc ở bước kiểm tra", () => {
    expect(truongCuaBuoc(CT01, "tra_ket_qua")?.[0]).toEqual({ ma: "soBan", nhan: "Số bản đã chứng thực", kieu: "long", batBuoc: true });
    expect(truongCuaBuoc(CT01, "kiem_tra_ban_chinh")?.map((t) => [t.ma, t.batBuoc])).toEqual([
      ["khopBanChinh", true],
      ["soTrang", false],
      ["ghiChu", false],
    ]);
  });

  it("bước không khai trong gói → null (không xử lý qua cổng); gói cũ thiếu nhãn → dùng mã biến", () => {
    expect(truongCuaBuoc(KS01, "khong_co")).toBeNull();
    expect(truongCuaBuoc(null, "tiep_nhan")).toBeNull();
    expect(truongCuaBuoc({ b: { hopLe: { kieu: "boolean", bat_buoc: true } } }, "b")?.[0].nhan).toBe("hopLe");
    expect(truongCuaBuoc({ b: { x: { kieu: "date", bat_buoc: false } } }, "b")).toEqual([]);
  });

  it("thiếu lựa chọn bắt buộc, số sai → lỗi tiếng Việt; trường không bắt buộc để trống thì không lỗi", () => {
    const t = truongCuaBuoc(CT01, "kiem_tra_ban_chinh")!;
    expect(kiemForm(t, { khopBanChinh: "", soTrang: "", ghiChu: "" })).toEqual({
      khopBanChinh: "Chọn Có hoặc Không cho “Bản sao khớp bản chính?”",
    });
    expect(kiemForm(t, { khopBanChinh: "co", soTrang: "-2", ghiChu: "" })).toEqual({
      soTrang: "“Số trang của một bản” phải là số nguyên không âm",
    });
    expect(kiemForm(t, { khopBanChinh: "co", soTrang: "2.5" }).soTrang).toBeDefined();
    expect(kiemForm(truongCuaBuoc(CT01, "tra_ket_qua")!, { soBan: "  " })).toEqual({ soBan: "Nhập “Số bản đã chứng thực”" });
    expect(kiemForm(t, { khopBanChinh: "khong", soTrang: "", ghiChu: "x".repeat(2001) }).ghiChu).toMatch(/tối đa 2000/);
  });

  it("biến gửi đúng kiểu JSON mà /workflow/tasks/{id}/complete nhận; bỏ trường trống", () => {
    const tn = truongCuaBuoc(KS01, "tiep_nhan")!;
    expect(taoBien(tn, { hopLe: "khong", ghiChu: " thiếu tờ khai " })).toEqual({ hopLe: false, ghiChu: "thiếu tờ khai" });
    expect(taoBien(tn, { hopLe: "co", ghiChu: "" })).toEqual({ hopLe: true });
    expect(taoBien(truongCuaBuoc(CT01, "tra_ket_qua")!, { soBan: "3", ghiChu: "" })).toEqual({ soBan: 3 });
    expect(tomTat(tn, { hopLe: false, ghiChu: "thiếu tờ khai" })).toBe("Đủ thành phần hồ sơ: Không · Ghi chú: thiếu tờ khai");
  });
});

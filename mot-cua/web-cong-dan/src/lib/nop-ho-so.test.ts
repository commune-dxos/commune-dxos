// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Poka-yoke phía trình duyệt (#53): thiếu thành phần bắt buộc theo JSON Schema của gói thì nopHoSo
// KHÔNG gửi request nào (fetch giả, đếm 0 lần); đủ thì gọi đúng thứ tự tạo hồ sơ → tải tệp → khởi tạo.
// Chạy với schema thật của KS01, CT01 (dữ liệu giả của cổng, khớp thu-tuc/*/) và một gói giả ZZ01.
import { beforeEach, describe, expect, it, vi } from "vitest";
import duLieuGia from "@/du-lieu-gia/thu-tuc.json";
import type { ThuTuc } from "./api";
import { docCauHinh } from "./cau-hinh";
import { LoiThieuThanhPhan, nopHoSo, tienDoMoi } from "./ho-so";

const cauHinh = docCauHinh({ VITE_GATEWAY_URL: "http://cong.vi.du:9080" });
const DS = duLieuGia as ThuTuc[];
const KS01 = DS.find((t) => t.ma === "KS01")!;
const CT01 = DS.find((t) => t.ma === "CT01")!;
/** Gói thủ tục giả chỉ có trong test: bộ nộp không biết trước mã thành phần nào. */
const ZZ01: Pick<ThuTuc, "id" | "json_schema"> = {
  id: "00000000-0000-4000-8000-0000000000f1",
  json_schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    required: ["thanh_phan"],
    properties: {
      thanh_phan: {
        type: "object",
        additionalProperties: false,
        required: ["don_de_nghi", "anh_the"],
        properties: {
          don_de_nghi: { title: "Đơn đề nghị", type: "array", items: { type: "string", format: "uuid" }, minItems: 1 },
          anh_the: { title: "Ảnh thẻ 3x4", type: "array", items: { type: "string", format: "uuid" }, minItems: 2 },
          ghi_chu_them: { title: "Giấy tờ khác", type: "array", items: { type: "string", format: "uuid" }, minItems: 0 },
        },
      },
    },
  } as ThuTuc["json_schema"],
};

const HO_SO = { id: "11111111-1111-4111-8111-111111111111", ma_ho_so: "HS20261023-000001", trang_thai: "moi", han_xu_ly: "2026-10-26" };
const NGUOI_NOP = { ho_ten_nguoi_nop: "Nguyễn Văn Mẫu", so_dien_thoai: "0900000001" };
const tep = (ten: string) => new File(["%PDF-1.4"], ten, { type: "application/pdf" });

let goi: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  goi = vi.fn<typeof fetch>(async (url) => {
    const u = String(url);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (u.includes("/api/ho_so")) return json(201, [HO_SO]);
    if (u.includes("/public/thanh_phan_yeu_cau")) return json(200, [{ id: "yc-1", ma: "to_khai" }, { id: "yc-2", ma: "ban_chinh" }]);
    if (u.includes("/files/ho-so/")) return json(201, { id: "t" });
    if (u.includes("/khoi-tao")) return json(201, { processInstanceId: "p1" });
    return json(404, {});
  });
});

/** Đường dẫn các lần gọi, id hồ sơ thay bằng {id}. */
const viec = () => goi.mock.calls.map(([url, init]) => `${init?.method} ${new URL(String(url)).pathname.replace(HO_SO.id, "{id}")}`);

describe("Poka-yoke trước khi gửi: thiếu thành phần bắt buộc thì không gửi request nào", () => {
  const ca: [string, Pick<ThuTuc, "id" | "json_schema">, Record<string, File[]>, string[]][] = [
    ["KS01 không có tệp nào", KS01, {}, ["to_khai", "giay_chung_sinh", "giay_to_tuy_than"]],
    ["KS01 thiếu giấy chứng sinh", KS01, { to_khai: [tep("a.pdf")], giay_to_tuy_than: [tep("b.pdf")] }, ["giay_chung_sinh"]],
    ["KS01 chỉ có giấy tờ 'nếu có'", KS01, { giay_ket_hon_cha_me: [tep("kh.pdf")] }, ["to_khai", "giay_chung_sinh", "giay_to_tuy_than"]],
    ["CT01 thiếu bản chính (chỉ có bản sao)", CT01, { ban_sao: [tep("sao.pdf")] }, ["ban_chinh"]],
    ["gói giả ZZ01 thiếu một ảnh thẻ (minItems 2)", ZZ01, { don_de_nghi: [tep("d.pdf")], anh_the: [tep("1.pdf")] }, ["anh_the"]],
  ];
  it.each(ca)("%s → LoiThieuThanhPhan, fetch 0 lần", async (_, thuTuc, tepDaChon, thieu) => {
    const tienDo = tienDoMoi();
    const loi = await nopHoSo("tk", thuTuc, NGUOI_NOP, tepDaChon, tienDo, cauHinh, goi).catch((e: unknown) => e);
    expect(loi).toBeInstanceOf(LoiThieuThanhPhan);
    expect(Object.keys((loi as LoiThieuThanhPhan).thanhPhan)).toEqual(thieu);
    expect(goi).toHaveBeenCalledTimes(0);
    expect(tienDo.hoSo).toBeNull();
  });
});

describe("đủ thành phần thì gọi đúng thứ tự 3 bước", () => {
  it("KS01: tạo hồ sơ → tải 3 tệp đúng thành phần → khởi tạo quy trình", async () => {
    const hs = await nopHoSo("tk", KS01, NGUOI_NOP,
      { to_khai: [tep("tk.pdf")], giay_chung_sinh: [tep("cs.pdf")], giay_to_tuy_than: [tep("tt.pdf")] }, tienDoMoi(), cauHinh, goi);
    expect(hs.ma_ho_so).toBe(HO_SO.ma_ho_so);
    expect(viec()).toEqual([
      "POST /api/ho_so",
      "GET /public/thanh_phan_yeu_cau",
      "POST /files/ho-so/{id}/tep",
      "POST /files/ho-so/{id}/tep",
      "POST /files/ho-so/{id}/tep",
      "POST /workflow/ho-so/{id}/khoi-tao",
    ]);
    const tk = new URL(String(goi.mock.calls[2][0]));
    expect([tk.searchParams.get("ten"), tk.searchParams.get("thanh_phan_yeu_cau_id")]).toEqual(["tk.pdf", "yc-1"]);
  });

  it("CT01: bản chính (bắt buộc) đủ, bản sao không có → tạo, tải 1 tệp, khởi tạo", async () => {
    await nopHoSo("tk", CT01, NGUOI_NOP, { ban_chinh: [tep("bc.pdf")] }, tienDoMoi(), cauHinh, goi);
    expect(viec()).toEqual([
      "POST /api/ho_so", "GET /public/thanh_phan_yeu_cau", "POST /files/ho-so/{id}/tep", "POST /workflow/ho-so/{id}/khoi-tao",
    ]);
    expect(new URL(String(goi.mock.calls[2][0])).searchParams.get("thanh_phan_yeu_cau_id")).toBe("yc-2");
  });

  it("gói giả ZZ01 đủ 2 ảnh thẻ → tải 3 tệp, khởi tạo (không sửa mã nộp)", async () => {
    await nopHoSo("tk", ZZ01, NGUOI_NOP, { don_de_nghi: [tep("d.pdf")], anh_the: [tep("1.pdf"), tep("2.pdf")] }, tienDoMoi(), cauHinh, goi);
    expect(viec().filter((v) => v.startsWith("POST"))).toEqual([
      "POST /api/ho_so", "POST /files/ho-so/{id}/tep", "POST /files/ho-so/{id}/tep", "POST /files/ho-so/{id}/tep",
      "POST /workflow/ho-so/{id}/khoi-tao",
    ]);
  });

  it("máy chủ vẫn từ chối (422, lớp thứ hai) thì báo câu của máy chủ, giữ hồ sơ đã tạo", async () => {
    goi.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/khoi-tao"))
        return new Response(JSON.stringify({ loi: "Hồ sơ chưa đủ thành phần: Bản chính giấy tờ cần chứng thực" }), { status: 422 });
      if (u.includes("/api/ho_so")) return new Response(JSON.stringify([HO_SO]), { status: 201 });
      return new Response(JSON.stringify([]), { status: 201 });
    });
    const tienDo = tienDoMoi();
    await expect(nopHoSo("tk", CT01, NGUOI_NOP, { ban_chinh: [tep("bc.pdf")] }, tienDo, cauHinh, goi)).rejects.toThrow(
      "Hồ sơ chưa đủ thành phần: Bản chính giấy tờ cần chứng thực",
    );
    expect(tienDo.hoSo?.id).toBe(HO_SO.id);
    expect(tienDo.daKhoiTao).toBe(false);
  });
});

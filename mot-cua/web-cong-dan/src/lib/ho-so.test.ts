// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from "vitest";
import { LoiApi } from "./api";
import { docCauHinh } from "./cau-hinh";
import { khoiTaoQuyTrinh, loaiTheoDuoi, taiTep, taoHoSo } from "./ho-so";

const cauHinh = docCauHinh({ VITE_GATEWAY_URL: "http://cong.vi.du:9080" });
const traVe = (status: number, body: unknown) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("nộp hồ sơ qua APISIX", () => {
  it("tạo hồ sơ qua /api/ho_so bằng token công dân, chỉ gửi cột được nhập", async () => {
    const goi = traVe(201, [{ id: "1", ma_ho_so: "HS20261023-000001", trang_thai: "moi", han_xu_ly: "2026-10-26" }]);
    const hs = await taoHoSo("tk", { thu_tuc_id: "t", ho_ten_nguoi_nop: "A", so_dien_thoai: "0900000001" }, cauHinh, goi);
    expect(hs.ma_ho_so).toBe("HS20261023-000001");
    const [url, init] = goi.mock.calls[0];
    expect(String(url)).toMatch(/^http:\/\/cong\.vi\.du:9080\/api\/ho_so\?select=/);
    expect(init?.method).toBe("POST");
    const h = new Headers(init?.headers);
    expect(h.get("Authorization")).toBe("Bearer tk");
    expect(h.get("Prefer")).toBe("return=representation");
  });

  it("tải tệp: tên và thành phần trong query, Content-Type theo đuôi", async () => {
    const goi = traVe(201, { id: "t1" });
    await taiTep("tk", "hs-1", new File(["x"], "Giấy khai sinh.JPEG"), "yc-1", cauHinh, goi);
    const [url, init] = goi.mock.calls[0];
    const u = new URL(String(url));
    expect(u.pathname).toBe("/files/ho-so/hs-1/tep");
    expect(u.searchParams.get("ten")).toBe("Giấy khai sinh.JPEG");
    expect(u.searchParams.get("thanh_phan_yeu_cau_id")).toBe("yc-1");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("image/jpeg");
  });

  it("đuôi tệp nhận được khớp mot-cua-api", () => {
    expect(["a.pdf", "a.png", "a.jpg", "a.jpeg", "a.docx"].map(loaiTheoDuoi)).toEqual([
      "application/pdf", "image/png", "image/jpeg", "image/jpeg", null,
    ]);
  });

  it("lỗi 4xx của mot-cua-api hiện câu tiếng Việt của máy chủ; 401 nhắc đăng nhập lại", async () => {
    await expect(taiTep("tk", "hs", new File(["x"], "a.png"), undefined, cauHinh, traVe(422, { loi: "Tệp chứa mã độc, đã từ chối và không lưu" })))
      .rejects.toThrow("Tệp chứa mã độc");
    await expect(taiTep("tk", "hs", new File(["x"], "a.png"), undefined, cauHinh, traVe(401, {})))
      .rejects.toThrow(/đăng nhập lại/);
  });

  it("khởi tạo lại khi đã có quy trình (409) coi là xong", async () => {
    await expect(khoiTaoQuyTrinh("tk", "hs", cauHinh, traVe(409, { loi: "Hồ sơ đã có quy trình" }))).resolves.toBeUndefined();
    await expect(khoiTaoQuyTrinh("tk", "hs", cauHinh, traVe(502, {}))).rejects.toBeInstanceOf(LoiApi);
  });

  it("chế độ dữ liệu giả không gọi mạng và báo không nộp được", async () => {
    const goi = vi.fn<typeof fetch>();
    await expect(
      taoHoSo("tk", { thu_tuc_id: "t", ho_ten_nguoi_nop: "A", so_dien_thoai: "0" }, { ...cauHinh, duLieuGia: true }, goi),
    ).rejects.toThrow(/dữ liệu giả/);
    expect(goi).not.toHaveBeenCalled();
  });
});

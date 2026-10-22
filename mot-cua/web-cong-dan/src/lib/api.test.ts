// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from "vitest";
import duLieuGia from "@/du-lieu-gia/thu-tuc.json";
import { DUONG_DAN_DANH_MUC, layDanhMucThuTuc, LoiApi } from "./api";
import { docCauHinh } from "./cau-hinh";

const cauHinh = docCauHinh({ VITE_GATEWAY_URL: "http://cong.vi.du:9080/" });

function traVe(status: number, body: unknown) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("layDanhMucThuTuc", () => {
  it("gọi /public/thu_tuc qua APISIX, không gửi token", async () => {
    const goi = traVe(200, duLieuGia);
    const ds = await layDanhMucThuTuc(cauHinh, goi);
    expect(ds.map((t) => t.ma)).toEqual(["CT01", "KS01"]);
    expect(goi).toHaveBeenCalledOnce();
    const [url, init] = goi.mock.calls[0];
    expect(url).toBe("http://cong.vi.du:9080" + DUONG_DAN_DANH_MUC);
    expect(String(url)).toMatch(/^http:\/\/cong\.vi\.du:9080\/public\/thu_tuc\?select=/);
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  });

  it("chỉ lấy cột cần hiển thị, kèm lĩnh vực, xếp theo mã", () => {
    const q = new URL("http://x" + DUONG_DAN_DANH_MUC).searchParams;
    expect(q.get("select")?.split(",")).toEqual([
      "id", "ma", "ten", "so_ngay_xu_ly", "le_phi", "ghi_chu_le_phi", "quy_trinh", "linh_vuc:linh_vuc_id(ma",
      "ten)",
    ]);
    expect(q.get("order")).toBe("ma");
  });

  it("429 → báo đợi một phút", async () => {
    const loi = await layDanhMucThuTuc(cauHinh, traVe(429, { loi: "x" })).catch((e) => e);
    expect(loi).toBeInstanceOf(LoiApi);
    expect(loi.trangThai).toBe(429);
    expect(loi.message).toMatch(/đợi một phút/);
  });

  it("5xx → báo hệ thống bận", async () => {
    await expect(layDanhMucThuTuc(cauHinh, traVe(502, {}))).rejects.toThrow(/đang bận/);
  });

  it("mất mạng → báo kiểm tra mạng", async () => {
    const goi = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(layDanhMucThuTuc(cauHinh, goi)).rejects.toThrow(/kiểm tra mạng/);
  });

  it("chế độ dữ liệu giả không gọi mạng", async () => {
    const goi = vi.fn<typeof fetch>();
    const ds = await layDanhMucThuTuc({ ...cauHinh, duLieuGia: true }, goi);
    expect(ds).toHaveLength(2);
    expect(goi).not.toHaveBeenCalled();
  });
});

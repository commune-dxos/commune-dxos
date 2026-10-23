// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from "vitest";
import { LoiApi } from "./api";
import { docCauHinh } from "./cau-hinh";
import { type GiayToKy, phatHanhGiayTo, taiVe, tenTepGiayTo } from "./giay-to";

const cauHinh = docCauHinh({ VITE_GATEWAY_URL: "http://cong.vi.du:9080" });
const GIAY_TO: GiayToKy = {
  id: "g1", loai: "bien_nhan", sha256: "a".repeat(64), kich_thuoc: 1234, chung_thu_ten: "UBND xã Mẫu",
  ky_luc: "2026-10-23T01:00:00Z", maHoSo: "HS20261023-000001", link: "http://cong.vi.du:9080/files/s3/x?X-Amz-Signature=y",
  hetHanLuc: "2026-10-23T01:05:00Z",
};

describe("phatHanhGiayTo", () => {
  it("POST /files/ho-so/{id}/giay-to/{loai} qua APISIX kèm token", async () => {
    const goi = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(GIAY_TO), { status: 201 }));
    const g = await phatHanhGiayTo("tk", "11111111-1111-4111-8111-111111111111", "bien_nhan", cauHinh, goi);
    expect(g.link).toBe(GIAY_TO.link);
    const [url, init] = goi.mock.calls[0];
    expect(url).toBe("http://cong.vi.du:9080/files/ho-so/11111111-1111-4111-8111-111111111111/giay-to/bien_nhan");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer tk");
  });

  it("409 → câu tiếng Việt của mot-cua-api", async () => {
    const goi = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ loi: "Hồ sơ chưa hoàn tất, chưa có kết quả" }), { status: 409 }));
    const loi = await phatHanhGiayTo("tk", "h", "ket_qua", cauHinh, goi).catch((e: unknown) => e);
    expect(loi).toBeInstanceOf(LoiApi);
    expect((loi as LoiApi).message).toBe("Hồ sơ chưa hoàn tất, chưa có kết quả");
  });
});

describe("taiVe", () => {
  it("tải bằng <a download> với tên tệp theo loại và mã hồ sơ", () => {
    const tai = vi.fn<(a: HTMLAnchorElement) => void>();
    taiVe(GIAY_TO, tai);
    const a = tai.mock.calls[0][0];
    expect(a.href).toBe(GIAY_TO.link);
    expect(a.download).toBe("bien-nhan-HS20261023-000001.pdf");
    expect(tenTepGiayTo({ loai: "ket_qua", maHoSo: "HS1" })).toBe("ket-qua-HS1.pdf");
  });
});

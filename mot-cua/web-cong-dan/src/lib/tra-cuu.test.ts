// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Lớp gọi API tra cứu (#54): đường dẫn qua APISIX, kiểm ô nhập, lọc bước bổ sung của đúng hồ sơ.
import { describe, expect, it, vi } from "vitest";
import type { CauHinh } from "./cau-hinh";
import { ngay } from "./dinh-dang";
import { ngayGio } from "./han";
import { ApiHoSoCongDan, kiemNhapTraCuu, traCuuCongKhai } from "./tra-cuu";

const CH = { gatewayUrl: "http://gw", duLieuGia: false } as CauHinh;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("kiemNhapTraCuu", () => {
  it("nhận mã viết thường, thừa khoảng trắng; 4 số cuối đúng 4 chữ số", () => {
    expect(kiemNhapTraCuu(" hs20261024-000123 ", "1234")).toEqual({});
    expect(kiemNhapTraCuu("123", "12")).toHaveProperty("ma");
    expect(kiemNhapTraCuu("HS20261024-000123", "12a4")).toHaveProperty("soCuoi");
  });
});

describe("traCuuCongKhai", () => {
  it("gọi /public/rpc/tra_cuu_ho_so không token, mã viết hoa; không thấy → null", async () => {
    const goi = vi.fn<typeof fetch>(() => Promise.resolve(json(null)));
    await expect(traCuuCongKhai("hs20261024-000123", "1234", CH, goi)).resolves.toBeNull();
    const [url, init] = goi.mock.calls[0];
    expect(url).toBe("http://gw/public/rpc/tra_cuu_ho_so?p_ma=HS20261024-000123&p_so_cuoi=1234");
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  });

  it("vượt giới hạn tần suất → câu tiếng Việt", async () => {
    const goi = vi.fn<typeof fetch>(() => Promise.resolve(json({}, 429)));
    await expect(traCuuCongKhai("HS20261024-000123", "1234", CH, goi)).rejects.toThrow(/quá nhiều lượt/);
  });
});

describe("ApiHoSoCongDan", () => {
  it("danh sách đọc /api/ho_so bằng token, mới nhất trước", async () => {
    const goi = vi.fn<typeof fetch>(() => Promise.resolve(json([])));
    await new ApiHoSoCongDan("tk", CH, goi).danhSach();
    const [url, init] = goi.mock.calls[0];
    expect(String(url)).toMatch(/^http:\/\/gw\/api\/ho_so\?select=.*&order=ngay_nhan\.desc$/);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer tk");
  });

  it("bước bổ sung: chỉ lấy task bo_sung của đúng hồ sơ; nộp lại gửi ghi chú nếu có", async () => {
    const goi = vi.fn<typeof fetch>((u) =>
      Promise.resolve(
        String(u).endsWith("/workflow/tasks")
          ? json([
              { id: "t1", buoc: "bo_sung", ten: "Bổ sung", hoSoId: "khac" },
              { id: "t2", buoc: "bo_sung", ten: "Bổ sung", hoSoId: "hs1" },
            ])
          : json({ trangThai: "dang_xu_ly" }),
      ),
    );
    const api = new ApiHoSoCongDan("tk", CH, goi);
    expect((await api.taskBoSung("hs1"))?.id).toBe("t2");
    expect(await api.taskBoSung("khong-co")).toBeNull();
    await api.nopLai("t2", "  Đã thêm giấy chứng sinh ");
    const [url, init] = goi.mock.calls.at(-1)!;
    expect(url).toBe("http://gw/workflow/tasks/t2/complete");
    expect(JSON.parse(String(init?.body))).toEqual({ bien: { ghiChu: "Đã thêm giấy chứng sinh" } });
    await api.nopLai("t2", "  ");
    expect(JSON.parse(String(goi.mock.calls.at(-1)![1]?.body))).toEqual({ bien: {} });
  });
});

describe("định dạng ngày", () => {
  it("ngày hạn dd/mm/yyyy không đổi múi giờ; mốc giờ theo giờ Việt Nam", () => {
    expect(ngay("2026-10-26")).toBe("26/10/2026");
    expect(ngayGio(new Date("2026-10-20T17:30:00Z"))).toBe("00:30 21/10/2026");
  });
});

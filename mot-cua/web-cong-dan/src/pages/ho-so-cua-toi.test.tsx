// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Tra cứu và Hồ sơ của tôi (#54): form tra cứu không gửi request khi nhập sai, kết quả hiện các bước;
// danh sách hồ sơ; chi tiết hồ sơ chờ bổ sung hiện yêu cầu và nộp lại qua /workflow; chưa đăng nhập
// thì mời đăng nhập. API giả bằng fetch.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User, UserManager } from "oidc-client-ts";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XacThucProvider } from "@/auth/xac-thuc";
import type { KetQuaTraCuu } from "@/lib/tra-cuu";
import { ChiTietHoSoCongDan, HoSoCuaToiTrang } from "./ho-so-cua-toi";
import { TraCuu } from "./tra-cuu";

function quanLyGia(nguoiDung: Partial<User> | null) {
  const suKien = { addUserLoaded: vi.fn(), addUserUnloaded: vi.fn(), addUserSignedOut: vi.fn(), removeUserLoaded: vi.fn(), removeUserUnloaded: vi.fn(), removeUserSignedOut: vi.fn() };
  return { getUser: () => Promise.resolve(nguoiDung), events: suKien, signinRedirect: vi.fn() } as unknown as UserManager;
}
const CONG_DAN = { profile: { sub: "c1", name: "Nguyễn Văn Mẫu" } as User["profile"], access_token: "token-gia", expired: false };

function ve(duong: string, nguoiDung: Partial<User> | null = CONG_DAN, traCuu?: Parameters<typeof TraCuu>[0]["traCuu"]) {
  return render(
    <XacThucProvider quanLy={quanLyGia(nguoiDung)}>
      <MemoryRouter initialEntries={[duong]}>
        <Routes>
          <Route path="/tra-cuu" element={<TraCuu traCuu={traCuu} />} />
          <Route path="/ho-so" element={<HoSoCuaToiTrang />} />
          <Route path="/ho-so/:id" element={<ChiTietHoSoCongDan />} />
        </Routes>
      </MemoryRouter>
    </XacThucProvider>,
  );
}

const ID = "11111111-1111-4111-8111-111111111111";
const THU_TUC = { id: "22222222-2222-4222-8222-222222222222", ma: "KS01", ten: "Đăng ký khai sinh", so_ngay_xu_ly: 1, json_schema: {
  properties: { thanh_phan: { type: "object", required: ["giay_chung_sinh"], properties: { giay_chung_sinh: { title: "Giấy chứng sinh", type: "array", minItems: 1 } } } },
} };
const HO_SO = (trang_thai: string, ly_do: string | null = null) => ({
  id: ID, ma_ho_so: "HS20261024-000123", trang_thai, ngay_nhan: "2026-10-24T01:00:00Z", han_xu_ly: "2099-10-27",
  ngay_hoan_tat: null, ly_do, thu_tuc: THU_TUC,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let goi: ReturnType<typeof vi.fn<typeof fetch>>;
let hoSo = HO_SO("cho_bo_sung", "Ảnh giấy chứng sinh bị mờ");

beforeEach(() => {
  hoSo = HO_SO("cho_bo_sung", "Ảnh giấy chứng sinh bị mờ");
  goi = vi.fn<typeof fetch>((u, init) => {
    const url = String(u);
    const m = init?.method ?? "GET";
    if (url.includes("/api/ho_so?id=eq.")) return Promise.resolve(json(url.includes(ID) ? [hoSo] : []));
    if (url.includes("/api/ho_so?")) return Promise.resolve(json([hoSo, { ...HO_SO("hoan_tat"), id: "x2", ma_ho_so: "HS20261020-000001", ngay_hoan_tat: "2026-10-21T02:00:00Z" }]));
    if (url.includes("/api/lich_su_trang_thai")) {
      return Promise.resolve(json([
        { den_trang_thai: "moi", ly_do: null, luc: "2026-10-24T01:00:00Z" },
        { den_trang_thai: "cho_bo_sung", ly_do: hoSo.ly_do, luc: "2026-10-24T02:00:00Z" },
      ]));
    }
    if (url.includes("/tien-do")) {
      return Promise.resolve(json({ quyTrinh: [{ processInstanceId: "p", ketThuc: null, buocDangMo: [{ id: "t9", buoc: "bo_sung", ten: "Công dân bổ sung hồ sơ" }],
        lichSu: [{ buoc: "tiep_nhan", ten: "Tiếp nhận hồ sơ", batDau: "2026-10-24T01:00:00Z", ketThuc: "2026-10-24T02:00:00Z" }] }] }));
    }
    if (url.includes("/files/ho-so/") && url.endsWith("/tep")) return Promise.resolve(json([{ id: "f1", thanh_phan_yeu_cau_id: "yc1", ten_tep: "chung-sinh.png", loai_mime: "image/png", kich_thuoc: 2048, ket_qua_quet: "sach", created_at: "2026-10-24T01:00:00Z" }]));
    if (url.includes("/public/thanh_phan_yeu_cau")) return Promise.resolve(json([{ id: "yc1", ma: "giay_chung_sinh" }]));
    if (url.includes("/files/ho-so/") && m === "POST") return Promise.resolve(json({ id: "f2" }, 201));
    if (url.endsWith("/workflow/tasks")) return Promise.resolve(json([{ id: "t9", buoc: "bo_sung", ten: "Bổ sung", hoSoId: ID }]));
    if (url.includes("/workflow/tasks/t9/complete")) {
      hoSo = HO_SO("dang_xu_ly");
      return Promise.resolve(json({ id: "t9", buoc: "bo_sung", trangThai: "dang_xu_ly" }));
    }
    return Promise.resolve(json({ loi: `không giả ${url}` }, 404));
  });
  vi.stubGlobal("fetch", goi);
});
afterEach(() => vi.unstubAllGlobals());

describe("Tra cứu không cần đăng nhập", () => {
  it("nhập sai thì báo ngay ở ô, không gửi request", async () => {
    const traCuu = vi.fn();
    ve("/tra-cuu", null, traCuu);
    await userEvent.type(screen.getByLabelText("Mã hồ sơ"), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Tra cứu" }));
    expect(screen.getByText(/Nhập mã hồ sơ in trên biên nhận/)).toBeInTheDocument();
    expect(screen.getByText(/Nhập đúng 4 chữ số cuối/)).toBeInTheDocument();
    expect(traCuu).not.toHaveBeenCalled();
  });

  it("đúng mã + 4 số: hiện trạng thái, bước đang chờ bổ sung, mời đăng nhập để nộp bổ sung", async () => {
    const kq: KetQuaTraCuu = {
      ma_ho_so: "HS20261024-000123", thu_tuc: { ma: "KS01", ten: "Đăng ký khai sinh" }, trang_thai: "cho_bo_sung",
      ngay_nhan: "2026-10-24T01:00:00Z", han_xu_ly: "2099-10-27", ngay_hoan_tat: null,
      lich_su: [{ trang_thai: "moi", luc: "2026-10-24T01:00:00Z" }, { trang_thai: "cho_bo_sung", luc: "2026-10-24T02:00:00Z" }],
    };
    const traCuu = vi.fn(() => Promise.resolve(kq));
    ve("/tra-cuu?ma=hs20261024-000123", null, traCuu);
    await userEvent.type(screen.getByLabelText("4 số cuối số điện thoại"), "12ab34");
    await userEvent.click(screen.getByRole("button", { name: "Tra cứu" }));
    expect(traCuu).toHaveBeenCalledWith("hs20261024-000123", "1234");
    expect(await screen.findByRole("heading", { name: "HS20261024-000123" })).toBeInTheDocument();
    const buoc = screen.getByRole("list", { name: "Các bước giải quyết" });
    expect(within(buoc).getByText("Tiếp nhận, kiểm tra giấy tờ").closest("li")).toHaveAttribute("data-trang", "can_bo_sung");
    expect(screen.getByRole("button", { name: /Đăng nhập để xem giấy tờ/ })).toBeInTheDocument();
  });

  it("không thấy → một câu chung cho sai mã hay sai số", async () => {
    ve("/tra-cuu?ma=HS20261024-000999", null, () => Promise.resolve(null));
    await userEvent.type(screen.getByLabelText("4 số cuối số điện thoại"), "0000");
    await userEvent.click(screen.getByRole("button", { name: "Tra cứu" }));
    expect(await screen.findByText("Không tìm thấy hồ sơ khớp mã và số điện thoại")).toBeInTheDocument();
  });
});

describe("Hồ sơ của tôi", () => {
  it("chưa đăng nhập → mời đăng nhập, không gọi API", async () => {
    ve("/ho-so", null);
    expect(await screen.findByRole("heading", { name: "Đăng nhập để xem hồ sơ của bạn" })).toBeInTheDocument();
    expect(goi).not.toHaveBeenCalled();
  });

  it("danh sách: hồ sơ của mình kèm trạng thái, hạn, lý do bổ sung", async () => {
    ve("/ho-so");
    const ds = await screen.findByRole("list", { name: "Hồ sơ đã nộp" });
    expect(within(ds).getAllByRole("listitem")).toHaveLength(2);
    expect(within(ds).getByText("Cần bổ sung: Ảnh giấy chứng sinh bị mờ")).toBeInTheDocument();
    expect(within(ds).getByText("Hoàn tất")).toBeInTheDocument();
    expect(String(goi.mock.calls[0][0])).toMatch(/\/api\/ho_so\?select=.*order=ngay_nhan\.desc/);
    expect(new Headers(goi.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer token-gia");
  });

  it("chi tiết chờ bổ sung: thấy yêu cầu, bước đang mở, tải thêm tệp rồi nộp lại → đang xử lý", async () => {
    ve(`/ho-so/${ID}`);
    expect(await screen.findByText("Yêu cầu của bộ phận một cửa")).toBeInTheDocument();
    expect(screen.getAllByText("Ảnh giấy chứng sinh bị mờ").length).toBeGreaterThan(0);
    expect(screen.getByText("Công dân bổ sung hồ sơ")).toBeInTheDocument();
    expect(screen.getByText(/Tiếp nhận hồ sơ · xong/)).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Tệp đã nộp cho Giấy chứng sinh" })).toHaveTextContent("chung-sinh.png");

    await userEvent.upload(screen.getByLabelText(/Tải thêm tệp\s+cho Giấy chứng sinh/), new File(["moi"], "chung-sinh-ro.png", { type: "image/png" }));
    expect(await screen.findByText(/Đã tải 1 tệp/)).toBeInTheDocument();
    const tai = goi.mock.calls.find(([u, i]) => String(u).includes(`/files/ho-so/${ID}/tep?`) && i?.method === "POST");
    expect(String(tai?.[0])).toContain("thanh_phan_yeu_cau_id=yc1");

    await userEvent.type(screen.getByLabelText(/Ghi chú cho cán bộ/), "Đã chụp lại");
    await userEvent.click(screen.getByRole("button", { name: "Nộp lại hồ sơ" }));
    expect(await screen.findByText("Đã nộp lại hồ sơ. Bộ phận một cửa sẽ kiểm tra lại giấy tờ.")).toBeInTheDocument();
    const xong = goi.mock.calls.find(([u]) => String(u).includes("/workflow/tasks/t9/complete"));
    expect(JSON.parse(String(xong?.[1]?.body))).toEqual({ bien: { ghiChu: "Đã chụp lại" } });
    expect(await screen.findByText("Đang xử lý")).toBeInTheDocument();
  });

  it("hồ sơ không phải của mình (RLS trả rỗng) → Không thấy hồ sơ", async () => {
    ve("/ho-so/33333333-3333-4333-8333-333333333333");
    expect(await screen.findByRole("heading", { name: "Không thấy hồ sơ" })).toBeInTheDocument();
  });
});

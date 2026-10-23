// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Cổng cán bộ (#55) với đăng nhập giả và API giả bằng fetch: cổng vào theo vai trò, hộp việc (hạn,
// lọc), chi tiết hồ sơ, form xử lý bước sinh từ biến của bước (không gửi khi thiếu, gửi đúng kiểu,
// báo lỗi quyền của máy chủ).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User, UserManager } from "oidc-client-ts";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CongCanBo from "./cong-can-bo";
import type { BienTheoBuoc } from "./lib/form-buoc";
import { hoSoGia, jwtGia, taskGia } from "./test/gia";

function quanLyGia(nguoiDung: Partial<User> | null) {
  const suKien = { addUserLoaded: vi.fn(), addUserUnloaded: vi.fn(), addUserSignedOut: vi.fn(), removeUserLoaded: vi.fn(), removeUserUnloaded: vi.fn(), removeUserSignedOut: vi.fn() };
  return { getUser: () => Promise.resolve(nguoiDung), events: suKien, signinRedirect: vi.fn(), signoutRedirect: vi.fn() } as unknown as UserManager;
}

const SUB = "00000000-0000-0000-0000-00000000b001";
const nguoiDung = (roles: string[]): Partial<User> => ({
  profile: { sub: SUB, preferred_username: "canbo01", name: "Trần Thị Một Cửa" } as User["profile"],
  access_token: jwtGia({ sub: SUB, resource_access: { dxos_api: { roles } } }),
  expired: false,
});

function ve(duong: string, nd: Partial<User> | null) {
  return render(
    <MemoryRouter initialEntries={[duong]}>
      <Routes>
        <Route path="can-bo/*" element={<CongCanBo quanLy={quanLyGia(nd)} />} />
      </Routes>
    </MemoryRouter>,
  );
}

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const KS01: BienTheoBuoc = {
  tiep_nhan: {
    hopLe: { kieu: "boolean", bat_buoc: true, ten: "Đủ thành phần hồ sơ?" },
    ghiChu: { kieu: "string", bat_buoc: false, ten: "Ghi chú" },
  },
};
const HS = { ...hoSoGia(ID, "KS01", "Đăng ký khai sinh", "2026-10-23"), ma_ho_so: "HS20261023-000001" };
HS.thu_tuc!.bien_theo_buoc = KS01;
HS.thu_tuc!.linh_vuc = { ma: "ho_tich", ten: "Hộ tịch" };
const HS2 = { ...hoSoGia(ID2, "KS01", "Đăng ký khai sinh", "2026-10-30"), ma_ho_so: "HS20261023-000002", ho_ten_nguoi_nop: "Lê Thị Thử" };
const TASK = taskGia({ id: "33333333-3333-4333-8333-333333333333", hoSoId: ID, maHoSo: HS.ma_ho_so, hanXuLyLuc: "2026-10-22T17:00:00+07:00", quaHan: true });
const TASK2 = taskGia({ id: "44444444-4444-4444-8444-444444444444", hoSoId: ID2, maHoSo: HS2.ma_ho_so, hanXuLyLuc: "2099-10-30T17:00:00+07:00" });

let goi: ReturnType<typeof vi.fn<typeof fetch>>;
let traLoiHoanThanh: () => Response;

beforeEach(() => {
  traLoiHoanThanh = () => new Response(JSON.stringify({ id: TASK.id, buoc: "tiep_nhan", buocDangMo: [{ id: "x", buoc: "tham_dinh", ten: "Thẩm định hồ sơ" }] }), { status: 200 });
  goi = vi.fn<typeof fetch>(async (url, init) => {
    const u = String(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (u.endsWith("/workflow/tasks")) return json([TASK2, TASK]);
    // RLS giả: chỉ hai hồ sơ hộ tịch này là cán bộ đọc được.
    if (u.includes("/api/ho_so?id=in.")) return json([HS, HS2].filter((h) => u.includes(h.id)));
    if (u.includes("/api/can_bo")) return json([{ ho_ten: "Trần Thị Một Cửa", chuc_vu: "Công chức Tư pháp – Hộ tịch", linh_vuc: [{ ma: "ho_tich", ten: "Hộ tịch" }] }]);
    if (u.includes("/api/thanh_phan_yeu_cau")) return json([{ id: "yc1", ma: "to_khai", ten: "Tờ khai đăng ký khai sinh", bat_buoc: true, so_luong: 1 }]);
    if (u.includes(`/files/ho-so/${ID}/tep`))
      return json([{ id: "55555555-5555-4555-8555-555555555555", thanh_phan_yeu_cau_id: "yc1", ten_tep: "to-khai.pdf", loai_mime: "application/pdf", kich_thuoc: 2048, ket_qua_quet: "sach", created_at: "2026-10-22T02:00:00Z" }]);
    if (u.includes("/files/tep/")) return json({ link: "http://localhost:9080/files/s3/mot-cua-ho-so/x?X-Amz-Signature=gia", hetHanLuc: "2026-10-23T03:05:00+00:00" });
    if (u.includes(`/workflow/ho-so/${ID}/tien-do`))
      return json({ hoSo: HS, quyTrinh: [{ processInstanceId: "pi", quyTrinh: "dang_ky_khai_sinh", batDau: "2026-10-22T02:00:00Z", ketThuc: null, diemKetThuc: null, buocDangMo: [{ id: TASK.id, buoc: "tiep_nhan", ten: TASK.ten }], lichSu: [{ buoc: "tiep_nhan", ten: TASK.ten, batDau: "2026-10-22T02:00:00Z", ketThuc: null }] }] });
    if (u.includes("/complete") && init?.method === "POST") return traLoiHoanThanh();
    return json({ loi: "không có" }, 404);
  });
  vi.stubGlobal("fetch", goi);
});

afterEach(() => vi.unstubAllGlobals());

const goiTheo = (doan: string) => goi.mock.calls.filter(([u]) => String(u).includes(doan));

describe("cổng vào cổng cán bộ", () => {
  it("chưa đăng nhập: trang đăng nhập nói rõ cần mật khẩu + OTP, không gọi API", async () => {
    ve("/can-bo", null);
    expect(await screen.findByRole("heading", { level: 1, name: "Cổng cán bộ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(screen.getByText(/mật khẩu và mã OTP/)).toBeInTheDocument();
    expect(goi).not.toHaveBeenCalled();
  });

  it("công dân đăng nhập được Keycloak nhưng không có vai cán bộ → không có quyền, không gọi API", async () => {
    ve("/can-bo", nguoiDung(["cong_dan"]));
    expect(await screen.findByRole("heading", { level: 1, name: "Bạn không có quyền vào cổng cán bộ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Đăng xuất/ })).toBeInTheDocument();
    expect(goi).not.toHaveBeenCalled();
  });
});

describe("hộp việc", () => {
  it("cán bộ thấy task của lĩnh vực mình, hồ sơ quá hạn đứng đầu, có cảnh báo và chuông", async () => {
    ve("/can-bo", nguoiDung(["can_bo"]));
    expect(await screen.findByRole("heading", { level: 1, name: "Hộp việc" })).toBeInTheDocument();
    const bang = await screen.findByRole("table");
    const dong = within(bang).getAllByRole("row").slice(1);
    expect(dong.map((d) => within(d).getAllByRole("link")[0].textContent)).toEqual([HS.ma_ho_so, HS2.ma_ho_so]);
    expect(dong[0]).toHaveAttribute("data-muc-han", "qua_han");
    expect(dong[0].textContent).toMatch(/Quá hạn \d+ ngày/);
    expect(screen.getByText("1 hồ sơ quá hạn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thông báo: 1 hồ sơ cần chú ý về hạn" })).toBeInTheDocument();
    expect(await screen.findByText(/Lĩnh vực bạn phụ trách: Hộ tịch/i)).toBeInTheDocument();
    // Gọi đúng qua gateway với token của cán bộ.
    const [, init] = goiTheo("/workflow/tasks")[0];
    expect(new Headers(init?.headers).get("Authorization")).toMatch(/^Bearer /);
  });

  it("lọc theo hạn trên URL (?han=qua_han) chỉ còn hồ sơ quá hạn", async () => {
    ve("/can-bo?han=qua_han", nguoiDung(["can_bo"]));
    const bang = await screen.findByRole("table");
    await waitFor(() => expect(within(bang).getAllByRole("row")).toHaveLength(2));
    expect(within(bang).getByText(HS.ma_ho_so)).toBeInTheDocument();
    expect(screen.getByText(/1 hồ sơ \(lọc từ 2\)/)).toBeInTheDocument();
  });
});

describe("chi tiết và xử lý bước", () => {
  it("hiện người nộp, tệp (lấy link ký sẵn khi bấm), lịch sử; form sinh từ biến của bước", async () => {
    const u = userEvent.setup();
    ve(`/can-bo/ho-so/${ID}`, nguoiDung(["can_bo"]));
    expect(await screen.findByRole("heading", { level: 1, name: `Hồ sơ ${HS.ma_ho_so}` })).toBeInTheDocument();
    expect(screen.getByText(HS.ho_ten_nguoi_nop)).toBeInTheDocument();
    // Trạng thái đọc từ CSDL (ho_so.trang_thai, đi theo bước quy trình #73), cùng giá trị cổng công dân thấy.
    expect(screen.getByText("Trạng thái hồ sơ: Mới nộp, chờ tiếp nhận")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Tờ khai đăng ký khai sinh/ })).toBeInTheDocument();
    expect(goiTheo("/files/tep/")).toHaveLength(0);
    await u.click(screen.getByRole("button", { name: /Xem tệp to-khai.pdf/ }));
    expect(await screen.findByRole("link", { name: /Mở tệp/ })).toHaveAttribute("href", expect.stringContaining("/files/s3/"));
    expect(await screen.findByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getByText("Đủ thành phần hồ sơ?")).toBeInTheDocument();
    expect(screen.getByLabelText(/Ghi chú/)).toBeInTheDocument();
  });

  it("thiếu lựa chọn bắt buộc: báo lỗi, KHÔNG gọi API; chọn Không + ghi chú → gửi đúng biến và kiểu", async () => {
    const u = userEvent.setup();
    ve(`/can-bo/ho-so/${ID}`, nguoiDung(["can_bo"]));
    const nut = await screen.findByRole("button", { name: "Hoàn thành bước" });
    await u.click(nut);
    expect(screen.getByText("Chọn Có hoặc Không cho “Đủ thành phần hồ sơ?”")).toBeInTheDocument();
    expect(goiTheo("/complete")).toHaveLength(0);

    await u.click(screen.getByLabelText("Không"));
    await u.type(screen.getByLabelText(/Ghi chú/), "Thiếu giấy chứng sinh");
    await u.click(nut);
    await screen.findByText("Đã hoàn thành “Tiếp nhận, kiểm tra thành phần hồ sơ”");
    const [url, init] = goiTheo("/complete")[0];
    expect(String(url)).toBe(`http://localhost:9080/workflow/tasks/${TASK.id}/complete`);
    expect(JSON.parse(String(init?.body))).toEqual({ bien: { hopLe: false, ghiChu: "Thiếu giấy chứng sinh" } });
    expect(screen.getByText("Bước tiếp theo: Thẩm định hồ sơ.")).toBeInTheDocument();
  });

  it("máy chủ từ chối (403 sai nhóm) → hiện nguyên câu lỗi, không báo thành công", async () => {
    traLoiHoanThanh = () => new Response(JSON.stringify({ loi: "Không thuộc nhóm được giao task này" }), { status: 403 });
    const u = userEvent.setup();
    ve(`/can-bo/ho-so/${ID}`, nguoiDung(["can_bo"]));
    await u.click(await screen.findByLabelText("Có"));
    await u.click(screen.getByRole("button", { name: "Hoàn thành bước" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thuộc nhóm được giao task này");
    expect(screen.queryByText(/Đã hoàn thành/)).not.toBeInTheDocument();
  });

  it("hồ sơ RLS không cho xem (cán bộ lĩnh vực khác) → Không thấy hồ sơ, không có form", async () => {
    ve(`/can-bo/ho-so/${"66666666-6666-4666-8666-666666666666"}`, nguoiDung(["can_bo"]));
    expect(await screen.findByRole("heading", { level: 1, name: "Không thấy hồ sơ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hoàn thành bước" })).not.toBeInTheDocument();
  });
});

describe("tên người dùng", () => {
  it("lãnh đạo chưa có dòng can_bo: họ trước tên như tiếng Việt", async () => {
    const { tenNguoiDung, chuVietTat } = await import("./du-lieu");
    const nd = { profile: { sub: "x", given_name: "Văn Chủ Tịch", family_name: "Lê", name: "Văn Chủ Tịch Lê" } } as User;
    expect(tenNguoiDung(nd, null)).toBe("Lê Văn Chủ Tịch");
    expect(chuVietTat("Lê Văn Chủ Tịch")).toBe("CT");
    expect(tenNguoiDung(nd, { ho_ten: "Trần Thị Một Cửa", chuc_vu: "x", linh_vuc: [] })).toBe("Trần Thị Một Cửa");
  });
});

// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User, UserManager } from "oidc-client-ts";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CongCanBo from "./cong-can-bo";
import { duocGhi } from "./pages/wiki";
import { jwtGia } from "./test/gia";

function quanLyGia(nguoiDung: Partial<User>) {
  const suKien = { addUserLoaded: vi.fn(), addUserUnloaded: vi.fn(), addUserSignedOut: vi.fn(), removeUserLoaded: vi.fn(), removeUserUnloaded: vi.fn(), removeUserSignedOut: vi.fn() };
  return { getUser: () => Promise.resolve(nguoiDung), events: suKien, signinRedirect: vi.fn(), signoutRedirect: vi.fn() } as unknown as UserManager;
}
const nguoiDung = (roles: string[]): Partial<User> => ({
  profile: { sub: "sub-x", preferred_username: "x", name: "Người Thử" } as User["profile"],
  access_token: jwtGia({ sub: "sub-x", resource_access: { dxos_api: { roles } } }),
  expired: false,
});
function ve(duong: string, roles: string[]) {
  return render(
    <MemoryRouter initialEntries={[duong]}>
      <Routes>
        <Route path="can-bo/*" element={<CongCanBo quanLy={quanLyGia(nguoiDung(roles))} />} />
      </Routes>
    </MemoryRouter>,
  );
}

const ID = "11111111-1111-4111-8111-111111111111";
const LV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KQ = {
  id: ID, tieu_de: "Quy chế làm việc", loai: "quy_che", so_ky_hieu: "01/QC", ngay_ban_hanh: "2026-01-05", tom_tat: null,
  pham_vi: "toan_xa", linh_vuc_id: null, trang_thai: "hieu_luc", phien_ban: 2, sua_luc: "2026-10-26T03:00:00Z",
  tieu_de_danh_dau: "\ue000Quy chế\ue001 làm việc",
  trich_doan: "…giờ \ue000tiếp công dân\ue001 <script>alert(1)</script>…",
};
const KQ2 = { ...KQ, id: "22222222-2222-4222-8222-222222222222", tieu_de: "Hướng dẫn hộ tịch",
  tieu_de_danh_dau: "Hướng dẫn hộ tịch", loai: "huong_dan", pham_vi: "linh_vuc", linh_vuc_id: LV,
  trang_thai: "het_hieu_luc", trich_doan: "" };
const VB = { ...KQ, noi_dung: "Dòng một.\nDòng hai.", nguoi_tao_sub: "vt", nguoi_sua_sub: "vt", tao_luc: "2026-01-05T00:00:00Z",
  linh_vuc: null };

let nguon = "meilisearch";
let goi: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  nguon = "meilisearch";
  goi = vi.fn<typeof fetch>(async (url, init) => {
    const u = String(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (u.includes("/files/wiki/tim")) return json({ ket_qua: [KQ, KQ2], tong: 2, nguon, q: "" });
    if (u.includes("/api/linh_vuc")) return json([{ id: LV, ma: "ho_tich", ten: "Hộ tịch" }]);
    if (u.includes("/api/wiki_van_ban_lich_su")) {
      return json([{ phien_ban: 1, tieu_de: "Quy chế cũ", noi_dung: "Bản cũ", trang_thai: "hieu_luc", nguoi_sua_sub: "vt", sua_luc: "2026-01-05T00:00:00Z" }]);
    }
    if (u.includes("/api/wiki_van_ban?id=eq.")) return json(u.includes(ID) ? [VB] : []);
    if (u.endsWith("/files/wiki") && init?.method === "POST") return json({ ...VB, id: "33333333-3333-4333-8333-333333333333" }, 201);
    if (u.includes(`/files/wiki/${ID}`) && init?.method === "POST") return json({ ...VB, trang_thai: "het_hieu_luc" });
    if (u.includes("/workflow/tasks")) return json([]);
    if (u.includes("/api/can_bo")) return json([]);
    if (u.includes("/api/thong_bao")) return json([]);
    return json({ loi: "không có" }, 404);
  });
  vi.stubGlobal("fetch", goi);
});
afterEach(() => vi.unstubAllGlobals());
const goiTheo = (doan: string) => goi.mock.calls.filter(([u]) => String(u).includes(doan));

describe("wiki văn bản (#95)", () => {
  it("quyền ghi theo vai và phạm vi", () => {
    expect(duocGhi("van_thu")).toBe(true);
    expect(duocGhi("van_thu", "lanh_dao")).toBe(false);
    expect(duocGhi("lanh_dao", "lanh_dao")).toBe(true);
    expect(duocGhi("can_bo")).toBe(false);
  });

  it("cán bộ thấy mục Wiki văn bản, tìm theo từ khóa trên URL, đoạn khớp là <mark>, không chèn HTML", async () => {
    ve("/can-bo/wiki?q=ti%E1%BA%BFp%20c%C3%B4ng%20d%C3%A2n&loai=quy_che", ["can_bo"]);
    expect(await screen.findByRole("heading", { level: 1, name: "Wiki văn bản" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wiki văn bản" })).toHaveAttribute("aria-current", "page");
    const lienKet = await screen.findByRole("link", { name: "Quy chế làm việc" });
    expect(lienKet).toHaveAttribute("href", `/can-bo/wiki/${ID}`);
    expect(within(lienKet).getByText("Quy chế").tagName).toBe("MARK");
    expect(screen.getByText("tiếp công dân").tagName).toBe("MARK");
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(await screen.findByText("Lĩnh vực: Hộ tịch")).toBeInTheDocument();
    expect(screen.getByText("Hết hiệu lực")).toBeInTheDocument();
    const tim = goiTheo("/files/wiki/tim")[0][0] as string;
    expect(tim).toContain("q=ti%E1%BA%BFp+c%C3%B4ng+d%C3%A2n");
    expect(tim).toContain("loai=quy_che");
    expect(screen.queryByRole("link", { name: /Thêm văn bản/ })).toBeNull();
  });

  it("gửi form tìm đổi tham số URL và gọi lại máy chủ", async () => {
    const u = userEvent.setup();
    ve("/can-bo/wiki", ["can_bo"]);
    await screen.findByRole("link", { name: "Quy chế làm việc" });
    await u.type(screen.getByLabelText("Từ khóa"), "chứng thực");
    await u.click(screen.getByLabelText("Gồm cả văn bản hết hiệu lực"));
    await u.click(screen.getByRole("button", { name: "Tìm" }));
    await vi.waitFor(() => expect(goiTheo("/files/wiki/tim")).toHaveLength(2));
    const lan2 = goiTheo("/files/wiki/tim")[1][0] as string;
    expect(lan2).toContain("q=ch%E1%BB%A9ng+th%E1%BB%B1c");
    expect(lan2).toContain("tat_ca=1");
  });

  it("chỉ mục tạm dừng: báo đang tìm trực tiếp trong CSDL", async () => {
    nguon = "csdl";
    ve("/can-bo/wiki", ["lanh_dao"]);
    expect(await screen.findByText("Bộ tìm kiếm đang tạm dừng")).toBeInTheDocument();
  });

  it("văn thư thấy nút thêm; chi tiết có nội dung, phiên bản cũ, nút ngừng hiệu lực", async () => {
    const u = userEvent.setup();
    ve(`/can-bo/wiki/${ID}`, ["van_thu"]);
    expect(await screen.findByRole("heading", { level: 1, name: "Quy chế làm việc" })).toBeInTheDocument();
    expect(screen.getByText(/Dòng một\./)).toBeInTheDocument();
    expect(screen.getByText(/Phiên bản 1 ·/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Ngừng hiệu lực" }));
    expect(await screen.findByText("Đã chuyển văn bản sang hết hiệu lực.")).toBeInTheDocument();
    const ghi = goiTheo(`/files/wiki/${ID}`).find(([, i]) => i?.method === "POST");
    expect(JSON.parse(String(ghi?.[1]?.body))).toEqual({ trang_thai: "het_hieu_luc" });
  });

  it("cán bộ xem chi tiết không có nút sửa; văn bản ngoài phạm vi → không thấy", async () => {
    ve(`/can-bo/wiki/${ID}`, ["can_bo"]);
    await screen.findByRole("heading", { level: 1, name: "Quy chế làm việc" });
    expect(screen.queryByRole("link", { name: "Sửa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ngừng hiệu lực" })).toBeNull();
  });

  it("văn bản RLS không cho xem → thông báo không thấy", async () => {
    ve("/can-bo/wiki/44444444-4444-4444-8444-444444444444", ["can_bo"]);
    expect(await screen.findByRole("heading", { level: 1, name: "Không thấy văn bản" })).toBeInTheDocument();
  });

  it("văn thư thêm văn bản phạm vi lĩnh vực: phải chọn lĩnh vực, không có lựa chọn chỉ lãnh đạo", async () => {
    const u = userEvent.setup();
    ve("/can-bo/wiki/moi", ["van_thu"]);
    expect(await screen.findByRole("heading", { level: 1, name: "Thêm văn bản nội bộ" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Chỉ lãnh đạo")).toBeNull();
    await u.type(screen.getByLabelText("Tiêu đề"), "Hướng dẫn mới");
    await u.type(screen.getByLabelText("Nội dung"), "Nội dung hướng dẫn");
    await u.click(screen.getByLabelText("Cán bộ phụ trách một lĩnh vực"));
    await u.click(screen.getByRole("button", { name: "Thêm văn bản" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chọn lĩnh vực");
    await u.selectOptions(await screen.findByLabelText("Lĩnh vực"), "Hộ tịch");
    await u.click(screen.getByRole("button", { name: "Thêm văn bản" }));
    await vi.waitFor(() => expect(goiTheo("/files/wiki").filter(([, i]) => i?.method === "POST")).toHaveLength(1));
    const body = JSON.parse(String(goiTheo("/files/wiki").find(([, i]) => i?.method === "POST")?.[1]?.body));
    expect(body).toMatchObject({ tieu_de: "Hướng dẫn mới", loai: "huong_dan", pham_vi: "linh_vuc", linh_vuc_id: LV,
      noi_dung: "Nội dung hướng dẫn", so_ky_hieu: null });
  });

  it("lãnh đạo có lựa chọn chỉ lãnh đạo; cán bộ mở trang thêm → không được phép", async () => {
    const { unmount } = ve("/can-bo/wiki/moi", ["lanh_dao"]);
    expect(await screen.findByLabelText("Chỉ lãnh đạo")).toBeInTheDocument();
    unmount();
    ve("/can-bo/wiki/moi", ["can_bo"]);
    expect(await screen.findByRole("heading", { level: 1, name: "Bạn không được sửa văn bản này" })).toBeInTheDocument();
  });
});

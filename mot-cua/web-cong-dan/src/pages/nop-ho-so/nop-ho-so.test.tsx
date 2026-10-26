// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Form nộp hồ sơ (#64): đi hết các bước với dữ liệu giả; API nộp (/api, /files, /workflow) giả bằng fetch.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User, UserManager } from "oidc-client-ts";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XacThucProvider } from "@/auth/xac-thuc";
import duLieuGia from "@/du-lieu-gia/thu-tuc.json";
import type { ThuTuc } from "@/lib/api";
import { ChiTietThuTuc } from "@/pages/chi-tiet-thu-tuc";
import { NopHoSo } from "./index";

const DS = duLieuGia as ThuTuc[];
const mang = (title: string, minItems: number) => ({ title, type: "array", items: { type: "string", format: "uuid" }, minItems });
/** Gói thủ tục giả chỉ có trong test: form phải tự sinh từ schema, không sửa mã web. */
const ZZ01: ThuTuc = {
  id: "00000000-0000-4000-8000-0000000000f1",
  ma: "ZZ01",
  ten: "Thủ tục giả để thử form",
  so_ngay_xu_ly: 1,
  le_phi: 0,
  ghi_chu_le_phi: null,
  quy_trinh: "zz_gia",
  linh_vuc: { ma: "thu", ten: "Thử" },
  json_schema: {
    title: "Thủ tục giả để thử form",
    properties: {
      thanh_phan: {
        type: "object",
        additionalProperties: false,
        required: ["don_de_nghi", "anh_the"],
        properties: { don_de_nghi: mang("Đơn đề nghị", 1), anh_the: mang("Ảnh thẻ 3x4", 2), khac: mang("Giấy tờ khác", 0) },
      },
    },
  } as ThuTuc["json_schema"],
};
const tai = () => Promise.resolve([...DS, ZZ01]);

function quanLyGia(nguoiDung: Partial<User> | null) {
  const suKien = { addUserLoaded: vi.fn(), addUserUnloaded: vi.fn(), addUserSignedOut: vi.fn(), removeUserLoaded: vi.fn(), removeUserUnloaded: vi.fn(), removeUserSignedOut: vi.fn() };
  return {
    getUser: () => Promise.resolve(nguoiDung),
    events: suKien,
    signinRedirect: vi.fn(),
  } as unknown as UserManager;
}

function ve(duong: string, nguoiDung: Partial<User> | null = { profile: { sub: "1", name: "Nguyễn Văn Mẫu" } as User["profile"], access_token: "token-gia", expired: false }) {
  return render(
    <XacThucProvider quanLy={quanLyGia(nguoiDung)}>
      <MemoryRouter initialEntries={[duong]}>
        <Routes>
          <Route path="/thu-tuc/:ma" element={<ChiTietThuTuc taiDanhMuc={tai} />} />
          <Route path="/nop-ho-so/:ma/:buoc?" element={<NopHoSo taiDanhMuc={tai} />} />
        </Routes>
      </MemoryRouter>
    </XacThucProvider>,
  );
}

const anh = (ten: string) => new File(["gia"], ten, { type: "image/png" });

const HO_SO = { id: "11111111-1111-4111-8111-111111111111", ma_ho_so: "HS20261023-000123", trang_thai: "moi", han_xu_ly: "2026-10-26" };
let goi: ReturnType<typeof vi.fn<typeof fetch>>;
let loiTep = 0;

beforeEach(() => {
  loiTep = 0;
  goi = vi.fn<typeof fetch>(async (url, init) => {
    const u = String(url);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (u.includes("/api/ho_so")) return json(201, [HO_SO]);
    if (u.includes("/public/thanh_phan_yeu_cau"))
      return json(200, [
        { id: "a0000000-0000-4000-8000-000000000001", ma: "to_khai" },
        { id: "a0000000-0000-4000-8000-000000000002", ma: "giay_chung_sinh" },
        { id: "a0000000-0000-4000-8000-000000000003", ma: "giay_to_tuy_than" },
      ]);
    if (u.includes("/files/ho-so/")) {
      if (loiTep > 0) {
        loiTep--;
        return json(503, { loi: "Máy quét mã độc chưa sẵn sàng" });
      }
      return json(201, { id: "t1", ten_tep: new URL(u).searchParams.get("ten"), init: !!init });
    }
    if (u.includes("/khoi-tao")) return json(201, { processInstanceId: "p1" });
    return json(404, {});
  });
  // Danh sách loại giấy tờ đọc được (#93) là lời gọi đọc siêu dữ liệu, không thuộc luồng nộp: trả rỗng (ẩn tự điền) và
  // không đếm vào `goi`, để các kiểm tra "0 request khi thiếu giấy tờ" và thứ tự nộp giữ nguyên ý nghĩa.
  vi.stubGlobal("fetch", (url: RequestInfo | URL, init?: RequestInit) =>
    String(url).includes("/files/doc-giay-to/loai") ? Promise.resolve(new Response("{}", { status: 200 })) : goi(url, init),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function denKiemTra(u: ReturnType<typeof userEvent.setup>) {
  ve("/nop-ho-so/KS01");
  await screen.findByRole("heading", { level: 1, name: "Người nộp hồ sơ" });
  await u.type(screen.getByLabelText("Số điện thoại"), "0900 000 001");
  await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
  await screen.findByRole("heading", { level: 1, name: "Giấy tờ kèm theo" });
  await u.upload(screen.getByLabelText(/Chọn tệp cho Tờ khai/), anh("to-khai.png"));
  await u.upload(screen.getByLabelText(/Chọn tệp cho Giấy chứng sinh/), anh("chung-sinh.png"));
  await u.upload(screen.getByLabelText(/Chọn tệp cho Giấy tờ tùy thân/), anh("cccd.png"));
  await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
  await screen.findByRole("heading", { level: 1, name: "Kiểm tra lại thông tin" });
}

describe("chi tiết thủ tục", () => {
  it("hiện thành phần hồ sơ từ JSON Schema và nút Bắt đầu nộp", async () => {
    ve("/thu-tuc/KS01");
    expect(await screen.findByRole("heading", { level: 1, name: "Đăng ký khai sinh" })).toBeInTheDocument();
    const tp = screen.getByRole("region", { name: "Thành phần hồ sơ" });
    expect(within(tp).getByText("Giấy chứng sinh")).toBeInTheDocument();
    expect(within(tp).getByText("Giấy chứng nhận kết hôn của cha mẹ")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Bắt đầu nộp/ })[0]).toHaveAttribute("href", "/nop-ho-so/KS01");
  });

  it("mã không có trong danh mục thì báo rõ", async () => {
    ve("/thu-tuc/XX99");
    expect(await screen.findByRole("heading", { name: "Không có thủ tục mã XX99" })).toBeInTheDocument();
  });
});

describe("form nộp hồ sơ (bản mẫu)", () => {
  it("chưa đăng nhập thì mời đăng nhập", async () => {
    ve("/nop-ho-so/KS01", null);
    expect(await screen.findByRole("heading", { name: "Đăng nhập để nộp hồ sơ" })).toBeInTheDocument();
  });

  it("Poka-yoke: thiếu giấy tờ bắt buộc thì tóm tắt lỗi đầu form, đủ thì sang kiểm tra lại rồi nộp", async () => {
    const u = userEvent.setup();
    ve("/nop-ho-so/KS01");
    expect(await screen.findByRole("heading", { level: 1, name: "Người nộp hồ sơ" })).toBeInTheDocument();
    expect(screen.getByLabelText("Họ và tên")).toHaveValue("Nguyễn Văn Mẫu");

    await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
    const loi1 = screen.getByRole("alert");
    expect(within(loi1).getByRole("link", { name: "Nhập số điện thoại" })).toBeInTheDocument();
    expect(loi1).toHaveFocus();
    expect(screen.getByLabelText("Số điện thoại")).toHaveAttribute("aria-invalid", "true");

    await u.type(screen.getByLabelText("Số điện thoại"), "0900000001");
    await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Giấy tờ kèm theo" })).toBeInTheDocument();

    await u.upload(screen.getByLabelText(/Chọn tệp cho Tờ khai/), anh("to-khai.png"));
    await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
    const loi2 = screen.getByRole("alert");
    expect(within(loi2).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Chưa tải giấy chứng sinh",
      "Chưa tải giấy tờ tùy thân của người đi đăng ký",
    ]);

    await u.upload(screen.getByLabelText(/Chọn tệp cho Giấy chứng sinh/), anh("chung-sinh.png"));
    await u.upload(screen.getByLabelText(/Chọn tệp cho Giấy tờ tùy thân/), anh("cccd.png"));
    await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Kiểm tra lại thông tin" })).toBeInTheDocument();
    expect(screen.getByText("chung-sinh.png")).toBeInTheDocument();
    expect(screen.getByText("Không nộp")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Đồng ý và nộp hồ sơ" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Đã nộp hồ sơ" })).toBeInTheDocument();
    expect(screen.getByText("HS20261023-000123")).toBeInTheDocument();
    expect(screen.getByText("26/10/2026")).toBeInTheDocument();
    // Biên nhận có ký số (#77) tải ngay trên trang đã nộp.
    expect(screen.getByRole("heading", { level: 2, name: "Biên nhận" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tải biên nhận hồ sơ \(PDF có ký số\)/ })).toBeEnabled();
  });

  it("nộp thật theo thứ tự: tạo hồ sơ, tải từng tệp đúng thành phần, rồi mới khởi tạo quy trình", async () => {
    const u = userEvent.setup();
    await denKiemTra(u);
    await u.click(screen.getByRole("button", { name: "Đồng ý và nộp hồ sơ" }));
    await screen.findByRole("heading", { level: 1, name: "Đã nộp hồ sơ" });
    const urls = goi.mock.calls.map(([url]) => new URL(String(url)));
    const viec = urls.map((x) => x.pathname.replace(HO_SO.id, "{id}"));
    expect(viec.filter((x) => !x.startsWith("/public/thu_tuc"))).toEqual([
      "/api/ho_so",
      "/public/thanh_phan_yeu_cau",
      "/files/ho-so/{id}/tep",
      "/files/ho-so/{id}/tep",
      "/files/ho-so/{id}/tep",
      "/workflow/ho-so/{id}/khoi-tao",
    ]);
    const [, taoInit] = goi.mock.calls.find(([url]) => String(url).includes("/api/ho_so"))!;
    expect(JSON.parse(String(taoInit?.body))).toEqual({
      thu_tuc_id: "00000000-0000-4000-8000-0000000000a1",
      ho_ten_nguoi_nop: "Nguyễn Văn Mẫu",
      so_dien_thoai: "0900000001",
    });
    expect(new Headers(taoInit?.headers).get("Authorization")).toBe("Bearer token-gia");
    const tepCs = urls.find((x) => x.searchParams.get("ten") === "chung-sinh.png")!;
    expect(tepCs.searchParams.get("thanh_phan_yeu_cau_id")).toBe("a0000000-0000-4000-8000-000000000002");
  });

  it("lỗi giữa chừng thì báo rõ, Thử lại tiếp tục mà không tạo trùng hồ sơ", async () => {
    const u = userEvent.setup();
    await denKiemTra(u);
    loiTep = 1;
    await u.click(screen.getByRole("button", { name: "Đồng ý và nộp hồ sơ" }));
    const bao = await screen.findByRole("alert");
    expect(bao).toHaveTextContent("Chưa nộp xong hồ sơ");
    expect(bao).toHaveTextContent("HS20261023-000123");
    expect(screen.queryByRole("link", { name: /Thay đổi/ })).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByRole("heading", { level: 1, name: "Đã nộp hồ sơ" });
    expect(goi.mock.calls.filter(([url]) => String(url).includes("/api/ho_so"))).toHaveLength(1);
    expect(goi.mock.calls.filter(([url]) => String(url).includes("/files/"))).toHaveLength(4);
  });

  it("không nhảy cóc tới bước kiểm tra khi chưa điền", async () => {
    ve("/nop-ho-so/KS01/kiem-tra");
    expect(await screen.findByRole("heading", { level: 1, name: "Người nộp hồ sơ" })).toBeInTheDocument();
  });
});

describe("Poka-yoke phía trình duyệt: thiếu thành phần thì không gửi request nào (#53)", () => {
  it("KS01 thiếu giấy tờ bắt buộc: bấm Tiếp tục bị chặn, fetch 0 lần", async () => {
    const u = userEvent.setup();
    ve("/nop-ho-so/KS01");
    await screen.findByRole("heading", { level: 1, name: "Người nộp hồ sơ" });
    await u.type(screen.getByLabelText("Số điện thoại"), "0900000001");
    await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await screen.findByRole("heading", { level: 1, name: "Giấy tờ kèm theo" });
    await u.upload(screen.getByLabelText(/Chọn tệp cho Tờ khai/), anh("to-khai.png"));
    await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa tải giấy chứng sinh");
    expect(screen.getByRole("heading", { level: 1, name: "Giấy tờ kèm theo" })).toBeInTheDocument();
    expect(goi).toHaveBeenCalledTimes(0);
  });

  it("gói giả ZZ01: form tự sinh ô theo schema, thiếu 1 ảnh thẻ (minItems 2) thì chặn, fetch 0 lần; đủ thì nộp đúng thứ tự", async () => {
    const u = userEvent.setup();
    ve("/nop-ho-so/ZZ01");
    await screen.findByRole("heading", { level: 1, name: "Người nộp hồ sơ" });
    await u.type(screen.getByLabelText("Số điện thoại"), "0900000001");
    await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await screen.findByRole("heading", { level: 1, name: "Giấy tờ kèm theo" });
    expect(screen.getByLabelText(/Chọn tệp cho Đơn đề nghị/)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(/Chọn tệp cho Giấy tờ khác/)).toHaveAttribute("aria-required", "false");
    await u.upload(screen.getByLabelText(/Chọn tệp cho Đơn đề nghị/), anh("don.png"));
    await u.upload(screen.getByLabelText(/Chọn tệp cho Ảnh thẻ/), anh("anh-1.png"));
    await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Cần ít nhất 2 tệp cho ảnh thẻ 3x4");
    expect(goi).toHaveBeenCalledTimes(0);

    await u.upload(screen.getByLabelText(/Thêm tệp cho Ảnh thẻ/), anh("anh-2.png"));
    await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await screen.findByRole("heading", { level: 1, name: "Kiểm tra lại thông tin" });
    expect(goi).toHaveBeenCalledTimes(0);
    await u.click(screen.getByRole("button", { name: "Đồng ý và nộp hồ sơ" }));
    await screen.findByRole("heading", { level: 1, name: "Đã nộp hồ sơ" });
    expect(goi.mock.calls.map(([url, init]) => `${init?.method} ${new URL(String(url)).pathname.replace(HO_SO.id, "{id}")}`)).toEqual([
      "POST /api/ho_so",
      "GET /public/thanh_phan_yeu_cau",
      "POST /files/ho-so/{id}/tep",
      "POST /files/ho-so/{id}/tep",
      "POST /files/ho-so/{id}/tep",
      "POST /workflow/ho-so/{id}/khoi-tao",
    ]);
  });

  it("CT01: chỉ bản chính là bắt buộc, nộp được không cần bản sao", async () => {
    const u = userEvent.setup();
    ve("/nop-ho-so/CT01");
    await screen.findByRole("heading", { level: 1, name: "Người nộp hồ sơ" });
    await u.type(screen.getByLabelText("Số điện thoại"), "0900000001");
    await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await screen.findByRole("heading", { level: 1, name: "Giấy tờ kèm theo" });
    await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa tải bản chính giấy tờ cần chứng thực");
    expect(goi).toHaveBeenCalledTimes(0);
    await u.upload(screen.getByLabelText(/Chọn tệp cho Bản chính/), anh("ban-chinh.png"));
    await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await screen.findByRole("heading", { level: 1, name: "Kiểm tra lại thông tin" });
    await u.click(screen.getByRole("button", { name: "Đồng ý và nộp hồ sơ" }));
    await screen.findByRole("heading", { level: 1, name: "Đã nộp hồ sơ" });
    const lanTai = goi.mock.calls.filter(([url]) => String(url).includes("/files/"));
    expect(lanTai).toHaveLength(1);
    expect(goi.mock.calls.at(-1)?.[0]).toMatch(/\/workflow\/ho-so\/.+\/khoi-tao$/);
  });
});

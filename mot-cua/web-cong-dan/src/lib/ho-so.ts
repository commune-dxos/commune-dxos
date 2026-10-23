// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Nộp hồ sơ qua APISIX bằng access token của công dân, theo thứ tự để quy trình chỉ chạy khi hồ
// sơ đã đủ giấy tờ (#59):
//   0. Poka-yoke: kiểm tệp đã chọn theo JSON Schema của gói; thiếu thì dừng, KHÔNG gửi request nào
//   1. POST /api/ho_so            tạo hồ sơ (PostgREST, RLS: người nộp = người gọi, trạng thái mới)
//   2. POST /files/ho-so/{id}/tep  tải từng tệp (mot-cua-api: ClamAV quét, kiểm magic bytes, Garage)
//   3. POST /workflow/ho-so/{id}/khoi-tao  khởi tạo quy trình Flowable của thủ tục; mot-cua-api kiểm
//      lại schema với tệp đã quét sạch, thiếu → 422 (lớp Poka-yoke thứ hai)
// Bước nào lỗi thì giữ kết quả các bước trước để người dân bấm "Thử lại" từ chỗ dở dang.
import { cauHinh as cauHinhMacDinh, type CauHinh } from "./cau-hinh";
import { LoiApi, thongDiepLoi, type ThuTuc } from "./api";
import { docThanhPhan, kiemThanhPhan } from "./thanh-phan";

export interface HoSoMoi {
  id: string;
  ma_ho_so: string;
  trang_thai: string;
  /** Hạn xử lý (date, YYYY-MM-DD), CSDL tính theo ngày làm việc. */
  han_xu_ly: string;
}

const KHONG_KET_NOI = "Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng rồi thử lại.";

async function goiApi<T>(
  cauHinh: CauHinh,
  goi: typeof fetch,
  duong: string,
  init: RequestInit & { token?: string },
): Promise<T> {
  if (cauHinh.duLieuGia) {
    throw new LoiApi("Chế độ dữ liệu giả không nộp được hồ sơ. Chạy cổng với lõi (make up) để nộp.", null);
  }
  const { token, headers, ...con } = init;
  const h = new Headers(headers);
  h.set("Accept", "application/json");
  if (token) h.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await goi(cauHinh.gatewayUrl + duong, { ...con, headers: h });
  } catch {
    throw new LoiApi(KHONG_KET_NOI, null);
  }
  const than = await res.text();
  const json = than ? (JSON.parse(than) as unknown) : null;
  if (!res.ok) {
    // mot-cua-api trả {"loi": "câu tiếng Việt"}; PostgREST trả {"message": …} (không cho người dân xem).
    const loi = (json as { loi?: unknown } | null)?.loi;
    const thongDiep =
      res.status === 401
        ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        : typeof loi === "string" && res.status < 500 && res.status !== 429
          ? loi
          : thongDiepLoi(res.status);
    throw new LoiApi(thongDiep, res.status);
  }
  return json as T;
}

/** id thành phần yêu cầu theo mã (khóa trong JSON Schema của gói), đọc công khai. */
export async function layIdThanhPhan(thuTucId: string, cauHinh = cauHinhMacDinh, goi: typeof fetch = fetch) {
  const ds = await goiApi<{ id: string; ma: string }[]>(
    cauHinh,
    goi,
    `/public/thanh_phan_yeu_cau?thu_tuc_id=eq.${encodeURIComponent(thuTucId)}&select=id,ma`,
    { method: "GET" },
  );
  return Object.fromEntries(ds.map((t) => [t.ma, t.id])) as Record<string, string>;
}

export async function taoHoSo(
  token: string,
  duLieu: { thu_tuc_id: string; ho_ten_nguoi_nop: string; so_dien_thoai: string },
  cauHinh = cauHinhMacDinh,
  goi: typeof fetch = fetch,
) {
  const rows = await goiApi<HoSoMoi[]>(cauHinh, goi, "/api/ho_so?select=id,ma_ho_so,trang_thai,han_xu_ly", {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(duLieu),
  });
  return rows[0];
}

/** Content-Type theo đuôi tệp, khớp danh sách mot-cua-api nhận (tep.py LOAI_TEP). */
export function loaiTheoDuoi(ten: string) {
  const duoi = ten.split(".").pop()?.toLowerCase();
  return duoi === "pdf"
    ? "application/pdf"
    : duoi === "png"
      ? "image/png"
      : duoi === "jpg" || duoi === "jpeg"
        ? "image/jpeg"
        : null;
}

export async function taiTep(
  token: string,
  hoSoId: string,
  tep: File,
  thanhPhanYeuCauId: string | undefined,
  cauHinh = cauHinhMacDinh,
  goi: typeof fetch = fetch,
) {
  const q = new URLSearchParams({ ten: tep.name });
  if (thanhPhanYeuCauId) q.set("thanh_phan_yeu_cau_id", thanhPhanYeuCauId);
  return goiApi<{ id: string }>(cauHinh, goi, `/files/ho-so/${encodeURIComponent(hoSoId)}/tep?${q}`, {
    method: "POST",
    token,
    headers: { "Content-Type": loaiTheoDuoi(tep.name) ?? tep.type },
    body: tep,
  });
}

export async function khoiTaoQuyTrinh(token: string, hoSoId: string, cauHinh = cauHinhMacDinh, goi: typeof fetch = fetch) {
  try {
    await goiApi(cauHinh, goi, `/workflow/ho-so/${encodeURIComponent(hoSoId)}/khoi-tao`, { method: "POST", token });
  } catch (e) {
    // Thử lại sau khi lần trước đã khởi tạo xong nhưng mất phản hồi: coi như thành công.
    if (e instanceof LoiApi && e.trangThai === 409 && /đã có quy trình/.test(e.message)) return;
    throw e;
  }
}

/** Thiếu hoặc sai thành phần theo JSON Schema: phát hiện trước khi gửi request nào. */
export class LoiThieuThanhPhan extends LoiApi {
  readonly thanhPhan: Record<string, string>;
  constructor(thanhPhan: Record<string, string>) {
    super(`Hồ sơ chưa đủ giấy tờ: ${Object.values(thanhPhan).join("; ")}.`, null);
    this.name = "LoiThieuThanhPhan";
    this.thanhPhan = thanhPhan;
  }
}

/** Tiến độ nộp, giữ qua các lần "Thử lại" để không tạo trùng hồ sơ hay tải trùng tệp. */
export interface TienDoNop {
  hoSo: HoSoMoi | null;
  daTai: Set<File>;
  daKhoiTao: boolean;
}

export const tienDoMoi = (): TienDoNop => ({ hoSo: null, daTai: new Set(), daKhoiTao: false });

/** Cả luồng nộp, Poka-yoke trước tiên. Lỗi ở bước nào thì `tienDo` giữ phần đã xong. */
export async function nopHoSo(
  token: string,
  thuTuc: Pick<ThuTuc, "id" | "json_schema">,
  nguoiNop: { ho_ten_nguoi_nop: string; so_dien_thoai: string },
  tep: Record<string, File[] | undefined>,
  tienDo: TienDoNop = tienDoMoi(),
  cauHinh = cauHinhMacDinh,
  goi: typeof fetch = fetch,
) {
  const thieu = kiemThanhPhan(thuTuc.json_schema, tep);
  if (Object.keys(thieu).length) throw new LoiThieuThanhPhan(thieu);
  tienDo.hoSo ??= await taoHoSo(token, { thu_tuc_id: thuTuc.id, ...nguoiNop }, cauHinh, goi);
  const idThanhPhan = await layIdThanhPhan(thuTuc.id, cauHinh, goi);
  for (const tp of docThanhPhan(thuTuc.json_schema)) {
    for (const f of tep[tp.ma] ?? []) {
      if (tienDo.daTai.has(f)) continue;
      await taiTep(token, tienDo.hoSo.id, f, idThanhPhan[tp.ma], cauHinh, goi);
      tienDo.daTai.add(f);
    }
  }
  if (!tienDo.daKhoiTao) {
    await khoiTaoQuyTrinh(token, tienDo.hoSo.id, cauHinh, goi);
    tienDo.daKhoiTao = true;
  }
  return tienDo.hoSo;
}

// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Nộp hồ sơ qua APISIX bằng access token của công dân, cùng thứ tự với cổng công dân (#59) để quy trình
// chỉ chạy khi hồ sơ đã đủ giấy tờ:
//   0. Poka-yoke: kiểm ảnh đã chọn theo JSON Schema của gói; thiếu thì dừng, KHÔNG gửi request nào
//   1. POST /api/ho_so                       tạo hồ sơ (PostgREST, RLS: người nộp = người gọi)
//   2. POST /files/ho-so/{id}/tep            tải từng ảnh (mot-cua-api: kiểm magic bytes, ClamAV, Garage)
//   3. POST /workflow/ho-so/{id}/khoi-tao    khởi tạo quy trình Flowable; máy chủ kiểm lại schema (422 nếu thiếu)
// Bước nào lỗi thì `TienDoNop` giữ phần đã xong để bấm "Thử lại" không tạo trùng hồ sơ hay tải trùng ảnh.
import type { CauHinh } from '../cau-hinh/moi-truong';
import type { ThuTuc } from './danh-muc';
import { LoiApi, goiGateway, type HamFetch } from './goi-api';
import { docThanhPhan, kiemThanhPhan } from './thanh-phan';

export interface HoSoMoi {
  id: string;
  ma_ho_so: string;
  trang_thai: string;
  /** Hạn xử lý (YYYY-MM-DD), CSDL tính theo ngày làm việc. */
  han_xu_ly: string;
}

/** Ảnh giấy tờ đã chụp hoặc chọn trên máy (react-native-image-picker). */
export interface AnhGiayTo {
  /** file:// hoặc content:// trên máy. */
  uri: string;
  /** Tên gửi lên máy chủ, đặt theo mã thành phần, không dùng tên gốc của ảnh. */
  ten: string;
  loai: 'image/jpeg' | 'image/png';
  kichThuoc: number | null;
}

export interface NguoiNop {
  hoTen: string;
  soDienThoai: string;
}

/** Giới hạn của mot-cua-api (DXOS_FILE_MAX_BYTES mặc định 10 MB). */
export const TEP_TOI_DA = 10 * 1024 * 1024;

export function chuanSoDienThoai(s: string) {
  return s.replace(/[\s.-]/g, '');
}

/** Cùng ràng buộc với CSDL (so_dien_thoai ~ '^0[0-9]{9}$') và cổng công dân. */
export function kiemNguoiNop(n: NguoiNop) {
  const loi: { hoTen?: string; soDienThoai?: string } = {};
  if (!n.hoTen.trim()) loi.hoTen = 'Nhập họ và tên người nộp.';
  const so = chuanSoDienThoai(n.soDienThoai);
  if (!so) loi.soDienThoai = 'Nhập số điện thoại.';
  else if (!/^0\d{9}$/.test(so)) loi.soDienThoai = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0, ví dụ 0912 345 678.';
  return loi;
}

/** Ảnh từ image-picker → ảnh gửi đi, hoặc câu báo nếu không phải JPG/PNG hay quá lớn. */
export function thanhAnhGiayTo(
  a: { uri?: string; type?: string; fileSize?: number },
  maThanhPhan: string,
  thuTu: number,
): AnhGiayTo | { loi: string } {
  if (!a.uri) return { loi: 'Chưa đọc được ảnh vừa chọn. Vui lòng thử lại.' };
  const png = a.type === 'image/png';
  if (a.type && !png && a.type !== 'image/jpeg' && a.type !== 'image/jpg') {
    return { loi: 'Chỉ nhận ảnh JPG hoặc PNG.' };
  }
  if (a.fileSize && a.fileSize > TEP_TOI_DA) return { loi: 'Ảnh lớn hơn 10 MB. Vui lòng chụp lại.' };
  return {
    uri: a.uri,
    ten: `${maThanhPhan}-${thuTu}.${png ? 'png' : 'jpg'}`,
    loai: png ? 'image/png' : 'image/jpeg',
    kichThuoc: a.fileSize ?? null,
  };
}

export interface TienDoNop {
  hoSo: HoSoMoi | null;
  /** uri ảnh đã tải xong. */
  daTai: Set<string>;
  daKhoiTao: boolean;
}

export const tienDoMoi = (): TienDoNop => ({ hoSo: null, daTai: new Set(), daKhoiTao: false });

export type BuocNop = { loai: 'tao' } | { loai: 'tai'; thu: number; tong: number } | { loai: 'khoi-tao' };

export interface PhuThuocNop {
  /** Lấy access token còn hạn (kho phiên tự làm mới). Gọi lại trước mỗi request vì tải ảnh có thể lâu. */
  layToken: () => Promise<string>;
  /** Đọc ảnh trên máy thành Blob để gửi thẳng làm thân request. */
  docAnh?: (uri: string) => Promise<Blob>;
  baoBuoc?: (b: BuocNop) => void;
  cauHinh?: CauHinh;
  goi?: HamFetch;
}

const docAnhMacDinh = async (uri: string) => (await fetch(uri)).blob();

/** Thiếu hoặc sai thành phần theo JSON Schema: phát hiện trước khi gửi request nào. */
export class LoiThieuThanhPhan extends LoiApi {
  readonly thanhPhan: Record<string, string>;
  constructor(thanhPhan: Record<string, string>) {
    super('Hồ sơ chưa đủ giấy tờ. Vui lòng bổ sung các mục được đánh dấu.', null);
    this.name = 'LoiThieuThanhPhan';
    this.thanhPhan = thanhPhan;
  }
}

export async function nopHoSo(
  thuTuc: Pick<ThuTuc, 'id' | 'json_schema'>,
  nguoiNop: NguoiNop,
  anh: Record<string, AnhGiayTo[] | undefined>,
  tienDo: TienDoNop,
  { layToken, docAnh = docAnhMacDinh, baoBuoc, cauHinh, goi }: PhuThuocNop,
): Promise<HoSoMoi> {
  const soAnh = Object.fromEntries(Object.entries(anh).map(([ma, ds]) => [ma, ds?.length ?? 0]));
  const thieu = kiemThanhPhan(thuTuc.json_schema, soAnh);
  if (Object.keys(thieu).length) throw new LoiThieuThanhPhan(thieu);

  if (!tienDo.hoSo) {
    baoBuoc?.({ loai: 'tao' });
    const rows = await goiGateway<HoSoMoi[]>(
      '/api/ho_so?select=id,ma_ho_so,trang_thai,han_xu_ly',
      {
        method: 'POST',
        token: await layToken(),
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          thu_tuc_id: thuTuc.id,
          ho_ten_nguoi_nop: nguoiNop.hoTen.trim(),
          so_dien_thoai: chuanSoDienThoai(nguoiNop.soDienThoai),
        }),
      },
      cauHinh,
      goi,
    );
    if (!rows[0]) throw new LoiApi('Chưa tạo được hồ sơ. Vui lòng thử lại.', null);
    tienDo.hoSo = rows[0];
  }
  const hoSo = tienDo.hoSo;

  // id thành phần yêu cầu theo mã (khóa trong JSON Schema), đọc công khai.
  const dsThanhPhan = await goiGateway<{ id: string; ma: string }[]>(
    `/public/thanh_phan_yeu_cau?thu_tuc_id=eq.${encodeURIComponent(thuTuc.id)}&select=id,ma`,
    {},
    cauHinh,
    goi,
  );
  const idThanhPhan = Object.fromEntries(dsThanhPhan.map(t => [t.ma, t.id]));

  const canTai = docThanhPhan(thuTuc.json_schema).flatMap(tp => (anh[tp.ma] ?? []).map(a => ({ ma: tp.ma, a })));
  let thu = 0;
  for (const { ma, a } of canTai) {
    thu += 1;
    if (tienDo.daTai.has(a.uri)) continue;
    baoBuoc?.({ loai: 'tai', thu, tong: canTai.length });
    const q = [`ten=${encodeURIComponent(a.ten)}`];
    const idTp = idThanhPhan[ma];
    if (idTp) q.push(`thanh_phan_yeu_cau_id=${encodeURIComponent(idTp)}`);
    await goiGateway<{ id: string }>(
      `/files/ho-so/${encodeURIComponent(hoSo.id)}/tep?${q.join('&')}`,
      { method: 'POST', token: await layToken(), headers: { 'Content-Type': a.loai }, body: await docAnh(a.uri) },
      cauHinh,
      goi,
    );
    tienDo.daTai.add(a.uri);
  }

  if (!tienDo.daKhoiTao) {
    baoBuoc?.({ loai: 'khoi-tao' });
    try {
      await goiGateway(
        `/workflow/ho-so/${encodeURIComponent(hoSo.id)}/khoi-tao`,
        { method: 'POST', token: await layToken() },
        cauHinh,
        goi,
      );
    } catch (e) {
      // Lần trước đã khởi tạo xong nhưng mất phản hồi: coi như thành công.
      if (!(e instanceof LoiApi && e.trangThai === 409 && /đã có quy trình/.test(e.message))) throw e;
    }
    tienDo.daKhoiTao = true;
  }
  return hoSo;
}

// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Hồ sơ của công dân đã đăng nhập, gọi bằng access token qua APISIX như cổng công dân:
//   GET /api/ho_so                              RLS chỉ trả hồ sơ người gọi đã nộp
//   GET /api/lich_su_trang_thai?ho_so_id=eq.…   các mốc chuyển trạng thái, kèm lý do bổ sung/từ chối
//   GET /files/ho-so/{id}/tep                   giấy tờ đã nộp (metadata, kết quả quét)
import { useQuery } from '@tanstack/react-query';
import type { CauHinh } from '../cau-hinh/moi-truong';
import { khoaTruyVan } from '../cau-hinh/truy-van';
import { usePhien } from '../kho/phien-dang-nhap';
import { goiGateway, type HamFetch } from './goi-api';

export interface HoSoCuaToi {
  id: string;
  ma_ho_so: string;
  trang_thai: string;
  ngay_nhan: string;
  han_xu_ly: string | null;
  ngay_hoan_tat: string | null;
  ly_do: string | null;
  thu_tuc: { id: string; ma: string; ten: string; so_ngay_xu_ly: number } | null;
}

export interface MocTrangThaiHoSo {
  den_trang_thai: string;
  ly_do: string | null;
  luc: string;
}

export interface TepDaNop {
  id: string;
  thanh_phan_yeu_cau_id: string | null;
  ten_tep: string;
  loai_mime: string;
  kich_thuoc: number;
  ket_qua_quet: string | null;
  created_at: string;
}

export const COT_HO_SO =
  'id,ma_ho_so,trang_thai,ngay_nhan,han_xu_ly,ngay_hoan_tat,ly_do,thu_tuc:thu_tuc_id(id,ma,ten,so_ngay_xu_ly)';

export function danhSachHoSo(token: string, cauHinh?: CauHinh, goi?: HamFetch) {
  return goiGateway<HoSoCuaToi[]>(`/api/ho_so?select=${COT_HO_SO}&order=ngay_nhan.desc`, { token }, cauHinh, goi);
}

export async function layHoSo(token: string, id: string, cauHinh?: CauHinh, goi?: HamFetch) {
  const ds = await goiGateway<HoSoCuaToi[]>(
    `/api/ho_so?id=eq.${encodeURIComponent(id)}&select=${COT_HO_SO}`,
    { token },
    cauHinh,
    goi,
  );
  return ds[0] ?? null;
}

export function lichSuHoSo(token: string, id: string, cauHinh?: CauHinh, goi?: HamFetch) {
  return goiGateway<MocTrangThaiHoSo[]>(
    `/api/lich_su_trang_thai?ho_so_id=eq.${encodeURIComponent(id)}&select=den_trang_thai,ly_do,luc&order=id`,
    { token },
    cauHinh,
    goi,
  );
}

export function tepCuaHoSo(token: string, id: string, cauHinh?: CauHinh, goi?: HamFetch) {
  return goiGateway<TepDaNop[]>(`/files/ho-so/${encodeURIComponent(id)}/tep`, { token }, cauHinh, goi);
}

/** Hồ sơ đã kết thúc (không còn bước nào cho cán bộ). */
export function daKetThuc(h: Pick<HoSoCuaToi, 'trang_thai'>) {
  return h.trang_thai === 'hoan_tat' || h.trang_thai === 'tu_choi';
}

/** Còn hạn xử lý nhưng đã quá hạn (so theo ngày, giờ máy). */
export function quaHan(h: Pick<HoSoCuaToi, 'trang_thai' | 'han_xu_ly'>, homNay = new Date()) {
  if (!h.han_xu_ly || daKetThuc(h)) return false;
  const p = (n: number) => String(n).padStart(2, '0');
  const ngay = `${homNay.getFullYear()}-${p(homNay.getMonth() + 1)}-${p(homNay.getDate())}`;
  return h.han_xu_ly < ngay;
}

export function useHoSoCuaToi() {
  const coPhien = usePhien(s => !!s.phien);
  return useQuery({
    queryKey: khoaTruyVan.hoSoCuaToi,
    queryFn: async () => danhSachHoSo(await usePhien.getState().layToken()),
    enabled: coPhien,
  });
}

export function useChiTietHoSo(id: string) {
  const coPhien = usePhien(s => !!s.phien);
  return useQuery({
    queryKey: khoaTruyVan.chiTietHoSo(id),
    enabled: coPhien,
    queryFn: async () => {
      const token = await usePhien.getState().layToken();
      const [hoSo, lichSu, tep] = await Promise.all([
        layHoSo(token, id),
        lichSuHoSo(token, id),
        // Danh sách giấy tờ lỗi không làm hỏng cả màn.
        tepCuaHoSo(token, id).catch(() => null),
      ]);
      return { hoSo, lichSu, tep };
    },
  });
}

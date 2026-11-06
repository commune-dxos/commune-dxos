// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Danh mục thủ tục: route /public/* của APISIX (không token, role anon, có giới hạn lượt/phút), RLS chỉ
// trả thủ tục công khai. Cùng câu truy vấn với cổng công dân (mot-cua/web-cong-dan/src/lib/api.ts).
import { useQuery } from '@tanstack/react-query';
import { khoaTruyVan } from '../cau-hinh/truy-van';
import { goiGateway, type HamFetch } from './goi-api';
import { chuanHoa } from './dinh-dang';
import type { JsonSchemaHoSo } from './thanh-phan';
import type { CauHinh } from '../cau-hinh/moi-truong';

export interface ThuTuc {
  id: string;
  ma: string;
  ten: string;
  /** Ngày làm việc; 0 = trong ngày. */
  so_ngay_xu_ly: number;
  /** Đồng. */
  le_phi: number;
  ghi_chu_le_phi: string | null;
  /** process id BPMN của gói thu-tuc/<goi>/; null = chưa nhận hồ sơ trực tuyến. */
  quy_trinh: string | null;
  linh_vuc: { ma: string; ten: string } | null;
  /** thanh-phan-ho-so.schema.json của gói; null = thủ tục chưa có gói. */
  json_schema: JsonSchemaHoSo | null;
}

export const DUONG_DAN_DANH_MUC =
  '/public/thu_tuc?select=id,ma,ten,so_ngay_xu_ly,le_phi,ghi_chu_le_phi,quy_trinh,json_schema,' +
  'linh_vuc:linh_vuc_id(ma,ten)&order=ma';

export function layDanhMucThuTuc(cauHinh?: CauHinh, goi?: HamFetch) {
  return goiGateway<ThuTuc[]>(DUONG_DAN_DANH_MUC, {}, cauHinh, goi);
}

/** Nộp trực tuyến được khi thủ tục có quy trình BPMN của gói. */
export function nopTrucTuyen(t: Pick<ThuTuc, 'quy_trinh'>) {
  return !!t.quy_trinh;
}

/** Lọc theo tên, mã, lĩnh vực, không phân biệt dấu. */
export function locThuTuc(ds: ThuTuc[], tuKhoa: string) {
  const k = chuanHoa(tuKhoa);
  if (!k) return ds;
  return ds.filter(t => chuanHoa(`${t.ten} ${t.ma} ${t.linh_vuc?.ten ?? ''}`).includes(k));
}

export function useDanhMucThuTuc() {
  return useQuery({ queryKey: khoaTruyVan.danhMuc, queryFn: () => layDanhMucThuTuc(), staleTime: 10 * 60_000 });
}

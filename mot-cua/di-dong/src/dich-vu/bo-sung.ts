// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Bổ sung hồ sơ (KS01) trên app, cùng luồng với trang "Hồ sơ của tôi" của cổng công dân:
//   1. POST /files/ho-so/{id}/tep               tải thêm ảnh giấy tờ cho từng thành phần
//   2. GET  /workflow/tasks                      tìm bước "bo_sung" đang giao cho người nộp của hồ sơ này
//   3. POST /workflow/tasks/{id}/complete        nộp lại; mot-cua-api kiểm lại đủ thành phần (Poka-yoke #59)
//                                                rồi trả hồ sơ về bước tiếp nhận
// Ảnh đã tải xong được ghi nhớ để bấm lại không tải trùng.
import type { CauHinh } from '../cau-hinh/moi-truong';
import { LoiApi, goiGateway, type HamFetch } from './goi-api';
import { docAnhMacDinh, layIdThanhPhan, taiAnh, type AnhGiayTo } from './nop-ho-so';

interface TaskCuaToi {
  id: string;
  buoc: string;
  ten: string;
  hoSoId: string | null;
}

export const GHI_CHU_TOI_DA = 500;

export const KHONG_CON_BO_SUNG = 'Hồ sơ không còn ở bước chờ bổ sung. Kéo xuống để tải lại trạng thái mới.';

/** Bước "bổ sung" đang chờ người nộp của hồ sơ; null nếu không có. */
export async function taskBoSung(token: string, hoSoId: string, cauHinh?: CauHinh, goi?: HamFetch) {
  const ds = await goiGateway<TaskCuaToi[]>('/workflow/tasks', { token }, cauHinh, goi);
  return ds.find(t => t.hoSoId === hoSoId && t.buoc === 'bo_sung') ?? null;
}

export interface PhuThuocBoSung {
  layToken: () => Promise<string>;
  docAnh?: (uri: string) => Promise<Blob>;
  baoTai?: (thu: number, tong: number) => void;
  cauHinh?: CauHinh;
  goi?: HamFetch;
}

/**
 * Tải các ảnh bổ sung còn chưa tải (theo `daTai`), rồi nộp lại. Không có ảnh mới vẫn nộp lại được: cán bộ
 * có thể chỉ cần người dân xác nhận hoặc ghi chú.
 */
export async function nopBoSung(
  hoSoId: string,
  thuTucId: string,
  anh: Record<string, AnhGiayTo[] | undefined>,
  ghiChu: string,
  daTai: Set<string>,
  { layToken, docAnh = docAnhMacDinh, baoTai, cauHinh, goi }: PhuThuocBoSung,
) {
  const canTai = Object.entries(anh).flatMap(([ma, ds]) => (ds ?? []).map(a => ({ ma, a })));
  if (canTai.some(x => !daTai.has(x.a.uri))) {
    const idThanhPhan = await layIdThanhPhan(thuTucId, cauHinh, goi);
    let thu = 0;
    for (const { ma, a } of canTai) {
      thu += 1;
      if (daTai.has(a.uri)) continue;
      baoTai?.(thu, canTai.length);
      await taiAnh(await layToken(), hoSoId, a, idThanhPhan[ma], docAnh, cauHinh, goi);
      daTai.add(a.uri);
    }
  }
  const task = await taskBoSung(await layToken(), hoSoId, cauHinh, goi);
  if (!task) throw new LoiApi(KHONG_CON_BO_SUNG, 409);
  const gon = ghiChu.trim().slice(0, GHI_CHU_TOI_DA);
  return goiGateway<{ trangThai: string | null }>(
    `/workflow/tasks/${encodeURIComponent(task.id)}/complete`,
    {
      method: 'POST',
      token: await layToken(),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bien: gon ? { ghiChu: gon } : {} }),
    },
    cauHinh,
    goi,
  );
}

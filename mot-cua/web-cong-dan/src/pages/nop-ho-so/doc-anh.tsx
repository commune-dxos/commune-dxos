// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Tự điền từ ảnh giấy tờ (#93), trong thẻ của một thành phần hồ sơ có mẫu đọc: công dân bấm đọc ảnh đã chọn, máy
// (PaddleOCR + VietOCR trên máy chủ) điền các ô, trường máy không chắc được đánh dấu "kiểm tra lại". Công dân sửa
// theo giấy tờ rồi nộp; cán bộ còn so với ảnh gốc và xác nhận lần cuối. Không bấm đọc thì vẫn nộp bình thường.
import { ScanText, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoiApi } from "@/lib/api";
import { laAnh, type KetQuaDocThu, type LoaiGiayTo } from "@/lib/doc-giay-to";

export function DocAnh({
  ma,
  loai,
  tep,
  giaTri,
  doi,
  docThu,
  dungHoTen,
}: {
  ma: string;
  loai: LoaiGiayTo;
  tep: File[];
  /** Giá trị đang khai cho thành phần này; undefined = chưa đọc/chưa khai. */
  giaTri: Record<string, string> | undefined;
  doi: (giaTri: Record<string, string> | undefined) => void;
  docThu: (loai: string, anh: File) => Promise<KetQuaDocThu>;
  /** Giấy tờ tùy thân: dùng họ tên đọc được cho người nộp. */
  dungHoTen?: (hoTen: string) => void;
}) {
  const anh = tep.find(laAnh);
  const [dangDoc, datDangDoc] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);
  const [canKiemTra, datCanKiemTra] = useState<Set<string>>(new Set());

  const doc = async () => {
    if (!anh) return;
    datDangDoc(true);
    datLoi(null);
    try {
      const kq = await docThu(ma, anh);
      doi(Object.fromEntries(loai.truong.map((t) => [t.ma, kq.truong[t.ma]?.gia_tri ?? ""])));
      datCanKiemTra(new Set(loai.truong.filter((t) => !kq.truong[t.ma] || kq.truong[t.ma].can_kiem_tra).map((t) => t.ma)));
    } catch (e) {
      datLoi(e instanceof LoiApi ? e.message : "Chưa đọc được ảnh. Bạn có thể bỏ qua và nộp bình thường.");
    } finally {
      datDangDoc(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-primary bg-primary-soft/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">Tự điền thông tin từ ảnh {loai.ten.toLowerCase()}</p>
        <Button type="button" variant="outline" size="sm" disabled={!anh || dangDoc} onClick={() => void doc()}>
          <ScanText aria-hidden="true" />
          {dangDoc ? "Đang đọc ảnh…" : giaTri ? "Đọc lại ảnh" : "Đọc thông tin từ ảnh"}
        </Button>
      </div>
      {!anh && <p className="text-muted-foreground">Chọn ảnh JPG hoặc PNG của giấy tờ để máy đọc giúp (không bắt buộc).</p>}
      <p role="status" className="sr-only">
        {dangDoc ? "Đang đọc ảnh, vui lòng chờ." : giaTri ? "Đã điền thông tin đọc từ ảnh, hãy kiểm tra lại." : ""}
      </p>
      {loi && (
        <p role="alert" className="flex items-start gap-2">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
          {loi}
        </p>
      )}
      {giaTri && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-muted-foreground">
            Máy đọc có thể sai. Đối chiếu từng ô với giấy tờ và sửa nếu cần; cán bộ sẽ kiểm tra lại với ảnh gốc.
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {loai.truong.map((t) => (
              <Field key={t.ma} className="gap-1">
                <FieldLabel htmlFor={`${ma}-${t.ma}`} className="flex flex-wrap items-center gap-2">
                  {t.nhan}
                  {canKiemTra.has(t.ma) && <Badge variant="outline" className="border-warning">Kiểm tra lại</Badge>}
                </FieldLabel>
                <Input
                  id={`${ma}-${t.ma}`}
                  value={giaTri[t.ma] ?? ""}
                  maxLength={200}
                  onChange={(e) => doi({ ...giaTri, [t.ma]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {dungHoTen && giaTri.ho_ten?.trim() && (
              <Button type="button" variant="secondary" size="sm" onClick={() => dungHoTen(giaTri.ho_ten.trim())}>
                Dùng họ tên này cho người nộp
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => doi(undefined)}>
              Không dùng thông tin đọc được
            </Button>
          </div>
        </fieldset>
      )}
    </div>
  );
}

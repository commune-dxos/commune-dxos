// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Cán bộ xác nhận thông tin đọc từ giấy tờ (#93, Human-in-the-loop). Mỗi tệp có mẫu đọc: mở ảnh gốc, so ba cột –
// máy đọc (kèm độ tin cậy, trường máy không chắc được đánh dấu), công dân khai, giá trị xác nhận (sửa được) – rồi
// bấm xác nhận. Chỉ giá trị cán bộ xác nhận được dùng; sau khi xác nhận không sửa được, CSDL ghi kiểm toán tên các
// trường đã sửa so với máy. Máy chưa đọc (OCR chưa bật) thì cán bộ nhập theo ảnh gốc.
import { CircleCheck, RefreshCw, ScanText } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoiApi } from "@/lib/api";
import { goiYBanDau, type ApiDocGiayTo, type DocGiayTo, type LoaiGiayTo } from "@/lib/doc-giay-to";
import { ngayGio } from "@/lib/han";
import { cn } from "@/lib/utils";

function phanTram(x: number) {
  return `${Math.round(x * 100)}%`;
}

function MotGiayTo({
  doc,
  loai,
  tenTep,
  xemAnh,
  api,
  doi,
}: {
  doc: DocGiayTo;
  loai: LoaiGiayTo;
  tenTep: string;
  xemAnh: () => Promise<string>;
  api: Pick<ApiDocGiayTo, "docLai" | "xacNhan">;
  doi: (moi: DocGiayTo) => void;
}) {
  const daXacNhan = doc.trang_thai === "da_xac_nhan";
  const [giaTri, datGiaTri] = useState(() => goiYBanDau(loai, doc.truong_may, doc.truong_cong_dan));
  const [dang, datDang] = useState<"doc" | "xac-nhan" | null>(null);
  const [loi, datLoi] = useState<string | null>(null);

  const chay = async (viec: "doc" | "xac-nhan") => {
    datDang(viec);
    datLoi(null);
    try {
      const moi = viec === "doc" ? await api.docLai(doc.tep_id) : await api.xacNhan(doc.tep_id, giaTri);
      if (viec === "doc") datGiaTri(goiYBanDau(loai, moi.truong_may, moi.truong_cong_dan));
      doi(moi);
    } catch (e) {
      datLoi(e instanceof LoiApi ? e.message : "Chưa thực hiện được, vui lòng thử lại.");
    } finally {
      datDang(null);
    }
  };

  // Link ký sẵn ngắn hạn: lấy khi bấm rồi hiện thành liên kết (mở cửa sổ sau await bị trình duyệt chặn).
  const [anh, datAnh] = useState<string | null>(null);
  const layAnh = async () => {
    try {
      datAnh(await xemAnh());
    } catch (e) {
      datLoi(e instanceof Error ? e.message : "Không lấy được ảnh.");
    }
  };

  return (
    <section aria-label={`${loai.ten}: ${tenTep}`} className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex flex-wrap items-center gap-2 font-semibold">
          {loai.ten}
          <span className="font-normal break-all text-muted-foreground">{tenTep}</span>
          {daXacNhan ? (
            <Badge>Đã xác nhận</Badge>
          ) : (
            <Badge variant="outline" className="border-warning">
              Chờ xác nhận
            </Badge>
          )}
        </h3>
        <div className="flex flex-wrap gap-2">
          {anh ? (
            <a href={anh} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 px-2 font-semibold text-link underline">
              <ScanText aria-hidden="true" className="size-5" />
              Mở ảnh gốc<span className="sr-only"> {tenTep} (thẻ mới)</span>
            </a>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => void layAnh()}>
              <ScanText aria-hidden="true" />
              Xem ảnh gốc
            </Button>
          )}
          {!daXacNhan && (
            <Button type="button" variant="ghost" size="sm" disabled={!!dang} onClick={() => void chay("doc")}>
              <RefreshCw aria-hidden="true" />
              {dang === "doc" ? "Đang đọc…" : "Máy đọc lại"}
            </Button>
          )}
        </div>
      </div>
      {doc.loi_doc && !doc.truong_may && <p className="text-muted-foreground">Máy chưa đọc được: {doc.loi_doc}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Trường</TableHead>
            <TableHead>Máy đọc</TableHead>
            <TableHead>Công dân khai</TableHead>
            <TableHead>{daXacNhan ? "Đã xác nhận" : "Giá trị xác nhận"}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loai.truong.map((t) => {
            const may = doc.truong_may?.[t.ma];
            const khai = doc.truong_cong_dan?.[t.ma];
            const lech = !!may && khai !== undefined && khai !== may.gia_tri;
            return (
              <TableRow key={t.ma}>
                <TableCell className="font-medium">{t.nhan}</TableCell>
                <TableCell className={cn(may?.can_kiem_tra && "text-warning")}>
                  {may ? (
                    <>
                      {may.gia_tri}
                      <span className="block text-sm text-muted-foreground">
                        tin cậy {phanTram(may.tin_cay)}
                        {may.can_kiem_tra ? " · cần kiểm tra" : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className={cn(lech && "font-semibold")}>
                  {khai ?? <span className="text-muted-foreground">—</span>}
                  {lech && <span className="block text-sm text-warning">khác máy đọc</span>}
                </TableCell>
                <TableCell>
                  {daXacNhan ? (
                    <span className={cn(doc.truong_da_sua?.includes(t.ma) && "font-semibold")}>
                      {doc.truong_xac_nhan?.[t.ma] ?? "—"}
                    </span>
                  ) : (
                    <Input
                      aria-label={`Giá trị xác nhận: ${t.nhan}`}
                      value={giaTri[t.ma] ?? ""}
                      maxLength={200}
                      onChange={(e) => datGiaTri({ ...giaTri, [t.ma]: e.target.value })}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {loi && (
        <p role="alert" className="text-warning">
          {loi}
        </p>
      )}
      {daXacNhan ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <CircleCheck aria-hidden="true" className="size-5 text-primary" />
          Đã xác nhận lúc {doc.xac_nhan_luc ? ngayGio(new Date(doc.xac_nhan_luc)) : "—"}
          {` · sửa ${doc.truong_da_sua?.length ?? 0} trường so với máy đọc`}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={!!dang || !Object.values(giaTri).some((v) => v.trim())} onClick={() => void chay("xac-nhan")}>
            <CircleCheck aria-hidden="true" />
            {dang === "xac-nhan" ? "Đang lưu…" : "Xác nhận đúng với ảnh gốc"}
          </Button>
          <span className="text-sm text-muted-foreground">Sau khi xác nhận không sửa được; thao tác được ghi nhật ký kiểm toán.</span>
        </div>
      )}
    </section>
  );
}

export function XacNhanGiayTo({
  ds,
  loai,
  tenTep,
  xemAnh,
  api,
  doi,
}: {
  ds: DocGiayTo[];
  loai: Record<string, LoaiGiayTo>;
  tenTep: Record<string, string>;
  xemAnh: (tepId: string) => Promise<string>;
  api: Pick<ApiDocGiayTo, "docLai" | "xacNhan">;
  doi: (moi: DocGiayTo) => void;
}) {
  const coMau = ds.filter((d) => loai[d.loai]);
  if (!coMau.length) return null;
  const cho = coMau.filter((d) => d.trang_thai !== "da_xac_nhan").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <h2>Thông tin đọc từ giấy tờ</h2>
          {cho > 0 && <Badge variant="outline" className="border-warning">{cho} chờ xác nhận</Badge>}
        </CardTitle>
        <CardDescription>
          Máy (PaddleOCR + VietOCR) chỉ đề xuất. Mở ảnh gốc, đối chiếu từng trường rồi xác nhận; chỉ giá trị đã xác nhận
          được dùng.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {coMau.map((d) => (
          <MotGiayTo
            key={`${d.tep_id}-${d.trang_thai}-${d.doc_luc ?? ""}`}
            doc={d}
            loai={loai[d.loai]}
            tenTep={tenTep[d.tep_id] ?? ""}
            xemAnh={() => xemAnh(d.tep_id)}
            api={api}
            doi={doi}
          />
        ))}
      </CardContent>
    </Card>
  );
}

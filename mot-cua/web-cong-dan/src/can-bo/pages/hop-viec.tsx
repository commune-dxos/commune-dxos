// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Hộp việc: task Flowable của lĩnh vực mình phụ trách (lãnh đạo: bước phê duyệt), ghép hồ sơ đọc qua
// RLS. Ô số liệu, cảnh báo hạn, bộ lọc (trạng thái nhận, thủ tục, hạn) trên URL để thanh bên và chuông
// dẫn thẳng tới; bảng trên máy tính, danh sách thẻ trên điện thoại. Quá hạn và sắp trễ lên đầu.
import { AlarmClockOff, ChevronRight, FilterX, Hourglass, Inbox, RefreshCw, UserRoundX } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { ThongBao } from "@/components/thong-bao";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GOC_CAN_BO } from "@/auth/oidc";
import { cn } from "@/lib/utils";
import { TheHan } from "../components/the-han";
import { useDuLieuCanBo } from "../du-lieu";
import {
  demTheoHan,
  docBoLoc,
  ghiBoLoc,
  LOC_MAC_DINH,
  locViec,
  TEN_LOC_HAN,
  TEN_LOC_TRANG_THAI,
  thuTucTrongHop,
  type BoLoc,
  type LocHan,
  type LocTrangThai,
  type Viec,
} from "../lib/hop-viec";

const TAT_CA_THU_TUC = "__tat_ca__";

function NguoiNhan({ v }: { v: Viec }) {
  if (v.cuaToi) return <span className="font-semibold text-primary-soft-foreground">Tôi đang xử lý</span>;
  if (v.task.nguoiNhan) return <span className="text-muted-foreground">Cán bộ khác đã nhận</span>;
  return <span>Chưa ai nhận</span>;
}

function OSo({
  nhan,
  so,
  bieuTuong: BieuTuong,
  den,
  nhanManh = false,
}: {
  nhan: string;
  so: number;
  bieuTuong: typeof Inbox;
  den: string;
  nhanManh?: boolean;
}) {
  return (
    <Link to={den} className="rounded-xl no-underline">
      <Card className={cn("gap-2 py-4 transition-colors hover:bg-surface", nhanManh && so > 0 && "border-warning")}>
        <CardContent className="flex items-center justify-between gap-3 px-4">
          <span className="flex flex-col">
            <span className="text-muted-foreground">{nhan}</span>
            <span className={cn("text-3xl font-bold text-foreground", nhanManh && so > 0 && "text-destructive")}>{so}</span>
          </span>
          <BieuTuong aria-hidden="true" className={cn("size-7 text-muted-foreground", nhanManh && so > 0 && "text-warning")} />
        </CardContent>
      </Card>
    </Link>
  );
}

function BoLocHopViec({ loc, datLoc, thuTuc }: { loc: BoLoc; datLoc: (l: BoLoc) => void; thuTuc: { ma: string; ten: string }[] }) {
  const coLoc = loc.trangThai !== "tat_ca" || loc.thuTuc !== "" || loc.han !== "tat_ca";
  return (
    <div role="group" aria-label="Lọc hộp việc" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Trạng thái</span>
        <Select value={loc.trangThai} onValueChange={(v) => datLoc({ ...loc, trangThai: v as LocTrangThai })}>
          <SelectTrigger className="h-11 w-full text-base sm:w-52" aria-label="Lọc theo trạng thái nhận">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TEN_LOC_TRANG_THAI) as LocTrangThai[]).map((k) => (
              <SelectItem key={k} value={k} className="text-base">
                {TEN_LOC_TRANG_THAI[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Thủ tục</span>
        <Select
          value={loc.thuTuc || TAT_CA_THU_TUC}
          onValueChange={(v) => datLoc({ ...loc, thuTuc: v === TAT_CA_THU_TUC ? "" : v })}
        >
          <SelectTrigger className="h-11 w-full text-base sm:w-64" aria-label="Lọc theo thủ tục">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TAT_CA_THU_TUC} className="text-base">
              Mọi thủ tục
            </SelectItem>
            {thuTuc.map((t) => (
              <SelectItem key={t.ma} value={t.ma} className="text-base">
                {t.ma} · {t.ten}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Hạn xử lý</span>
        <Select value={loc.han} onValueChange={(v) => datLoc({ ...loc, han: v as LocHan })}>
          <SelectTrigger className="h-11 w-full text-base sm:w-60" aria-label="Lọc theo hạn xử lý">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TEN_LOC_HAN) as LocHan[]).map((k) => (
              <SelectItem key={k} value={k} className="text-base">
                {TEN_LOC_HAN[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {coLoc && (
        <Button variant="ghost" size="sm" onClick={() => datLoc(LOC_MAC_DINH)}>
          <FilterX aria-hidden="true" />
          Xóa lọc
        </Button>
      )}
    </div>
  );
}

function DuongDanHoSo({ v, children, className }: { v: Viec; children: React.ReactNode; className?: string }) {
  return v.task.hoSoId ? (
    <Link to={`${GOC_CAN_BO}/ho-so/${v.task.hoSoId}`} className={className}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}

function BangViec({ ds }: { ds: Viec[] }) {
  return (
    <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
      <Table className="text-base">
        <TableHeader className="bg-surface">
          <TableRow>
            <TableHead className="h-12 px-4 text-base font-semibold">Hồ sơ</TableHead>
            <TableHead className="text-base font-semibold">Người nộp</TableHead>
            <TableHead className="text-base font-semibold">Bước hiện tại</TableHead>
            <TableHead className="text-base font-semibold">Hạn xử lý</TableHead>
            <TableHead className="text-base font-semibold">
              <span className="sr-only">Thao tác</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ds.map((v) => (
            <TableRow key={v.task.id} data-muc-han={v.han.muc} className={cn(v.han.muc === "qua_han" && "bg-destructive-soft/60")}>
              <TableCell className="px-4 py-3 align-top whitespace-normal">
                <DuongDanHoSo v={v} className="font-semibold text-link">
                  {v.task.maHoSo ?? "Không rõ mã"}
                </DuongDanHoSo>
                <div className="text-muted-foreground">
                  {v.hoSo?.thu_tuc ? `${v.hoSo.thu_tuc.ma} · ${v.hoSo.thu_tuc.ten}` : "Không đọc được hồ sơ"}
                </div>
              </TableCell>
              <TableCell className="py-3 align-top whitespace-normal">
                <div>{v.hoSo?.ho_ten_nguoi_nop ?? "—"}</div>
                {v.hoSo?.so_dien_thoai && <div className="text-muted-foreground">{v.hoSo.so_dien_thoai}</div>}
              </TableCell>
              <TableCell className="py-3 align-top whitespace-normal">
                <div className="font-medium">{v.task.ten}</div>
                <NguoiNhan v={v} />
              </TableCell>
              <TableCell className="py-3 align-top">
                <TheHan han={v.han} />
              </TableCell>
              <TableCell className="py-3 pr-4 text-right align-top">
                {v.task.hoSoId && (
                  <Link
                    to={`${GOC_CAN_BO}/ho-so/${v.task.hoSoId}`}
                    className={buttonVariants({ variant: v.task.nguoiNhan && !v.cuaToi ? "outline" : "default", size: "sm" })}
                    aria-label={`Xử lý hồ sơ ${v.task.maHoSo ?? ""}`}
                  >
                    Xử lý
                    <ChevronRight aria-hidden="true" />
                  </Link>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DanhSachThe({ ds }: { ds: Viec[] }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden" aria-label="Hồ sơ trong hộp việc">
      {ds.map((v) => (
        <li key={v.task.id}>
          <DuongDanHoSo
            v={v}
            className={cn(
              "flex flex-col gap-2 rounded-xl border bg-card p-4 text-foreground no-underline shadow-the",
              v.han.muc === "qua_han" && "border-destructive",
              v.han.muc === "sap_tre" && "border-warning",
            )}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="font-semibold text-link underline">{v.task.maHoSo ?? "Không rõ mã"}</span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            </span>
            <span className="text-muted-foreground">{v.hoSo?.thu_tuc ? `${v.hoSo.thu_tuc.ma} · ${v.hoSo.thu_tuc.ten}` : ""}</span>
            <span>
              {v.hoSo?.ho_ten_nguoi_nop ?? "—"} · <span className="font-medium">{v.task.ten}</span>
            </span>
            <NguoiNhan v={v} />
            <TheHan han={v.han} />
          </DuongDanHoSo>
        </li>
      ))}
    </ul>
  );
}

export function HopViec() {
  const { viec, dangTai, loi, taiLai, vaiTro, canBo } = useDuLieuCanBo();
  const [q, datQ] = useSearchParams();
  const loc = docBoLoc(q);
  const ds = locViec(viec, loc);
  const dem = demTheoHan(viec);
  const chuaNhan = viec.filter((v) => v.task.nguoiNhan === null).length;

  useEffect(() => {
    document.title = "Hộp việc – Cổng cán bộ – Commune DX-OS";
  }, []);

  const moTa =
    vaiTro === "lanh_dao"
      ? "Các bước cần lãnh đạo phê duyệt, ký."
      : canBo && canBo.linh_vuc.length > 0
        ? `Hồ sơ thuộc lĩnh vực bạn phụ trách: ${canBo.linh_vuc.map((l) => l.ten).join(", ")}.`
        : "Hồ sơ thuộc lĩnh vực bạn phụ trách.";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hộp việc</h1>
          <p className="text-muted-foreground">{moTa}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void taiLai()}>
          <RefreshCw aria-hidden="true" />
          Làm mới
        </Button>
      </div>

      {dem.qua_han + dem.sap_tre > 0 && (
        <Alert role="status" className="border-warning bg-destructive-soft">
          <AlarmClockOff aria-hidden="true" className="text-warning" />
          <AlertTitle className="font-semibold">
            {[dem.qua_han && `${dem.qua_han} hồ sơ quá hạn`, dem.sap_tre && `${dem.sap_tre} hồ sơ sắp trễ hạn (còn ≤ 1 ngày)`]
              .filter(Boolean)
              .join(", ")}
          </AlertTitle>
          <AlertDescription>
            <Link to={`${GOC_CAN_BO}?han=can_chu_y`} className="font-semibold text-link">
              Xem các hồ sơ cần chú ý
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OSo nhan="Tổng việc" so={viec.length} bieuTuong={Inbox} den={GOC_CAN_BO} />
        <OSo nhan="Chưa ai nhận" so={chuaNhan} bieuTuong={UserRoundX} den={`${GOC_CAN_BO}?trang_thai=chua_nhan`} />
        <OSo nhan="Sắp trễ hạn" so={dem.sap_tre} bieuTuong={Hourglass} den={`${GOC_CAN_BO}?han=sap_tre`} nhanManh />
        <OSo nhan="Quá hạn" so={dem.qua_han} bieuTuong={AlarmClockOff} den={`${GOC_CAN_BO}?han=qua_han`} nhanManh />
      </div>

      <BoLocHopViec loc={loc} datLoc={(l) => datQ(ghiBoLoc(l), { replace: true })} thuTuc={thuTucTrongHop(viec)} />

      {loi ? (
        <ThongBao role="alert" loai="loi" tieuDe="Không tải được hộp việc" hanhDong={<Button onClick={() => void taiLai()}>Thử lại</Button>}>
          {loi}
        </ThongBao>
      ) : dangTai ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Đang tải hộp việc">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : ds.length === 0 ? (
        <ThongBao
          loai="trong"
          tieuDe={viec.length === 0 ? "Hộp việc trống" : "Không có hồ sơ khớp bộ lọc"}
          bieuTuong={Inbox}
          hanhDong={
            viec.length > 0 && (
              <Button variant="outline" onClick={() => datQ(new URLSearchParams(), { replace: true })}>
                Xóa lọc
              </Button>
            )
          }
        >
          {viec.length === 0 ? "Chưa có hồ sơ nào chờ bạn xử lý. Hồ sơ mới nộp sẽ hiện ở đây." : "Thử bỏ bớt điều kiện lọc."}
        </ThongBao>
      ) : (
        <section aria-label={`Kết quả: ${ds.length} hồ sơ`} className="flex flex-col gap-3">
          <p className="text-muted-foreground" aria-live="polite">
            {ds.length} hồ sơ{ds.length !== viec.length ? ` (lọc từ ${viec.length})` : ""}
          </p>
          <BangViec ds={ds} />
          <DanhSachThe ds={ds} />
        </section>
      )}
    </>
  );
}

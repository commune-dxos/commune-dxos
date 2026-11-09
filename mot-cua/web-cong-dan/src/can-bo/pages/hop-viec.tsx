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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GOC_CAN_BO } from "@/auth/oidc";
import { cn } from "@/lib/utils";
import { TheHan } from "@/components/the-han";
import { useDuLieuCanBo } from "../du-lieu";
import { TEN_VAI_TRO } from "../lib/quyen";
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

/** Thẻ số liệu điều hành sáng sủa, có thanh chỉ báo ngữ nghĩa bên trái. */
const MAU_O = {
  toi: {
    vien: "border-l-slate-800 hover:border-slate-400",
    icon: "bg-slate-100 text-slate-700",
    so: "text-slate-950",
  },
  chinh: {
    vien: "border-l-teal-600 hover:border-teal-500",
    icon: "bg-teal-50 text-teal-700",
    so: "text-teal-900",
  },
  cam: {
    vien: "border-l-amber-500 hover:border-amber-500",
    icon: "bg-amber-50 text-amber-800",
    so: "text-amber-900",
  },
  do: {
    vien: "border-l-rose-600 hover:border-rose-500",
    icon: "bg-rose-50 text-rose-700",
    so: "text-rose-700",
  },
};

function OSo({
  nhan,
  so,
  bieuTuong: BieuTuong,
  den,
  mau,
}: {
  nhan: string;
  so: number;
  bieuTuong: typeof Inbox;
  den: string;
  mau: keyof typeof MAU_O;
}) {
  const k = MAU_O[mau];
  return (
    <Link
      to={den}
      className={cn(
        "group relative flex flex-col justify-between gap-2.5 rounded-xl border border-slate-200/90 border-l-4 bg-white p-4 text-slate-900 no-underline shadow-the transition-all hover:shadow-md",
        k.vien,
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">{nhan}</span>
        <span aria-hidden="true" className={cn("flex size-8 items-center justify-center rounded-lg transition-transform group-hover:scale-105", k.icon)}>
          <BieuTuong className="size-4.5" />
        </span>
      </span>
      <span className={cn("text-3xl leading-none font-black tracking-tight tabular-nums", k.so)}>{so}</span>
    </Link>
  );
}

function BoLocHopViec({ loc, datLoc, thuTuc }: { loc: BoLoc; datLoc: (l: BoLoc) => void; thuTuc: { ma: string; ten: string }[] }) {
  const coLoc = loc.trangThai !== "tat_ca" || loc.thuTuc !== "" || loc.han !== "tat_ca";
  return (
    <div role="group" aria-label="Lọc hộp việc" className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white p-4 shadow-the sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold tracking-wider text-slate-600 uppercase">Trạng thái</span>
        <Select value={loc.trangThai} onValueChange={(v) => datLoc({ ...loc, trangThai: v as LocTrangThai })}>
          <SelectTrigger className="h-10 w-full bg-slate-50/80 text-base sm:w-52" aria-label="Lọc theo trạng thái nhận">
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
        <span className="text-xs font-bold tracking-wider text-slate-600 uppercase">Thủ tục</span>
        <Select
          value={loc.thuTuc || TAT_CA_THU_TUC}
          onValueChange={(v) => datLoc({ ...loc, thuTuc: v === TAT_CA_THU_TUC ? "" : v })}
        >
          <SelectTrigger className="h-10 w-full bg-slate-50/80 text-base sm:w-64" aria-label="Lọc theo thủ tục">
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
        <span className="text-xs font-bold tracking-wider text-slate-600 uppercase">Hạn xử lý</span>
        <Select value={loc.han} onValueChange={(v) => datLoc({ ...loc, han: v as LocHan })}>
          <SelectTrigger className="h-10 w-full bg-slate-50/80 text-base sm:w-60" aria-label="Lọc theo hạn xử lý">
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
    <div className="hidden overflow-hidden rounded-2xl border border-slate-200/90 bg-card shadow-the md:block">
      <Table className="text-base">
        <TableHeader className="border-b border-slate-200 bg-slate-50/90">
          <TableRow>
            <TableHead className="h-11 px-4 text-sm font-bold text-slate-700">Hồ sơ</TableHead>
            <TableHead className="text-sm font-bold text-slate-700">Người nộp</TableHead>
            <TableHead className="text-sm font-bold text-slate-700">Bước hiện tại</TableHead>
            <TableHead className="text-sm font-bold text-slate-700">Hạn xử lý</TableHead>
            <TableHead className="text-sm font-bold text-slate-700">
              <span className="sr-only">Thao tác</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ds.map((v) => (
            <TableRow key={v.task.id} data-muc-han={v.han.muc} className={cn("transition-colors hover:bg-slate-50/70", v.han.muc === "qua_han" && "bg-destructive-soft/50")}>
              <TableCell className="px-4 py-3.5 align-top whitespace-normal">
                <DuongDanHoSo v={v} className="font-mono font-bold text-primary hover:underline">
                  {v.task.maHoSo ?? "Không rõ mã"}
                </DuongDanHoSo>
                <div className="mt-0.5 text-sm text-slate-600">
                  {v.hoSo?.thu_tuc ? `${v.hoSo.thu_tuc.ma} · ${v.hoSo.thu_tuc.ten}` : "Không đọc được hồ sơ"}
                </div>
              </TableCell>
              <TableCell className="py-3.5 align-top whitespace-normal">
                <div className="font-semibold text-slate-900">{v.hoSo?.ho_ten_nguoi_nop ?? "—"}</div>
                {v.hoSo?.so_dien_thoai && <div className="font-mono text-sm text-slate-500">{v.hoSo.so_dien_thoai}</div>}
              </TableCell>
              <TableCell className="py-3.5 align-top whitespace-normal">
                <div className="font-semibold text-slate-900">{v.task.ten}</div>
                <div className="text-sm">
                  <NguoiNhan v={v} />
                </div>
              </TableCell>
              <TableCell className="py-3.5 align-top">
                <TheHan han={v.han} />
              </TableCell>
              <TableCell className="py-3.5 pr-4 text-right align-top">
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
              "flex flex-col gap-2 rounded-2xl border border-slate-100 bg-card p-4 text-foreground no-underline shadow-the",
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
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div className="flex flex-col gap-1 border-l-4 border-primary pl-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Hộp việc</h1>
            <span className="rounded-md border border-teal-700/20 bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-900">
              {TEN_VAI_TRO[vaiTro]}
            </span>
          </div>
          <p className="text-slate-600">{moTa}</p>
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <OSo nhan="Tổng việc" so={viec.length} bieuTuong={Inbox} den={GOC_CAN_BO} mau="toi" />
        <OSo nhan="Chưa ai nhận" so={chuaNhan} bieuTuong={UserRoundX} den={`${GOC_CAN_BO}?trang_thai=chua_nhan`} mau="chinh" />
        <OSo nhan="Sắp trễ hạn" so={dem.sap_tre} bieuTuong={Hourglass} den={`${GOC_CAN_BO}?han=sap_tre`} mau="cam" />
        <OSo nhan="Quá hạn" so={dem.qua_han} bieuTuong={AlarmClockOff} den={`${GOC_CAN_BO}?han=qua_han`} mau="do" />
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

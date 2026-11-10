// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Tra cứu tiến độ hồ sơ không cần đăng nhập (#54): mã hồ sơ trên biên nhận + 4 số cuối số điện thoại
// đã khai khi nộp. Chỉ hiện trạng thái, các bước và mốc thời gian; lý do bổ sung, giấy tờ, biên nhận và
// nộp bổ sung cần đăng nhập (trang Hồ sơ của tôi). Sai mã hay sai số cùng một câu trả lời.
import { FileCheck2, FolderOpen, LogIn, Receipt, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useXacThuc } from "@/auth/xac-thuc";
import { CacBuocHoSo, NhanTrangThai } from "@/components/cac-buoc-ho-so";
import { Khung } from "@/components/khung";
import { DaiTieuDe } from "@/components/tieu-de-muc";
import { TheHan } from "@/components/the-han";
import { ThongBao } from "@/components/thong-bao";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoiApi } from "@/lib/api";
import { ngay } from "@/lib/dinh-dang";
import { danhGiaHan, hanLuc, ngayGio } from "@/lib/han";
import { cacBuoc, dongLichSu, LOI_NHAN } from "@/lib/tien-do";
import { useTieuDeTrang } from "@/lib/tieu-de";
import { kiemNhapTraCuu, traCuuCongKhai, type KetQuaTraCuu } from "@/lib/tra-cuu";

type TrangThai =
  | { loai: "nhap" }
  | { loai: "dang-tim" }
  | { loai: "khong-thay" }
  | { loai: "loi"; thongDiep: string }
  | { loai: "thay"; hoSo: KetQuaTraCuu };

export function KetQuaHoSo({
  hoSo,
  loiNhan,
  bayGio = new Date(),
}: {
  hoSo: KetQuaTraCuu;
  /** Thay lời nhắn mặc định (trang đã đăng nhập không cần "Đăng nhập để…"). */
  loiNhan?: string;
  bayGio?: Date;
}) {
  const dong = hoSo.trang_thai === "hoan_tat" || hoSo.trang_thai === "tu_choi";
  return (
    <Card>
      <CardHeader className="gap-2">
        <CardDescription className="text-base">{hoSo.thu_tuc.ten}</CardDescription>
        <CardTitle className="flex flex-wrap items-center gap-3 text-2xl">
          <h2 className="tabular-nums">{hoSo.ma_ho_so}</h2>
          <NhanTrangThai trangThai={hoSo.trang_thai} />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Ngày nộp</dt>
            <dd className="font-semibold">{ngayGio(new Date(hoSo.ngay_nhan))}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Hạn giải quyết</dt>
            <dd className="font-semibold">
              {dong || !hoSo.han_xu_ly ? (hoSo.han_xu_ly ? ngay(hoSo.han_xu_ly) : "Chưa có") : (
                <TheHan han={danhGiaHan(hanLuc(null, hoSo.han_xu_ly), bayGio)} />
              )}
            </dd>
          </div>
          {hoSo.ngay_hoan_tat && (
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Ngày có kết quả</dt>
              <dd className="font-semibold">{ngayGio(new Date(hoSo.ngay_hoan_tat))}</dd>
            </div>
          )}
        </dl>
        <p className="text-lg" role="note">
          {loiNhan ?? LOI_NHAN[hoSo.trang_thai] ?? "Hồ sơ đang được xử lý."}
        </p>
        <CacBuocHoSo buoc={cacBuoc(hoSo.trang_thai, hoSo.lich_su, hoSo.ngay_nhan)} />
        {hoSo.lich_su.length > 0 && (
          <section aria-labelledby="moc-thoi-gian" className="flex flex-col gap-3">
            <h3 id="moc-thoi-gian" className="text-lg font-bold">
              Các mốc thời gian
            </h3>
            <ul className="flex flex-col divide-y divide-slate-100 rounded-2xl border border-slate-100">
              {hoSo.lich_su.map((m, i) => (
                <li key={`${m.luc}-${i}`} className="flex flex-wrap justify-between gap-x-6 gap-y-1 px-4 py-3">
                  <span>{dongLichSu(m)}</span>
                  <span className="text-muted-foreground tabular-nums">{ngayGio(new Date(m.luc))}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

export function TraCuu({ traCuu = traCuuCongKhai }: { traCuu?: typeof traCuuCongKhai }) {
  const [tham] = useSearchParams();
  const { nguoiDung, dangNhap } = useXacThuc();
  const [ma, datMa] = useState(tham.get("ma") ?? "");
  const [soCuoi, datSoCuoi] = useState("");
  const [loi, datLoi] = useState<{ ma?: string; soCuoi?: string }>({});
  const [trangThai, datTrangThai] = useState<TrangThai>({ loai: "nhap" });
  useTieuDeTrang("Tra cứu hồ sơ");

  const gui = async (e: FormEvent) => {
    e.preventDefault();
    const l = kiemNhapTraCuu(ma, soCuoi);
    datLoi(l);
    if (l.ma || l.soCuoi) return;
    datTrangThai({ loai: "dang-tim" });
    try {
      const hoSo = await traCuu(ma, soCuoi);
      datTrangThai(hoSo ? { loai: "thay", hoSo } : { loai: "khong-thay" });
    } catch (e) {
      datTrangThai({ loai: "loi", thongDiep: e instanceof LoiApi ? e.message : "Chưa tra cứu được. Vui lòng thử lại." });
    }
  };

  const o = (id: "ma" | "soCuoi", goiY: string) => ({
    id: `tra-cuu-${id}`,
    "aria-required": true,
    "aria-invalid": loi[id] ? true : undefined,
    "aria-describedby": [goiY, loi[id] && `tra-cuu-${id}-loi`].filter(Boolean).join(" "),
  });

  return (
    <>
    <DaiTieuDe hep nhan="Theo dõi tiến độ xử lý" tieuDe="Tra cứu hồ sơ" moTa="Xem hồ sơ đang ở bước nào và khi nào có kết quả, không cần đăng nhập." />
    <Khung className="flex max-w-5xl flex-col gap-8">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form
          noValidate
          onSubmit={(e) => void gui(e)}
          className="relative flex flex-col gap-6 rounded-2xl border border-slate-200/90 bg-card p-6 shadow-the sm:p-8"
          aria-label="Tra cứu hồ sơ"
        >
          <FieldGroup className="gap-6 [&_[data-invalid=true]]:border-l-4 [&_[data-invalid=true]]:border-warning [&_[data-invalid=true]]:pl-4">
            <Field data-invalid={!!loi.ma}>
              <FieldLabel htmlFor="tra-cuu-ma" className="text-lg font-bold text-slate-900">
                Mã hồ sơ
              </FieldLabel>
              <FieldDescription id="tra-cuu-ma-goi-y">In trên giấy tiếp nhận và hẹn trả kết quả (ví dụ: HS20261024-000123)</FieldDescription>
              {loi.ma && <FieldError role={undefined} id="tra-cuu-ma-loi">{loi.ma}</FieldError>}
              <Input
                {...o("ma", "tra-cuu-ma-goi-y")}
                autoComplete="off"
                spellCheck={false}
                placeholder="HS20261024-000123"
                className="h-13 font-mono text-lg uppercase tabular-nums md:text-lg"
                value={ma}
                onChange={(e) => datMa(e.target.value)}
              />
            </Field>
            <Field data-invalid={!!loi.soCuoi}>
              <FieldLabel htmlFor="tra-cuu-soCuoi" className="text-lg font-bold text-slate-900">
                4 số cuối số điện thoại
              </FieldLabel>
              <FieldDescription id="tra-cuu-so-goi-y">Số điện thoại đã khai khi nộp hồ sơ để bảo mật thông tin người nộp.</FieldDescription>
              {loi.soCuoi && <FieldError role={undefined} id="tra-cuu-soCuoi-loi">{loi.soCuoi}</FieldError>}
              <Input
                {...o("soCuoi", "tra-cuu-so-goi-y")}
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder="••••"
                className="h-13 max-w-44 font-mono text-lg tracking-[0.3em] tabular-nums md:text-lg"
                value={soCuoi}
                onChange={(e) => datSoCuoi(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
          </FieldGroup>
          <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-start" disabled={trangThai.loai === "dang-tim"}>
            <Search aria-hidden="true" />
            {trangThai.loai === "dang-tim" ? "Đang tra cứu…" : "Tra cứu"}
          </Button>
        </form>

        <aside className="relative flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-6 shadow-2xs">
          <h2 id="ma-o-dau" className="text-xl font-black tracking-tight text-slate-900">
            Mã hồ sơ nằm ở đâu?
          </h2>
          <ul className="flex flex-col gap-3.5 text-sm text-slate-700">
            {[
              { bt: FileCheck2, ten: "Trang “Đã nộp hồ sơ”", moTa: "hiện ngay sau khi hoàn tất gửi hồ sơ trực tuyến." },
              { bt: Receipt, ten: "Biên nhận hồ sơ", moTa: "bản PDF có chữ ký số của xã, hoặc giấy biên nhận tại quầy Một cửa." },
              { bt: FolderOpen, ten: "Mục Hồ sơ của tôi", moTa: "khi đăng nhập bằng tài khoản công dân đã nộp hồ sơ." },
            ].map(({ bt: BieuTuong, ten, moTa }) => (
              <li key={ten} className="flex gap-3">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-teal-600/20 bg-white text-primary shadow-2xs [&_svg]:size-4.5">
                  <BieuTuong />
                </span>
                <span>
                  <strong className="text-slate-900">{ten}:</strong> {moTa}
                </span>
              </li>
            ))}
          </ul>
          <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
            Cấu trúc mã gồm tiền tố <strong className="text-slate-900">HS</strong> + ngày nộp + số thứ tự, ví dụ{" "}
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono font-bold text-slate-900 whitespace-nowrap tabular-nums">HS20261024-000123</span>.
          </p>
        </aside>
      </div>

      <div aria-live="polite" className="flex flex-col gap-6">
        {trangThai.loai === "khong-thay" && (
          <ThongBao loai="trong" tieuDe="Không tìm thấy hồ sơ khớp mã và số điện thoại" role="status">
            Kiểm tra lại mã trên biên nhận và 4 số cuối số điện thoại đã khai. Hồ sơ nộp không kèm số điện thoại thì
            đăng nhập để xem trong "Hồ sơ của tôi", hoặc hỏi bộ phận một cửa của xã.
          </ThongBao>
        )}
        {trangThai.loai === "loi" && (
          <ThongBao loai="loi" tieuDe="Chưa tra cứu được" role="alert">
            {trangThai.thongDiep}
          </ThongBao>
        )}
        {trangThai.loai === "thay" && (
          <>
            <KetQuaHoSo hoSo={trangThai.hoSo} />
            {nguoiDung ? (
              <Link to="/ho-so" className={buttonVariants({ variant: "outline", className: "self-start" })}>
                Xem chi tiết trong Hồ sơ của tôi
              </Link>
            ) : (
              <Button variant="outline" className="self-start" onClick={() => void dangNhap("/ho-so")}>
                <LogIn aria-hidden="true" />
                Đăng nhập để xem giấy tờ, tải biên nhận, nộp bổ sung
              </Button>
            )}
          </>
        )}
      </div>
    </Khung>
    </>
  );
}

// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Tra cứu tiến độ hồ sơ không cần đăng nhập (#54): mã hồ sơ trên biên nhận + 4 số cuối số điện thoại
// đã khai khi nộp. Chỉ hiện trạng thái, các bước và mốc thời gian; lý do bổ sung, giấy tờ, biên nhận và
// nộp bổ sung cần đăng nhập (trang Hồ sơ của tôi). Sai mã hay sai số cùng một câu trả lời.
import { LogIn, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useXacThuc } from "@/auth/xac-thuc";
import { CacBuocHoSo, NhanTrangThai } from "@/components/cac-buoc-ho-so";
import { Khung } from "@/components/khung";
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
            <ul className="flex flex-col divide-y rounded-md border">
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
    <Khung className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">Tra cứu hồ sơ</h1>
        <p className="text-lg text-muted-foreground">
          Xem hồ sơ đang ở bước nào mà không cần đăng nhập. Mã hồ sơ in trên biên nhận và trang "Đã nộp".
        </p>
      </div>
      <form noValidate onSubmit={(e) => void gui(e)} className="flex flex-col gap-6" aria-label="Tra cứu hồ sơ">
        <FieldGroup className="gap-6 [&_[data-invalid=true]]:border-l-4 [&_[data-invalid=true]]:border-warning [&_[data-invalid=true]]:pl-4">
          <Field data-invalid={!!loi.ma}>
            <FieldLabel htmlFor="tra-cuu-ma">Mã hồ sơ</FieldLabel>
            <FieldDescription id="tra-cuu-ma-goi-y">Ví dụ: HS20261024-000123</FieldDescription>
            {loi.ma && <FieldError role={undefined} id="tra-cuu-ma-loi">{loi.ma}</FieldError>}
            <Input
              {...o("ma", "tra-cuu-ma-goi-y")}
              autoComplete="off"
              spellCheck={false}
              className="max-w-80 uppercase tabular-nums"
              value={ma}
              onChange={(e) => datMa(e.target.value)}
            />
          </Field>
          <Field data-invalid={!!loi.soCuoi}>
            <FieldLabel htmlFor="tra-cuu-soCuoi">4 số cuối số điện thoại</FieldLabel>
            <FieldDescription id="tra-cuu-so-goi-y">Số điện thoại đã khai khi nộp hồ sơ, để chỉ người nộp xem được.</FieldDescription>
            {loi.soCuoi && <FieldError role={undefined} id="tra-cuu-soCuoi-loi">{loi.soCuoi}</FieldError>}
            <Input
              {...o("soCuoi", "tra-cuu-so-goi-y")}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              className="max-w-32 tabular-nums"
              value={soCuoi}
              onChange={(e) => datSoCuoi(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        </FieldGroup>
        <Button type="submit" className="self-start" disabled={trangThai.loai === "dang-tim"}>
          <Search aria-hidden="true" />
          {trangThai.loai === "dang-tim" ? "Đang tra cứu…" : "Tra cứu"}
        </Button>
      </form>

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
  );
}

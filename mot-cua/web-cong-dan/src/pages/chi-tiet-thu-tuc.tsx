// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Chi tiết một thủ tục: các bước, thành phần hồ sơ (từ JSON Schema của gói), thời hạn, lệ phí,
// nút "Bắt đầu nộp". Bố cục 2 cột trên máy tính, tóm tắt + nút lên đầu trên điện thoại.
import { ArrowRight, Banknote, Building2, CircleCheck, Clock, FileText, MessageCircleQuestionMark } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Khung } from "@/components/khung";
import { TaiThuTuc } from "@/components/tai-thu-tuc";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ThuTuc } from "@/lib/api";
import { lePhi, thoiHan } from "@/lib/dinh-dang";
import { docThanhPhan, type ThanhPhan } from "@/lib/thanh-phan";

export function ViTri({ ten }: { ten: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/">Trang chủ</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{ten}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function Muc({ id, tieuDe, children }: { id: string; tieuDe: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-2xl font-bold">
        {tieuDe}
      </h2>
      {children}
    </section>
  );
}

function DanhSachGiayTo({ ds }: { ds: ThanhPhan[] }) {
  return (
    <ul className="flex flex-col divide-y rounded-md border bg-card">
      {ds.map((t) => (
        <li key={t.ma} className="flex gap-3 p-4">
          <FileText aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">{t.ten}</span>
            {t.moTa && <span className="text-muted-foreground">{t.moTa}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function TomTat({ thuTuc }: { thuTuc: ThuTuc }) {
  return (
    <Card className="gap-5 py-6">
      <CardContent className="flex flex-col gap-5">
        <dl className="flex flex-col gap-4">
          {[
            { bt: <Clock />, nhan: "Thời hạn giải quyết", gt: thoiHan(thuTuc.so_ngay_xu_ly) },
            { bt: <Banknote />, nhan: "Lệ phí", gt: lePhi(thuTuc.le_phi), phu: thuTuc.ghi_chu_le_phi },
            { bt: <Building2 />, nhan: "Nơi nộp", gt: "Trực tuyến hoặc bộ phận một cửa của xã" },
          ].map((d) => (
            <div key={d.nhan} className="flex gap-3">
              <span aria-hidden="true" className="mt-1 text-primary [&_svg]:size-5">
                {d.bt}
              </span>
              <div>
                <dt className="text-sm text-muted-foreground">{d.nhan}</dt>
                <dd className="font-semibold">{d.gt}</dd>
                {d.phu && <dd className="text-muted-foreground">{d.phu}</dd>}
              </div>
            </div>
          ))}
        </dl>
        {thuTuc.quy_trinh ? (
          <div className="flex flex-col gap-2">
            <Link
              to={`/nop-ho-so/${encodeURIComponent(thuTuc.ma)}`}
              className={buttonVariants({ size: "lg", className: "w-full" })}
            >
              Bắt đầu nộp
              <ArrowRight aria-hidden="true" />
            </Link>
            <p className="text-sm text-muted-foreground">Cần đăng nhập bằng tài khoản công dân.</p>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Thủ tục này chưa nhận hồ sơ trực tuyến, vui lòng nộp tại bộ phận một cửa.
          </p>
        )}
        <Link
          to={`/hoi-dap?ma=${encodeURIComponent(thuTuc.ma)}`}
          className={buttonVariants({ variant: "outline", className: "w-full" })}
        >
          <MessageCircleQuestionMark aria-hidden="true" />
          Hỏi trợ lý về thủ tục này
        </Link>
      </CardContent>
    </Card>
  );
}

function NoiDung({ thuTuc }: { thuTuc: ThuTuc }) {
  const tp = docThanhPhan(thuTuc.json_schema);
  const batBuoc = tp.filter((t) => t.batBuoc);
  const neuCo = tp.filter((t) => !t.batBuoc);
  const cacBuoc = [
    { ten: "Chuẩn bị giấy tờ", moTa: "Chụp ảnh hoặc quét rõ từng giấy tờ trong danh sách bên dưới." },
    { ten: "Nộp hồ sơ trực tuyến", moTa: "Điền thông tin người nộp, tải giấy tờ, kiểm tra lại rồi nộp." },
    { ten: "Cán bộ xử lý", moTa: "Bộ phận một cửa tiếp nhận, cán bộ chuyên môn thẩm định, lãnh đạo xã phê duyệt." },
    { ten: "Nhận kết quả", moTa: `Trong ${thoiHan(thuTuc.so_ngay_xu_ly).toLowerCase()} kể từ khi hồ sơ được tiếp nhận.` },
  ];
  return (
    <Khung className="flex flex-col gap-6">
      <ViTri ten={thuTuc.ten} />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
        <div className="flex flex-col gap-10">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {thuTuc.linh_vuc && <Badge variant="secondary">{thuTuc.linh_vuc.ten}</Badge>}
              <span className="text-sm text-muted-foreground">
                Mã thủ tục <span className="font-semibold text-foreground">{thuTuc.ma}</span>
              </span>
            </div>
            <h1 className="text-3xl font-bold sm:text-4xl">{thuTuc.ten}</h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Chuẩn bị giấy tờ theo danh sách dưới đây, nộp trực tuyến rồi theo dõi hồ sơ đang ở bước nào.
            </p>
          </header>

          <div className="lg:hidden">
            <TomTat thuTuc={thuTuc} />
          </div>

          <Muc id="cac-buoc" tieuDe="Các bước">
            <ol className="flex flex-col">
              {cacBuoc.map((b, i) => (
                <li key={b.ten} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < cacBuoc.length - 1 && (
                    <span aria-hidden="true" className="absolute top-11 bottom-1 left-[21px] w-0.5 bg-border" />
                  )}
                  <span
                    aria-hidden="true"
                    className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-lg font-bold text-primary"
                  >
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1 pt-1.5">
                    <span className="text-lg font-semibold">{b.ten}</span>
                    <span className="text-muted-foreground">{b.moTa}</span>
                  </div>
                </li>
              ))}
            </ol>
          </Muc>

          <Muc id="thanh-phan" tieuDe="Thành phần hồ sơ">
            {batBuoc.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <CircleCheck aria-hidden="true" className="size-5 text-warning" />
                  Bắt buộc ({batBuoc.length})
                </h3>
                <DanhSachGiayTo ds={batBuoc} />
              </div>
            )}
            {neuCo.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-lg font-semibold">Nộp thêm nếu có</h3>
                <DanhSachGiayTo ds={neuCo} />
              </div>
            )}
            {tp.length === 0 && <p>Thủ tục chưa có danh sách thành phần hồ sơ. Vui lòng hỏi bộ phận một cửa.</p>}
          </Muc>
        </div>

        <aside aria-label="Tóm tắt thủ tục" className="hidden lg:block">
          <div className="sticky top-6">
            <TomTat thuTuc={thuTuc} />
          </div>
        </aside>
      </div>
    </Khung>
  );
}

export function ChiTietThuTuc({ taiDanhMuc }: { taiDanhMuc?: () => Promise<ThuTuc[]> }) {
  const { ma = "" } = useParams();
  return <TaiThuTuc ma={ma} taiDanhMuc={taiDanhMuc}>{(t) => <NoiDung thuTuc={t} />}</TaiThuTuc>;
}

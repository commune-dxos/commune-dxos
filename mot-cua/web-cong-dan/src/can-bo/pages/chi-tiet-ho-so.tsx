// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Chi tiết hồ sơ cho cán bộ: người nộp, thành phần hồ sơ và tệp (link ký sẵn ngắn hạn qua /files),
// lịch sử các bước (/workflow/ho-so/{id}/tien-do), và form xử lý bước hiện tại nếu task thuộc mình
// hoặc nhóm của mình. Hồ sơ RLS không cho xem (cán bộ lĩnh vực khác) → "Không thấy hồ sơ". Giấy tờ có
// ký số (#77): biên nhận, và thông báo kết quả khi hồ sơ hoàn tất. Thông tin đọc từ giấy tờ chờ cán bộ xác nhận
// (#93, components/xac-nhan-giay-to.tsx).
import { ArrowLeft, CircleCheck, Download, FileText, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { NutGiayTo } from "@/components/nut-giay-to";
import { ThongBao } from "@/components/thong-bao";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GOC_CAN_BO } from "@/auth/oidc";
import { ngay } from "@/lib/dinh-dang";
import { tenTrangThai } from "@/lib/trang-thai";
import { cn } from "@/lib/utils";
import { ApiDocGiayTo, type DocGiayTo, type LoaiGiayTo } from "@/lib/doc-giay-to";
import { FormXuLy } from "../components/form-xu-ly";
import { XacNhanGiayTo } from "../components/xac-nhan-giay-to";
import { TheHan } from "@/components/the-han";
import { useDuLieuCanBo } from "../du-lieu";
import type { HoSoCanBo, KetQuaHoanThanh, LinkTep, TepHoSo, ThanhPhanYeuCau, TienDo } from "../lib/api";
import { truongCuaBuoc } from "../lib/form-buoc";
import { danhGiaHan, hanLuc, ngayGio } from "@/lib/han";

interface DuLieuHoSo {
  hoSo: HoSoCanBo | null;
  tienDo: TienDo | null;
  tep: TepHoSo[];
  yeuCau: ThanhPhanYeuCau[];
  docGiayTo: DocGiayTo[];
}

const KET_THUC: Record<string, string> = {
  hoan_tat: "Hoàn tất, đã trả kết quả",
  tu_choi: "Từ chối",
};

function kichThuoc(byte: number) {
  return byte < 1024 * 1024 ? `${Math.max(1, Math.round(byte / 1024))} KB` : `${(byte / 1024 / 1024).toFixed(1)} MB`;
}

function DongTep({ tep }: { tep: TepHoSo }) {
  const { api } = useDuLieuCanBo();
  const [link, datLink] = useState<LinkTep | null>(null);
  const [loi, datLoi] = useState<string | null>(null);
  const [dangLay, datDangLay] = useState(false);
  const layLink = async () => {
    datDangLay(true);
    datLoi(null);
    try {
      datLink(await api.layLinkTep(tep.id));
    } catch (e) {
      datLoi(e instanceof Error ? e.message : "Không lấy được tệp.");
    } finally {
      datDangLay(false);
    }
  };
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex min-w-0 items-start gap-2">
        <FileText aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block font-medium break-all">{tep.ten_tep}</span>
          <span className="text-muted-foreground">
            {kichThuoc(tep.kich_thuoc)}
            {tep.ket_qua_quet === "sach" && (
              <>
                {" · "}
                <ShieldCheck aria-hidden="true" className="inline size-4 align-[-2px] text-primary" /> Đã quét mã độc
              </>
            )}
          </span>
        </span>
      </span>
      {link ? (
        <a href={link.link} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "default", size: "sm" })} autoFocus>
          <Download aria-hidden="true" />
          Mở tệp
          <span className="sr-only"> {tep.ten_tep} (thẻ mới, link hết hạn lúc {ngayGio(new Date(link.hetHanLuc))})</span>
        </a>
      ) : (
        <Button variant="outline" size="sm" onClick={() => void layLink()} disabled={dangLay}>
          {dangLay ? "Đang lấy link…" : "Xem tệp"}
          <span className="sr-only"> {tep.ten_tep}</span>
        </Button>
      )}
      {loi && (
        <p role="alert" className="text-destructive sm:basis-full">
          {loi}
        </p>
      )}
    </li>
  );
}

function ThanhPhan({ yeuCau, tep }: { yeuCau: ThanhPhanYeuCau[]; tep: TepHoSo[] }) {
  const khac = tep.filter((t) => !yeuCau.some((y) => y.id === t.thanh_phan_yeu_cau_id));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          <h2>Thành phần hồ sơ</h2>
        </CardTitle>
        <CardDescription>Tệp công dân đã nộp, đã quét mã độc trước khi lưu. Link xem hết hạn sau ít phút.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {yeuCau.map((y) => {
          const cua = tep.filter((t) => t.thanh_phan_yeu_cau_id === y.id);
          const thieu = y.bat_buoc && cua.length < Math.max(1, y.so_luong);
          return (
            <section key={y.id} aria-label={y.ten} className="flex flex-col gap-2">
              <h3 className="flex flex-wrap items-center gap-2 font-semibold">
                {y.ten}
                <Badge variant={y.bat_buoc ? "secondary" : "outline"}>{y.bat_buoc ? "Bắt buộc" : "Nếu có"}</Badge>
                {thieu && <Badge variant="destructive">Thiếu</Badge>}
              </h3>
              {cua.length === 0 ? (
                <p className="text-muted-foreground">Chưa có tệp.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {cua.map((t) => (
                    <DongTep key={t.id} tep={t} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {khac.length > 0 && (
          <section aria-label="Tệp khác" className="flex flex-col gap-2">
            <h3 className="font-semibold">Tệp khác</h3>
            <ul className="flex flex-col gap-2">
              {khac.map((t) => (
                <DongTep key={t.id} tep={t} />
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function GiayToKySo({ hoSo }: { hoSo: HoSoCanBo }) {
  const { api } = useDuLieuCanBo();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          <h2>Giấy tờ có ký số</h2>
        </CardTitle>
        <CardDescription>PDF ký số bằng chứng thư của xã, tải để in hoặc gửi công dân.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <NutGiayTo key={`bn-${hoSo.id}`} loai="bien_nhan" layGiayTo={() => api.phatHanhGiayTo(hoSo.id, "bien_nhan")} />
        {hoSo.trang_thai === "hoan_tat" && (
          <NutGiayTo key={`kq-${hoSo.id}`} loai="ket_qua" layGiayTo={() => api.phatHanhGiayTo(hoSo.id, "ket_qua")} />
        )}
      </CardContent>
    </Card>
  );
}

function LichSu({ tienDo }: { tienDo: TienDo | null }) {
  const qt = tienDo?.quyTrinh ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          <h2>Lịch sử xử lý</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {qt.length === 0 ? (
          <p className="text-muted-foreground">Hồ sơ chưa khởi tạo quy trình.</p>
        ) : (
          qt.map((p) => (
            <ol key={p.processInstanceId} className="relative flex flex-col gap-4 border-l-2 border-border pl-6">
              {p.lichSu.map((b, i) => (
                <li key={`${b.buoc}-${i}`} className="relative">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-1.5 -left-[calc(1.5rem+7px)] size-3 rounded-full border-2 border-background",
                      b.ketThuc ? "bg-primary" : "bg-link ring-4 ring-secondary",
                    )}
                  />
                  <p className="font-semibold">{b.ten}</p>
                  <p className="text-muted-foreground">
                    {ngayGio(new Date(b.batDau))}
                    {b.ketThuc ? ` → ${ngayGio(new Date(b.ketThuc))}` : " · đang xử lý"}
                  </p>
                </li>
              ))}
              {p.ketThuc && (
                <li className="relative">
                  <span aria-hidden="true" className="absolute top-1.5 -left-[calc(1.5rem+7px)] size-3 rounded-full border-2 border-background bg-foreground" />
                  <p className="font-semibold">{KET_THUC[p.diemKetThuc?.replace("ket_thuc_", "") ?? ""] ?? "Kết thúc"}</p>
                  <p className="text-muted-foreground">{ngayGio(new Date(p.ketThuc))}</p>
                </li>
              )}
            </ol>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function ChiTietHoSo() {
  const { id = "" } = useParams();
  const { api, viec, taiLai: taiLaiHop, bayGio, nguoiDung, datHoSoDangXem } = useDuLieuCanBo();
  const [duLieu, datDuLieu] = useState<DuLieuHoSo | null>(null);
  const [loi, datLoi] = useState<string | null>(null);
  const [daXong, datDaXong] = useState<{ taskId: string; ten: string; tomTat: string; tiepTheo: string[] } | null>(null);
  // Cùng token, cấu hình và hàm gọi với api của cổng cán bộ (test thay được cả hai bằng một hàm fetch giả).
  const apiDoc = useMemo(() => new ApiDocGiayTo(api.token, api.cauHinh, api.goi), [api]);
  const [loaiDoc, datLoaiDoc] = useState<Record<string, LoaiGiayTo>>({});
  useEffect(() => {
    apiDoc.layLoai().then(datLoaiDoc, () => undefined);
  }, [apiDoc]);

  const tai = useCallback(async () => {
    try {
      const hoSo = await api.layMotHoSo(id);
      if (!hoSo) {
        datDuLieu({ hoSo: null, tienDo: null, tep: [], yeuCau: [], docGiayTo: [] });
        return;
      }
      const [tienDo, tep, yeuCau, docGiayTo] = await Promise.all([
        api.layTienDo(id),
        api.layTep(id),
        hoSo.thu_tuc ? api.layThanhPhanYeuCau(hoSo.thu_tuc.id) : Promise.resolve([]),
        // Bảng chưa có (lõi cũ) hay lỗi đọc thì bỏ qua thẻ này, không làm hỏng trang.
        apiDoc.layKetQua(id).catch(() => [] as DocGiayTo[]),
      ]);
      datDuLieu({ hoSo, tienDo, tep, yeuCau, docGiayTo });
      datLoi(null);
    } catch (e) {
      datLoi(e instanceof Error ? e.message : "Không tải được hồ sơ.");
    }
  }, [api, apiDoc, id]);

  useEffect(() => {
    datDuLieu(null);
    datDaXong(null);
    void tai();
  }, [tai]);

  const hoSo = duLieu?.hoSo;
  useEffect(() => {
    document.title = `${hoSo ? `Hồ sơ ${hoSo.ma_ho_so}` : "Chi tiết hồ sơ"} – Cổng cán bộ – Commune DX-OS`;
    datHoSoDangXem(hoSo ? { id: hoSo.id, ma: hoSo.ma_ho_so } : null);
  }, [hoSo, datHoSoDangXem]);

  if (loi) {
    return (
      <ThongBao role="alert" loai="loi" capTieuDe="h1" tieuDe="Không tải được hồ sơ" hanhDong={<Button onClick={() => void tai()}>Thử lại</Button>}>
        {loi}
      </ThongBao>
    );
  }
  if (!duLieu) {
    return (
      <div role="status" aria-label="Đang tải hồ sơ" className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (!hoSo) {
    return (
      <ThongBao
        loai="trong"
        capTieuDe="h1"
        tieuDe="Không thấy hồ sơ"
        hanhDong={
          <Link to={GOC_CAN_BO} className={buttonVariants({ variant: "outline" })}>
            Về hộp việc
          </Link>
        }
      >
        Hồ sơ không tồn tại hoặc không thuộc lĩnh vực bạn phụ trách.
      </ThongBao>
    );
  }

  // Task vừa hoàn thành còn trong hộp việc tới khi tải lại xong: không cho gửi lần nữa.
  const v = viec.find((x) => x.task.hoSoId === id && x.task.id !== daXong?.taskId);
  const qt = duLieu.tienDo?.quyTrinh.at(-1);
  const buocMo = qt?.buocDangMo ?? [];
  const han = v?.han ?? danhGiaHan(hanLuc(null, hoSo.han_xu_ly), bayGio);
  const truong = v ? truongCuaBuoc(hoSo.thu_tuc?.bien_theo_buoc, v.task.buoc) : null;
  const nguoiKhacNhan = !!v?.task.nguoiNhan && v.task.nguoiNhan !== nguoiDung.profile.sub;

  const khiXong = (kq: KetQuaHoanThanh, tomTat: string) => {
    datDaXong({ taskId: kq.id, ten: v?.task.ten ?? kq.buoc, tomTat, tiepTheo: kq.buocDangMo.map((b) => b.ten) });
    void taiLaiHop();
    void tai();
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link to={GOC_CAN_BO} className="inline-flex w-fit items-center gap-1 text-link">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Hộp việc
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Hồ sơ {hoSo.ma_ho_so}</h1>
            <p className="text-muted-foreground">
              {hoSo.thu_tuc ? `${hoSo.thu_tuc.ma} · ${hoSo.thu_tuc.ten}` : ""}
              {hoSo.thu_tuc?.linh_vuc ? ` · Lĩnh vực ${hoSo.thu_tuc.linh_vuc.ten}` : ""}
            </p>
          </div>
          {!qt?.ketThuc && <TheHan han={han} />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Trạng thái hồ sơ: {tenTrangThai(hoSo.trang_thai)}</Badge>
          {qt?.ketThuc ? (
            <Badge variant="default">{KET_THUC[qt.diemKetThuc?.replace("ket_thuc_", "") ?? ""] ?? "Đã kết thúc"}</Badge>
          ) : (
            buocMo.map((b) => (
              <Badge key={b.id} variant="secondary">
                Bước hiện tại: {b.ten}
              </Badge>
            ))
          )}
        </div>
      </div>

      {daXong && (
        <Alert role="status" className="border-primary bg-primary-soft">
          <CircleCheck aria-hidden="true" className="text-primary" />
          <AlertTitle className="font-semibold">Đã hoàn thành “{daXong.ten}”</AlertTitle>
          <AlertDescription className="text-foreground">
            {daXong.tomTat && <p>{daXong.tomTat}</p>}
            <p>{daXong.tiepTheo.length ? `Bước tiếp theo: ${daXong.tiepTheo.join(", ")}.` : "Quy trình đã kết thúc."}</p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                <h2>Người nộp</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Họ và tên</dt>
                  <dd className="font-semibold">{hoSo.ho_ten_nguoi_nop}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Số điện thoại</dt>
                  <dd className="font-semibold">{hoSo.so_dien_thoai ?? "Không có"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Ngày nộp</dt>
                  <dd className="font-semibold">{ngayGio(new Date(hoSo.ngay_nhan))}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Hạn giải quyết</dt>
                  <dd className="font-semibold">{hoSo.han_xu_ly ? ngay(hoSo.han_xu_ly) : "—"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <ThanhPhan yeuCau={duLieu.yeuCau} tep={duLieu.tep} />
          <XacNhanGiayTo
            ds={duLieu.docGiayTo}
            loai={loaiDoc}
            tenTep={Object.fromEntries(duLieu.tep.map((t) => [t.id, t.ten_tep]))}
            xemAnh={async (tepId) => (await api.layLinkTep(tepId)).link}
            api={apiDoc}
            doi={(moi) =>
              datDuLieu((d) => d && { ...d, docGiayTo: d.docGiayTo.map((x) => (x.tep_id === moi.tep_id ? moi : x)) })
            }
          />
          <GiayToKySo hoSo={hoSo} />
          <LichSu tienDo={duLieu.tienDo} />
        </div>

        <aside aria-labelledby="xu-ly-tieu-de" className="lg:sticky lg:top-20 lg:self-start">
          <Card className="border-2 border-primary">
            <CardHeader>
              <CardTitle className="text-lg">
                <h2 id="xu-ly-tieu-de">Xử lý bước</h2>
              </CardTitle>
              {v && <CardDescription className="text-base text-foreground">{v.task.ten}</CardDescription>}
            </CardHeader>
            <CardContent>
              {!v ? (
                <p className="text-muted-foreground">
                  {qt?.ketThuc
                    ? "Hồ sơ đã kết thúc quy trình."
                    : buocMo.length
                      ? `Bước “${buocMo.map((b) => b.ten).join(", ")}” không thuộc nhóm của bạn.`
                      : "Không có bước nào đang chờ bạn."}
                </p>
              ) : nguoiKhacNhan ? (
                <p className="text-muted-foreground">Bước này đã có cán bộ khác nhận xử lý.</p>
              ) : truong === null ? (
                <p className="text-muted-foreground">Bước này không xử lý qua cổng (gói thủ tục không khai báo biến cho bước).</p>
              ) : (
                <FormXuLy key={v.task.id} task={v.task} truong={truong} api={api} khiXong={khiXong} />
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

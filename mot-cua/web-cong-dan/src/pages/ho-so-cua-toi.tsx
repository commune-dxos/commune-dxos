// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Hồ sơ của tôi (#54), cần đăng nhập: danh sách hồ sơ đã nộp (RLS chỉ trả hồ sơ của người gọi) và chi
// tiết một hồ sơ: các bước, bước quy trình đang mở, mốc trạng thái kèm lý do, giấy tờ đã nộp, biên nhận
// và thông báo kết quả có ký số (#77). Hồ sơ chờ bổ sung (KS01): xem yêu cầu, tải thêm giấy tờ rồi nộp
// lại; mot-cua-api kiểm lại đủ thành phần trước khi trả hồ sơ về bước tiếp nhận.
import { ArrowLeft, ChevronRight, FileText, LogIn, RotateCw, Send, Upload } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { useXacThuc } from "@/auth/xac-thuc";
import { NhanTrangThai } from "@/components/cac-buoc-ho-so";
import { Khung } from "@/components/khung";
import { NutGiayTo } from "@/components/nut-giay-to";
import { TheHan } from "@/components/the-han";
import { ThongBao } from "@/components/thong-bao";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { LoiApi } from "@/lib/api";
import { phatHanhGiayTo } from "@/lib/giay-to";
import { danhGiaHan, hanLuc, ngayGio } from "@/lib/han";
import { layIdThanhPhan, taiTep } from "@/lib/ho-so";
import { docThanhPhan } from "@/lib/thanh-phan";
import { ApiHoSoCongDan, type HoSoCuaToi, type MocTrangThai, type TepDaNop, type TienDoQuyTrinh } from "@/lib/tra-cuu";
import { dungLuong, kiemMotTep, NHAN_TEP } from "./nop-ho-so/kieu";
import { KetQuaHoSo } from "./tra-cuu";

export type TaoApi = (token: string) => ApiHoSoCongDan;
const taoApiMacDinh: TaoApi = (token) => new ApiHoSoCongDan(token);

const thongDiep = (e: unknown, macDinh: string) => (e instanceof LoiApi ? e.message : macDinh);

function CanDangNhap({ quayVe, children }: { quayVe: string; children: (token: string) => ReactNode }) {
  const { nguoiDung, dangTai, dangNhap } = useXacThuc();
  if (dangTai) {
    return (
      <Khung>
        <div role="status">
          <span className="sr-only">Đang kiểm tra đăng nhập…</span>
          <Skeleton aria-hidden="true" className="h-11 w-2/3" />
        </div>
      </Khung>
    );
  }
  if (!nguoiDung) {
    return (
      <div className="flex-1 bg-surface">
        <Khung className="flex justify-center md:py-16">
          <ThongBao
            capTieuDe="h1"
            bieuTuong={LogIn}
            tieuDe="Đăng nhập để xem hồ sơ của bạn"
            className="max-w-xl"
            hanhDong={
              <>
                <Button size="lg" onClick={() => void dangNhap(quayVe)}>
                  <LogIn aria-hidden="true" />
                  Đăng nhập
                </Button>
                <Link to="/tra-cuu" className="rounded-sm text-link underline underline-offset-4">
                  Tra cứu bằng mã hồ sơ, không cần đăng nhập
                </Link>
              </>
            }
          >
            Đăng nhập bằng tài khoản đã dùng để nộp hồ sơ để xem giấy tờ, tải biên nhận và nộp bổ sung.
          </ThongBao>
        </Khung>
      </div>
    );
  }
  return <>{children(nguoiDung.access_token)}</>;
}

// --- Danh sách ---------------------------------------------------------------------------------
function DanhSach({ token, taoApi }: { token: string; taoApi: TaoApi }) {
  const [ds, datDs] = useState<HoSoCuaToi[] | null>(null);
  const [loi, datLoi] = useState<string | null>(null);
  const tai = useCallback(() => {
    datLoi(null);
    datDs(null);
    taoApi(token)
      .danhSach()
      .then(datDs)
      .catch((e: unknown) => datLoi(thongDiep(e, "Không tải được danh sách hồ sơ.")));
  }, [token, taoApi]);
  useEffect(tai, [tai]);

  if (loi) {
    return (
      <ThongBao
        loai="loi"
        role="alert"
        tieuDe="Chưa tải được hồ sơ"
        hanhDong={
          <Button onClick={tai}>
            <RotateCw aria-hidden="true" />
            Thử lại
          </Button>
        }
      >
        {loi}
      </ThongBao>
    );
  }
  if (!ds) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Đang tải hồ sơ…</span>
        {[0, 1].map((i) => (
          <Skeleton key={i} aria-hidden="true" className="h-24 w-full" />
        ))}
      </div>
    );
  }
  if (ds.length === 0) {
    return (
      <ThongBao
        loai="trong"
        tieuDe="Bạn chưa nộp hồ sơ nào"
        hanhDong={
          <Link to="/#danh-muc" className="rounded-sm text-link underline underline-offset-4">
            Xem danh mục thủ tục
          </Link>
        }
      >
        Hồ sơ nộp trực tuyến bằng tài khoản này sẽ hiện ở đây.
      </ThongBao>
    );
  }
  const bayGio = new Date();
  return (
    <ul className="flex flex-col gap-4" aria-label="Hồ sơ đã nộp">
      {ds.map((h) => {
        const dong = h.trang_thai === "hoan_tat" || h.trang_thai === "tu_choi";
        return (
          <li key={h.id}>
            <Link
              to={`/ho-so/${h.id}`}
              className="group flex items-center gap-4 rounded-md border bg-card p-5 text-foreground no-underline shadow-the hover:border-primary"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-muted-foreground">{h.thu_tuc?.ten ?? "Thủ tục"}</span>
                <span className="flex flex-wrap items-center gap-3">
                  <strong className="text-lg tabular-nums">{h.ma_ho_so}</strong>
                  <NhanTrangThai trangThai={h.trang_thai} />
                </span>
                <span className="flex flex-wrap items-center gap-x-6 gap-y-1 text-muted-foreground">
                  <span>Nộp {ngayGio(new Date(h.ngay_nhan))}</span>
                  {!dong && h.han_xu_ly && <TheHan han={danhGiaHan(hanLuc(null, h.han_xu_ly), bayGio)} chiTiet={false} />}
                  {h.ngay_hoan_tat && <span>Có kết quả {ngayGio(new Date(h.ngay_hoan_tat))}</span>}
                </span>
                {h.trang_thai === "cho_bo_sung" && h.ly_do && (
                  <span className="font-semibold text-destructive">Cần bổ sung: {h.ly_do}</span>
                )}
              </span>
              <ChevronRight aria-hidden="true" className="size-6 shrink-0 text-muted-foreground group-hover:text-primary" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function HoSoCuaToiTrang({ taoApi = taoApiMacDinh }: { taoApi?: TaoApi }) {
  return (
    <CanDangNhap quayVe="/ho-so">
      {(token) => (
        <Khung className="flex max-w-4xl flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-bold">Hồ sơ của tôi</h1>
            <p className="text-lg text-muted-foreground">Hồ sơ mới nộp ở trên cùng. Bấm vào một hồ sơ để xem từng bước.</p>
          </div>
          <DanhSach token={token} taoApi={taoApi} />
        </Khung>
      )}
    </CanDangNhap>
  );
}

// --- Chi tiết ----------------------------------------------------------------------------------
interface DuLieu {
  hoSo: HoSoCuaToi;
  lichSu: MocTrangThai[];
  tep: TepDaNop[];
  tienDo: TienDoQuyTrinh | null;
}

function GiayToDaNop({ tep }: { tep: TepDaNop[] }) {
  return tep.length === 0 ? (
    <p className="text-muted-foreground">Chưa có giấy tờ nào.</p>
  ) : (
    <ul className="flex flex-col divide-y rounded-md border">
      {tep.map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-4 py-3">
          <FileText aria-hidden="true" className="size-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate font-semibold">{t.ten_tep}</span>
          <span className="shrink-0 text-muted-foreground">{dungLuong(t.kich_thuoc)}</span>
        </li>
      ))}
    </ul>
  );
}

function BoSung({
  token,
  hoSo,
  tep,
  api,
  xong,
  daNopLai,
}: {
  token: string;
  hoSo: HoSoCuaToi;
  tep: TepDaNop[];
  api: ApiHoSoCongDan;
  /** Tải lại hồ sơ (tệp mới, trạng thái mới). */
  xong: () => void;
  /** Nộp lại xong: khối bổ sung biến mất khi trạng thái đổi, nên trang giữ câu xác nhận. */
  daNopLai: () => void;
}) {
  const thanhPhan = docThanhPhan(hoSo.thu_tuc?.json_schema);
  const [idThanhPhan, datIdThanhPhan] = useState<Record<string, string>>({});
  const [dangTai, datDangTai] = useState<string | null>(null);
  const [ghiChu, datGhiChu] = useState("");
  const [dangGui, datDangGui] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);
  const [thongBao, datThongBao] = useState<string | null>(null);

  useEffect(() => {
    if (!hoSo.thu_tuc) return;
    layIdThanhPhan(hoSo.thu_tuc.id)
      .then(datIdThanhPhan)
      .catch(() => datIdThanhPhan({}));
  }, [hoSo.thu_tuc]);

  const taiLen = async (ma: string, ds: FileList | null) => {
    const files = [...(ds ?? [])];
    const sai = files.map(kiemMotTep).find(Boolean);
    if (sai) {
      datLoi(sai);
      return;
    }
    datLoi(null);
    datThongBao(null);
    datDangTai(ma);
    try {
      for (const f of files) await taiTep(token, hoSo.id, f, idThanhPhan[ma]);
      datThongBao(`Đã tải ${files.length} tệp. Kiểm tra lại rồi bấm "Nộp lại hồ sơ".`);
      xong();
    } catch (e) {
      datLoi(thongDiep(e, "Chưa tải được tệp. Vui lòng thử lại."));
    } finally {
      datDangTai(null);
    }
  };

  const nopLai = async () => {
    datDangGui(true);
    datLoi(null);
    try {
      const task = await api.taskBoSung(hoSo.id);
      if (!task) {
        datLoi("Hồ sơ không còn ở bước chờ bổ sung. Tải lại trang để xem trạng thái mới.");
        return;
      }
      await api.nopLai(task.id, ghiChu);
      daNopLai();
      xong();
    } catch (e) {
      datLoi(thongDiep(e, "Chưa nộp lại được. Vui lòng thử lại."));
    } finally {
      datDangGui(false);
    }
  };

  const tepCua = (ma: string) => tep.filter((t) => idThanhPhan[ma] && t.thanh_phan_yeu_cau_id === idThanhPhan[ma]);

  return (
    <section aria-labelledby="bo-sung" className="flex flex-col gap-5 rounded-md border-2 border-warning bg-card p-5 shadow-the">
      <h2 id="bo-sung" className="text-2xl font-bold">
        Bổ sung hồ sơ
      </h2>
      <Alert variant="destructive">
        <AlertTitle>Yêu cầu của bộ phận một cửa</AlertTitle>
        <AlertDescription className="text-base">{hoSo.ly_do ?? "Cần bổ sung giấy tờ."}</AlertDescription>
      </Alert>
      <ol className="flex flex-col gap-4">
        {thanhPhan.map((tp) => (
          <li key={tp.ma} className="flex flex-col gap-2 rounded-md border p-4">
            <strong className="text-lg">{tp.ten}</strong>
            {tepCua(tp.ma).length > 0 && (
              <ul className="flex flex-col gap-1 text-muted-foreground" aria-label={`Tệp đã nộp cho ${tp.ten}`}>
                {tepCua(tp.ma).map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <FileText aria-hidden="true" className="size-4 shrink-0" />
                    {t.ten_tep}
                  </li>
                ))}
              </ul>
            )}
            <label className="flex min-h-12 w-fit cursor-pointer items-center gap-2 rounded-md border-2 border-primary px-4 font-semibold text-primary hover:bg-primary-soft has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring">
              <Upload aria-hidden="true" className="size-5" />
              {dangTai === tp.ma ? "Đang tải…" : "Tải thêm tệp"}
              <span className="sr-only">{` cho ${tp.ten}`}</span>
              <input
                type="file"
                multiple
                accept={NHAN_TEP}
                className="sr-only"
                disabled={dangTai !== null}
                onChange={(e) => {
                  void taiLen(tp.ma, e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </li>
        ))}
      </ol>
      <Field>
        <FieldLabel htmlFor="ghi-chu-bo-sung">Ghi chú cho cán bộ (không bắt buộc)</FieldLabel>
        <Textarea id="ghi-chu-bo-sung" value={ghiChu} maxLength={500} onChange={(e) => datGhiChu(e.target.value)} />
      </Field>
      {loi && (
        <p role="alert" className="font-semibold text-destructive">
          {loi}
        </p>
      )}
      {thongBao && (
        <p role="status" className="font-semibold text-primary">
          {thongBao}
        </p>
      )}
      <Button className="self-start" onClick={() => void nopLai()} disabled={dangGui || dangTai !== null}>
        <Send aria-hidden="true" />
        {dangGui ? "Đang nộp lại…" : "Nộp lại hồ sơ"}
      </Button>
    </section>
  );
}

function ChiTiet({ token, id, taoApi }: { token: string; id: string; taoApi: TaoApi }) {
  const [api] = useState(() => taoApi(token));
  const [duLieu, datDuLieu] = useState<DuLieu | null | "khong-thay">(null);
  const [loi, datLoi] = useState<string | null>(null);
  const [daNopLai, datDaNopLai] = useState(false);

  const tai = useCallback(() => {
    datLoi(null);
    void (async () => {
      try {
        const hoSo = await api.hoSo(id);
        if (!hoSo) {
          datDuLieu("khong-thay");
          return;
        }
        const [lichSu, tep, tienDo] = await Promise.all([
          api.lichSu(id),
          api.tep(id),
          api.tienDo(id).catch(() => null), // Flowable tạm dừng: vẫn hiện trạng thái từ CSDL
        ]);
        datDuLieu({ hoSo, lichSu, tep, tienDo });
      } catch (e) {
        datLoi(thongDiep(e, "Không tải được hồ sơ."));
      }
    })();
  }, [api, id]);
  useEffect(tai, [tai]);

  const quayLai = (
    <Link to="/ho-so" className="flex w-fit items-center gap-2 rounded-sm text-link underline underline-offset-4">
      <ArrowLeft aria-hidden="true" className="size-5" />
      Hồ sơ của tôi
    </Link>
  );

  if (loi) {
    return (
      <Khung className="flex max-w-4xl flex-col gap-6">
        {quayLai}
        <ThongBao loai="loi" role="alert" tieuDe="Chưa tải được hồ sơ" hanhDong={<Button onClick={tai}>Thử lại</Button>}>
          {loi}
        </ThongBao>
      </Khung>
    );
  }
  if (duLieu === "khong-thay") {
    return (
      <Khung className="flex max-w-4xl flex-col gap-6">
        {quayLai}
        <ThongBao capTieuDe="h1" loai="trong" tieuDe="Không thấy hồ sơ">
          Hồ sơ không tồn tại hoặc không phải do tài khoản này nộp.
        </ThongBao>
      </Khung>
    );
  }
  if (!duLieu) {
    return (
      <Khung className="flex max-w-4xl flex-col gap-6">
        <div role="status">
          <span className="sr-only">Đang tải hồ sơ…</span>
          <Skeleton aria-hidden="true" className="h-64 w-full" />
        </div>
      </Khung>
    );
  }

  const { hoSo, lichSu, tep, tienDo } = duLieu;
  const buocMo = tienDo?.quyTrinh.flatMap((p) => p.buocDangMo) ?? [];
  const daXong = tienDo?.quyTrinh.flatMap((p) => p.lichSu.filter((b) => b.ketThuc)) ?? [];
  return (
    <Khung className="flex max-w-4xl flex-col gap-8">
      {quayLai}
      <h1 className="sr-only">Hồ sơ {hoSo.ma_ho_so}</h1>
      <KetQuaHoSo
        hoSo={{
          ma_ho_so: hoSo.ma_ho_so,
          thu_tuc: { ma: hoSo.thu_tuc?.ma ?? "", ten: hoSo.thu_tuc?.ten ?? "Thủ tục" },
          trang_thai: hoSo.trang_thai,
          ngay_nhan: hoSo.ngay_nhan,
          han_xu_ly: hoSo.han_xu_ly,
          ngay_hoan_tat: hoSo.ngay_hoan_tat,
          lich_su: lichSu.map((m) => ({ trang_thai: m.den_trang_thai, luc: m.luc, ly_do: m.ly_do })),
        }}
        loiNhan={
          hoSo.trang_thai === "cho_bo_sung"
            ? "Hồ sơ cần bổ sung giấy tờ: xem yêu cầu và nộp bổ sung ngay bên dưới."
            : hoSo.trang_thai === "hoan_tat"
              ? "Hồ sơ đã có kết quả. Tải thông báo kết quả có ký số bên dưới, hoặc nhận tại bộ phận một cửa."
              : hoSo.trang_thai === "tu_choi"
                ? "Hồ sơ không được giải quyết, lý do ghi ở các mốc thời gian bên dưới."
                : undefined
        }
      />

      {tienDo && (buocMo.length > 0 || daXong.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              <h2>Trong quy trình xử lý</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {buocMo.length > 0 && (
              <p className="text-lg">
                Bước đang mở: <strong>{buocMo.map((b) => b.ten).join(", ")}</strong>
              </p>
            )}
            {daXong.length > 0 && (
              <ul className="flex flex-col gap-1 text-muted-foreground" aria-label="Các bước đã xong">
                {daXong.map((b, i) => (
                  <li key={`${b.buoc}-${i}`}>
                    {b.ten} · xong {ngayGio(new Date(b.ketThuc as string))}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {daNopLai && (
        <p role="status" className="rounded-md border-2 border-primary bg-primary-soft p-4 text-lg font-semibold text-primary">
          Đã nộp lại hồ sơ. Bộ phận một cửa sẽ kiểm tra lại giấy tờ.
        </p>
      )}
      {hoSo.trang_thai === "cho_bo_sung" && (
        <BoSung token={token} hoSo={hoSo} tep={tep} api={api} xong={tai} daNopLai={() => datDaNopLai(true)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            <h2>Giấy tờ đã nộp</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GiayToDaNop tep={tep} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            <h2>Giấy tờ có ký số của xã</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <NutGiayTo key={`bn-${hoSo.id}`} loai="bien_nhan" layGiayTo={() => phatHanhGiayTo(token, hoSo.id, "bien_nhan")} />
          {hoSo.trang_thai === "hoan_tat" && (
            <NutGiayTo key={`kq-${hoSo.id}`} loai="ket_qua" layGiayTo={() => phatHanhGiayTo(token, hoSo.id, "ket_qua")} />
          )}
        </CardContent>
      </Card>
    </Khung>
  );
}

export function ChiTietHoSoCongDan({ taoApi = taoApiMacDinh }: { taoApi?: TaoApi }) {
  const { id = "" } = useParams();
  return (
    <CanDangNhap quayVe={`/ho-so/${encodeURIComponent(id)}`}>
      {(token) => <ChiTiet key={id} token={token} id={id} taoApi={taoApi} />}
    </CanDangNhap>
  );
}

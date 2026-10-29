// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Lịch công tác của xã (#117): xem theo tuần (thứ Hai → Chủ nhật, giờ Việt Nam; tuần đang xem nằm trên URL ?tuan=
// để gửi link được). Văn thư soạn lịch dự kiến, sửa, hủy lịch dự kiến; lãnh đạo thêm, sửa, duyệt, hủy mọi lịch chưa
// hủy. Cán bộ chỉ thấy lịch đã duyệt. Mọi quyền và Poka-yoke (trùng địa điểm + chồng giờ, hủy phải có lý do, lịch
// đã hủy không sửa) do RLS và trigger của CSDL kiểm (migration 017); web chỉ ẩn nút người dùng không được bấm.
import { CalendarPlus, Check, ChevronLeft, ChevronRight, MapPin, Pencil, UserRound, Users, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { ThongBao } from "@/components/thong-bao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useDuLieuCanBo } from "../du-lieu";
import type { GhiLich, LichCongTac, LoaiLich, TrangThaiLich } from "../lib/api";
import type { VaiTroCanBo } from "../lib/quyen";

export const TEN_LOAI_LICH: Record<LoaiLich, string> = {
  hop: "Họp",
  tiep_dan: "Tiếp công dân",
  truc: "Trực",
  cong_tac: "Đi công tác",
  khac: "Khác",
};
const TEN_TRANG_THAI: Record<TrangThaiLich, string> = {
  du_kien: "Dự kiến, chờ duyệt",
  da_duyet: "Đã duyệt",
  da_huy: "Đã hủy",
};
const TEN_THU = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"];
const MUI_GIO = "Asia/Ho_Chi_Minh";
const LOP_CHON =
  "h-12 w-full rounded-md border-2 border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring";

// --- Ngày giờ theo giờ Việt Nam (UTC+7, không có giờ mùa hè) -----------------------------------------------
const dinhDangVN = new Intl.DateTimeFormat("en-CA", {
  timeZone: MUI_GIO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Thời điểm → {ngay: "YYYY-MM-DD", gio: "HH:MM"} theo giờ Việt Nam. */
export function phanVN(luc: Date | string) {
  const p = Object.fromEntries(dinhDangVN.formatToParts(new Date(luc)).map((x) => [x.type, x.value]));
  return { ngay: `${p.year}-${p.month}-${p.day}`, gio: `${p.hour}:${p.minute}` };
}

/** "YYYY-MM-DD" cộng n ngày. */
export function congNgay(ngay: string, n: number) {
  const [y, m, d] = ngay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Thứ Hai của tuần chứa ngày "YYYY-MM-DD". */
export function thuHai(ngay: string) {
  const [y, m, d] = ngay.split("-").map(Number);
  const thu = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = thứ Hai
  return congNgay(ngay, -thu);
}

/** Ngày + giờ Việt Nam → ISO có múi giờ, gửi thẳng cho PostgREST. */
export function isoVN(ngay: string, gio: string) {
  return `${ngay}T${gio}:00+07:00`;
}

const ngayNgan = (ngay: string) => `${ngay.slice(8, 10)}/${ngay.slice(5, 7)}`;
const ngayDu = (ngay: string) => `${ngayNgan(ngay)}/${ngay.slice(0, 4)}`;

/** Khoảng giờ để hiện: "08:00 – 10:00", hoặc kèm ngày khi lịch kéo qua ngày khác. */
function khoangGio(l: LichCongTac) {
  const a = phanVN(l.bat_dau);
  const b = phanVN(l.ket_thuc);
  return a.ngay === b.ngay ? `${a.gio} – ${b.gio}` : `${a.gio} ${ngayNgan(a.ngay)} – ${b.gio} ${ngayNgan(b.ngay)}`;
}

// --- Quyền (RLS kiểm lại) -----------------------------------------------------------------------------
/** Được sửa hoặc hủy lịch này không: lãnh đạo mọi lịch chưa hủy, văn thư lịch dự kiến. */
export function duocSuaLich(vaiTro: VaiTroCanBo, l: Pick<LichCongTac, "trang_thai">) {
  if (l.trang_thai === "da_huy") return false;
  if (vaiTro === "lanh_dao") return true;
  return vaiTro === "van_thu" && l.trang_thai === "du_kien";
}
export const duocThemLich = (vaiTro: VaiTroCanBo) => vaiTro === "lanh_dao" || vaiTro === "van_thu";

function thongDiep(e: unknown, macDinh: string) {
  return e instanceof Error ? e.message : macDinh;
}

// --- Form thêm / sửa ------------------------------------------------------------------------------------
function FormLich({
  cu,
  ngayMacDinh,
  vaiTro,
  onXong,
  onThoi,
}: {
  cu?: LichCongTac;
  ngayMacDinh: string;
  vaiTro: VaiTroCanBo;
  onXong: () => void;
  onThoi: () => void;
}) {
  const { api } = useDuLieuCanBo();
  const [dang, datDang] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);
  const bd = cu ? phanVN(cu.bat_dau) : { ngay: ngayMacDinh, gio: "08:00" };
  const kt = cu ? phanVN(cu.ket_thuc) : { ngay: ngayMacDinh, gio: "09:00" };
  const tien = cu ? `l-${cu.id.slice(0, 8)}` : "l-moi";

  const gui = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const chu = (k: string) => String(f.get(k) ?? "").trim();
    const batDau = isoVN(chu("ngay_bat_dau"), chu("gio_bat_dau"));
    const ketThuc = isoVN(chu("ngay_ket_thuc") || chu("ngay_bat_dau"), chu("gio_ket_thuc"));
    if (new Date(ketThuc) <= new Date(batDau)) {
      datLoi("Giờ kết thúc phải sau giờ bắt đầu.");
      return;
    }
    const duLieu: GhiLich = {
      tieu_de: chu("tieu_de"),
      loai: chu("loai") as LoaiLich,
      bat_dau: batDau,
      ket_thuc: ketThuc,
      dia_diem: chu("dia_diem") || null,
      chu_tri: chu("chu_tri") || null,
      thanh_phan: chu("thanh_phan") || null,
      ghi_chu: chu("ghi_chu") || null,
    };
    if (!cu && vaiTro === "lanh_dao" && f.get("duyet_luon") === "on") duLieu.trang_thai = "da_duyet";
    datDang(true);
    datLoi(null);
    try {
      await api.ghiLich(duLieu, cu?.id);
      onXong();
    } catch (err) {
      datLoi(thongDiep(err, "Chưa lưu được lịch."));
      datDang(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          <h2>{cu ? "Sửa lịch" : "Thêm lịch công tác"}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void gui(e)} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`${tien}-tieu-de`}>Nội dung công việc</Label>
            <Input id={`${tien}-tieu-de`} name="tieu_de" required minLength={3} maxLength={300} defaultValue={cu?.tieu_de} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${tien}-loai`}>Loại</Label>
            <select id={`${tien}-loai`} name="loai" className={LOP_CHON} defaultValue={cu?.loai ?? "hop"}>
              {Object.entries(TEN_LOAI_LICH).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${tien}-dia-diem`}>Địa điểm (không bắt buộc)</Label>
            <Input id={`${tien}-dia-diem`} name="dia_diem" maxLength={200} defaultValue={cu?.dia_diem ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${tien}-ngay-bd`}>Ngày bắt đầu</Label>
            <Input id={`${tien}-ngay-bd`} name="ngay_bat_dau" type="date" required defaultValue={bd.ngay} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${tien}-gio-bd`}>Giờ bắt đầu</Label>
            <Input id={`${tien}-gio-bd`} name="gio_bat_dau" type="time" required defaultValue={bd.gio} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${tien}-ngay-kt`}>Ngày kết thúc</Label>
            <Input id={`${tien}-ngay-kt`} name="ngay_ket_thuc" type="date" required defaultValue={kt.ngay} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${tien}-gio-kt`}>Giờ kết thúc</Label>
            <Input id={`${tien}-gio-kt`} name="gio_ket_thuc" type="time" required defaultValue={kt.gio} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${tien}-chu-tri`}>Chủ trì (không bắt buộc)</Label>
            <Input id={`${tien}-chu-tri`} name="chu_tri" maxLength={200} defaultValue={cu?.chu_tri ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${tien}-thanh-phan`}>Thành phần (không bắt buộc)</Label>
            <Input id={`${tien}-thanh-phan`} name="thanh_phan" maxLength={1000} defaultValue={cu?.thanh_phan ?? ""} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`${tien}-ghi-chu`}>Ghi chú (không bắt buộc)</Label>
            <Textarea id={`${tien}-ghi-chu`} name="ghi_chu" maxLength={2000} rows={2} defaultValue={cu?.ghi_chu ?? ""} />
          </div>
          {!cu && vaiTro === "lanh_dao" && (
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" name="duyet_luon" defaultChecked className="size-5" />
              Duyệt luôn (cán bộ thấy ngay)
            </label>
          )}
          {!cu && vaiTro === "van_thu" && (
            <p className="text-muted-foreground sm:col-span-2">Lịch mới ở trạng thái dự kiến, chờ lãnh đạo duyệt.</p>
          )}
          {loi && (
            <p role="alert" className="text-destructive sm:col-span-2">
              {loi}
            </p>
          )}
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button type="submit" disabled={dang}>
              {dang ? "Đang lưu…" : cu ? "Lưu thay đổi" : "Thêm lịch"}
            </Button>
            <Button type="button" variant="outline" onClick={onThoi}>
              Thôi
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// --- Một mục lịch ---------------------------------------------------------------------------------------
function MucLich({ l, onDoi }: { l: LichCongTac; onDoi: () => void }) {
  const { api, vaiTro } = useDuLieuCanBo();
  const [che, datChe] = useState<"xem" | "sua" | "huy">("xem");
  const [lyDo, datLyDo] = useState("");
  const [dang, datDang] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);
  const daHuy = l.trang_thai === "da_huy";

  const ghi = async (duLieu: GhiLich) => {
    datDang(true);
    datLoi(null);
    try {
      await api.ghiLich(duLieu, l.id);
      datChe("xem");
      onDoi();
    } catch (err) {
      datLoi(thongDiep(err, "Chưa lưu được lịch."));
    } finally {
      datDang(false);
    }
  };

  if (che === "sua") {
    return (
      <li>
        <FormLich
          cu={l}
          ngayMacDinh={phanVN(l.bat_dau).ngay}
          vaiTro={vaiTro}
          onXong={() => {
            datChe("xem");
            onDoi();
          }}
          onThoi={() => datChe("xem")}
        />
      </li>
    );
  }
  return (
    <li className={`rounded-lg border p-4 ${daHuy ? "bg-muted" : "bg-card"}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-base font-semibold tabular-nums">{khoangGio(l)}</span>
        <h3 className={`text-lg font-semibold ${daHuy ? "line-through" : ""}`}>{l.tieu_de}</h3>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge variant="outline">{TEN_LOAI_LICH[l.loai]}</Badge>
        <Badge variant={l.trang_thai === "da_duyet" ? "secondary" : daHuy ? "destructive" : "outline"}>
          {TEN_TRANG_THAI[l.trang_thai]}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-1 text-base">
        {l.dia_diem && (
          <div className="flex gap-2">
            <dt>
              <MapPin aria-hidden="true" className="mt-1 size-4" />
              <span className="sr-only">Địa điểm</span>
            </dt>
            <dd>{l.dia_diem}</dd>
          </div>
        )}
        {l.chu_tri && (
          <div className="flex gap-2">
            <dt>
              <UserRound aria-hidden="true" className="mt-1 size-4" />
              <span className="sr-only">Chủ trì</span>
            </dt>
            <dd>Chủ trì: {l.chu_tri}</dd>
          </div>
        )}
        {l.thanh_phan && (
          <div className="flex gap-2">
            <dt>
              <Users aria-hidden="true" className="mt-1 size-4" />
              <span className="sr-only">Thành phần</span>
            </dt>
            <dd>Thành phần: {l.thanh_phan}</dd>
          </div>
        )}
      </dl>
      {l.ghi_chu && <p className="mt-2 whitespace-pre-line text-muted-foreground">{l.ghi_chu}</p>}
      {daHuy && l.ly_do_huy && <p className="mt-2 font-medium">Lý do hủy: {l.ly_do_huy}</p>}

      {che === "huy" ? (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ghi({ trang_thai: "da_huy", ly_do_huy: lyDo.trim() });
          }}
        >
          <Label htmlFor={`huy-${l.id}`}>Lý do hủy</Label>
          <Input id={`huy-${l.id}`} required minLength={3} maxLength={500} value={lyDo} onChange={(e) => datLyDo(e.target.value)} />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="destructive" disabled={dang}>
              {dang ? "Đang hủy…" : "Xác nhận hủy lịch"}
            </Button>
            <Button type="button" variant="outline" onClick={() => datChe("xem")}>
              Thôi
            </Button>
          </div>
        </form>
      ) : (
        duocSuaLich(vaiTro, l) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {vaiTro === "lanh_dao" && l.trang_thai === "du_kien" && (
              <Button size="sm" disabled={dang} onClick={() => void ghi({ trang_thai: "da_duyet" })}>
                <Check aria-hidden="true" />
                Duyệt
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => datChe("sua")}>
              <Pencil aria-hidden="true" />
              Sửa
            </Button>
            <Button size="sm" variant="outline" onClick={() => datChe("huy")}>
              <X aria-hidden="true" />
              Hủy lịch
            </Button>
          </div>
        )
      )}
      {loi && (
        <p role="alert" className="mt-2 text-destructive">
          {loi}
        </p>
      )}
    </li>
  );
}

// --- Trang ---------------------------------------------------------------------------------------------
export function LichCongTacTrang() {
  const { api, vaiTro } = useDuLieuCanBo();
  const [thamSo, datThamSo] = useSearchParams();
  const homNay = phanVN(new Date()).ngay;
  const tuanUrl = thamSo.get("tuan") ?? "";
  const tuan = /^\d{4}-\d{2}-\d{2}$/.test(tuanUrl) ? thuHai(tuanUrl) : thuHai(homNay);
  const [ds, datDs] = useState<LichCongTac[] | null>(null);
  const [loi, datLoi] = useState<string | null>(null);
  const [them, datThem] = useState(false);
  const [lan, datLan] = useState(0);
  const taiLai = useCallback(() => datLan((n) => n + 1), []);

  useEffect(() => {
    document.title = "Lịch công tác – Cổng cán bộ – Commune DX-OS";
  }, []);
  useEffect(() => {
    let con = true;
    datLoi(null);
    api
      .layLich(isoVN(tuan, "00:00"), isoVN(congNgay(tuan, 7), "00:00"))
      .then((x) => con && datDs(x))
      .catch((e: unknown) => con && datLoi(thongDiep(e, "Không tải được lịch công tác.")));
    return () => {
      con = false;
    };
  }, [api, tuan, lan]);

  const denTuan = (ngay: string) => {
    datDs(null);
    datThamSo(ngay === thuHai(homNay) ? {} : { tuan: ngay });
  };
  const ngayTrongTuan = Array.from({ length: 7 }, (_, i) => congNgay(tuan, i));
  // Lịch bắt đầu từ tuần trước (đi công tác nhiều ngày) hiện ở thứ Hai.
  const theoNgay = (ngay: string) =>
    (ds ?? []).filter((l) => {
      const n = phanVN(l.bat_dau).ngay;
      return n === ngay || (ngay === tuan && n < tuan);
    });
  const choDuyet = (ds ?? []).filter((l) => l.trang_thai === "du_kien").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Lịch công tác</h1>
          <p className="text-lg text-muted-foreground">
            Tuần từ {ngayDu(tuan)} đến {ngayDu(congNgay(tuan, 6))}
            {vaiTro !== "can_bo" && choDuyet > 0 && ` · ${choDuyet} lịch chờ duyệt`}
          </p>
        </div>
        {duocThemLich(vaiTro) && !them && (
          <Button onClick={() => datThem(true)}>
            <CalendarPlus aria-hidden="true" />
            Thêm lịch
          </Button>
        )}
      </div>
      <nav aria-label="Chọn tuần" className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => denTuan(congNgay(tuan, -7))}>
          <ChevronLeft aria-hidden="true" />
          Tuần trước
        </Button>
        <Button variant="outline" onClick={() => denTuan(thuHai(homNay))} aria-current={tuan === thuHai(homNay) ? "date" : undefined}>
          Tuần này
        </Button>
        <Button variant="outline" onClick={() => denTuan(congNgay(tuan, 7))}>
          Tuần sau
          <ChevronRight aria-hidden="true" />
        </Button>
      </nav>
      {vaiTro === "can_bo" && <p className="text-muted-foreground">Chỉ hiện lịch đã được lãnh đạo duyệt.</p>}

      {them && (
        <FormLich
          ngayMacDinh={tuan <= homNay && homNay < congNgay(tuan, 7) ? homNay : tuan}
          vaiTro={vaiTro}
          onXong={() => {
            datThem(false);
            taiLai();
          }}
          onThoi={() => datThem(false)}
        />
      )}

      {loi ? (
        <ThongBao loai="loi" tieuDe="Không tải được lịch công tác">
          {loi}
        </ThongBao>
      ) : ds === null ? (
        <Skeleton className="h-64 w-full" />
      ) : ds.length === 0 ? (
        <ThongBao loai="trong" tieuDe="Tuần này chưa có lịch" />
      ) : (
        ngayTrongTuan.map((ngay, i) => {
          const muc = theoNgay(ngay);
          return (
            <section key={ngay} aria-labelledby={`ngay-${ngay}`} className="flex flex-col gap-3">
              <h2 id={`ngay-${ngay}`} className="text-xl font-semibold">
                {TEN_THU[i]}, {ngayNgan(ngay)}
                {ngay === homNay && <span className="ml-2 text-base font-normal text-muted-foreground">(hôm nay)</span>}
              </h2>
              {muc.length === 0 ? (
                <p className="text-muted-foreground">Không có lịch.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {muc.map((l) => (
                    <MucLich key={l.id} l={l} onDoi={taiLai} />
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Form nộp hồ sơ nhiều bước theo mẫu dịch vụ công của GOV.UK (học cách thiết kế, không chép mã):
// mỗi trang một nhóm câu hỏi, thanh bước, tóm tắt lỗi đầu form, "Kiểm tra lại thông tin", "Đã nộp".
// Poka-yoke phía trình duyệt theo JSON Schema 2020-12 của gói (lib/thanh-phan.ts): thiếu thành phần
// bắt buộc thì không sang bước sau, và lib/ho-so.ts nopHoSo kiểm lại trước khi gửi request đầu tiên.
// Bấm nộp thì tạo hồ sơ, tải tệp, khởi tạo quy trình thật qua APISIX; máy chủ kiểm lại schema với
// tệp đã quét sạch trước khi khởi tạo (#59).
import { ArrowLeft, ArrowRight, CircleAlert, LogIn } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { tenHienThi, useXacThuc } from "@/auth/xac-thuc";
import { Khung } from "@/components/khung";
import { TaiThuTuc } from "@/components/tai-thu-tuc";
import { ThongBao } from "@/components/thong-bao";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LoiApi, type ThuTuc } from "@/lib/api";
import { nopHoSo, tienDoMoi, type HoSoMoi, type TienDoNop } from "@/lib/ho-so";
import { docThanhPhan, kiemThanhPhan } from "@/lib/thanh-phan";
import { BuocGiayTo } from "./buoc-giay-to";
import { BuocKiemTra } from "./buoc-kiem-tra";
import { BuocNguoiNop } from "./buoc-nguoi-nop";
import { DaNop } from "./da-nop";
import { CAC_BUOC, chuanSoDienThoai, kiemMotTep, kiemNguoiNop, type DuongBuoc, type Loi, type NguoiNop } from "./kieu";
import { TomTatLoi } from "./tom-tat-loi";
import { ThanhBuoc } from "./thanh-buoc";

const TIEU_DE: Record<DuongBuoc, string> = {
  "nguoi-nop": "Người nộp hồ sơ",
  "giay-to": "Giấy tờ kèm theo",
  "kiem-tra": "Kiểm tra lại thông tin",
};

function kiemTep(thuTuc: ThuTuc, ds: ReturnType<typeof docThanhPhan>, tep: Record<string, File[]>): Loi {
  const thieu = kiemThanhPhan(thuTuc.json_schema, tep);
  return ds.flatMap((tp) => {
    if (thieu[tp.ma]) return [{ id: tp.ma, thongDiep: thieu[tp.ma] }];
    const sai = (tep[tp.ma] ?? []).map(kiemMotTep).find(Boolean);
    return sai ? [{ id: tp.ma, thongDiep: sai }] : [];
  });
}

function Form({ thuTuc }: { thuTuc: ThuTuc }) {
  const { buoc = "nguoi-nop" } = useParams();
  const { nguoiDung } = useXacThuc();
  const dieuHuong = useNavigate();
  const goc = `/nop-ho-so/${encodeURIComponent(thuTuc.ma)}`;
  const thanhPhan = useMemo(() => docThanhPhan(thuTuc.json_schema), [thuTuc]);

  const [nguoiNop, datNguoiNop] = useState<NguoiNop>({ hoTen: nguoiDung?.profile.name ?? "", soDienThoai: "" });
  const [tep, datTep] = useState<Record<string, File[]>>({});
  const [loi, datLoi] = useState<Loi>([]);
  const [lanKiem, datLanKiem] = useState(0);
  const tienDo = useRef<TienDoNop>(tienDoMoi());
  const [dangGui, datDangGui] = useState(false);
  const [loiGui, datLoiGui] = useState<string | null>(null);
  const [daNop, datDaNop] = useState<HoSoMoi | null>(null);

  if (buoc === "da-nop") {
    if (!daNop) return <Navigate to={goc} replace />;
    return (
      <Khung>
        <DaNop thuTuc={thuTuc} hoSo={daNop} nguoiNop={nguoiNop} />
      </Khung>
    );
  }

  const chiSo = CAC_BUOC.findIndex((b) => b.duong === buoc);
  if (chiSo < 0) return <Navigate to={goc} replace />;
  // Không nhảy cóc qua bước chưa hợp lệ (vd mở thẳng /kiem-tra).
  if (chiSo >= 1 && kiemNguoiNop(nguoiNop).length) return <Navigate to={`${goc}/nguoi-nop`} replace />;
  if (chiSo >= 2 && kiemTep(thuTuc, thanhPhan, tep).length) return <Navigate to={`${goc}/giay-to`} replace />;

  const duong = CAC_BUOC[chiSo].duong;
  const daTaoHoSo = tienDo.current.hoSo;
  const sang = (d: string) => {
    datLoi([]);
    dieuHuong(d);
    window.scrollTo(0, 0);
  };

  const nop = async () => {
    const token = nguoiDung?.access_token;
    if (!token) {
      datLoiGui("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      return;
    }
    datDangGui(true);
    datLoiGui(null);
    try {
      const hoSo = await nopHoSo(
        token,
        thuTuc,
        { ho_ten_nguoi_nop: nguoiNop.hoTen.trim(), so_dien_thoai: chuanSoDienThoai(nguoiNop.soDienThoai) },
        tep,
        tienDo.current,
      );
      datDaNop(hoSo);
      sang(`${goc}/da-nop`);
    } catch (e) {
      datLoiGui(e instanceof LoiApi ? e.message : "Chưa nộp được hồ sơ. Vui lòng thử lại.");
    } finally {
      datDangGui(false);
    }
  };

  const gui = (e: FormEvent) => {
    e.preventDefault();
    if (duong === "kiem-tra") {
      void nop();
      return;
    }
    const l = duong === "nguoi-nop" ? kiemNguoiNop(nguoiNop) : kiemTep(thuTuc, thanhPhan, tep);
    datLoi(l);
    datLanKiem((n) => n + 1);
    if (!l.length) sang(`${goc}/${CAC_BUOC[chiSo + 1].duong}`);
  };

  return (
    <Khung className="flex flex-col gap-8">
      <Link
        to={chiSo === 0 ? `/thu-tuc/${encodeURIComponent(thuTuc.ma)}` : `${goc}/${CAC_BUOC[chiSo - 1].duong}`}
        onClick={() => datLoi([])}
        className="flex w-fit items-center gap-1 rounded-sm text-link underline underline-offset-4 hover:decoration-2"
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
        Quay lại
      </Link>
      <div className="flex max-w-3xl flex-col gap-6">
        <ThanhBuoc hienTai={chiSo} />
        <TomTatLoi loi={loi} lanKiem={lanKiem} />
        {duong === "kiem-tra" && loiGui && (
          <Alert className="border-2 border-warning bg-destructive-soft [&>svg]:text-warning">
            <CircleAlert aria-hidden="true" />
            <AlertTitle className="text-foreground">Chưa nộp xong hồ sơ</AlertTitle>
            <AlertDescription className="text-foreground">
              <p>{loiGui}</p>
              {daTaoHoSo && (
                <p>
                  Hồ sơ <strong>{daTaoHoSo.ma_ho_so}</strong> đã được tạo nhưng chưa gửi tới cán bộ. Bấm “Thử lại” để
                  tiếp tục từ chỗ dở dang, không phải nhập lại.
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}
        <header className="flex flex-col gap-2">
          <p className="text-lg text-muted-foreground">
            {thuTuc.ten} · Bước {chiSo + 1} trên {CAC_BUOC.length}
          </p>
          <h1 className="text-3xl font-bold sm:text-4xl">{TIEU_DE[duong]}</h1>
        </header>
      </div>
      <form noValidate onSubmit={gui} className="flex flex-col gap-10" aria-label={TIEU_DE[duong]}>
        {duong === "nguoi-nop" && <BuocNguoiNop giaTri={nguoiNop} doi={datNguoiNop} loi={loi} />}
        {duong === "giay-to" && (
          <BuocGiayTo
            thanhPhan={thanhPhan}
            tep={tep}
            loi={loi}
            doi={(ma, ds) => datTep((t) => ({ ...t, [ma]: ds }))}
          />
        )}
        {duong === "kiem-tra" && (
          <BuocKiemTra
            thuTuc={thuTuc}
            nguoiNop={nguoiNop}
            thanhPhan={thanhPhan}
            tep={tep}
            goc={goc}
            khoaSua={!!daTaoHoSo}
          />
        )}
        <div className="flex flex-col items-start gap-3">
          <Button type="submit" size="lg" disabled={dangGui}>
            {duong !== "kiem-tra" ? "Tiếp tục" : dangGui ? "Đang nộp…" : loiGui ? "Thử lại" : "Đồng ý và nộp hồ sơ"}
            {duong !== "kiem-tra" && <ArrowRight aria-hidden="true" />}
          </Button>
          <p role="status" className="sr-only">
            {dangGui ? "Đang nộp hồ sơ và tải giấy tờ, vui lòng chờ." : ""}
          </p>
        </div>
      </form>
    </Khung>
  );
}

/** Chưa đăng nhập: thẻ giữa trang theo bố cục block login-03 của shadcn/ui, nội dung là khối thông báo chung. */
function ChuaDangNhap({ thuTuc }: { thuTuc: ThuTuc }) {
  const { dangNhap } = useXacThuc();
  return (
    <div className="flex-1 bg-surface">
      <Khung className="flex justify-center md:py-16">
        <ThongBao
          capTieuDe="h1"
          bieuTuong={LogIn}
          tieuDe="Đăng nhập để nộp hồ sơ"
          className="max-w-xl"
          hanhDong={
            <>
              <Button size="lg" onClick={() => dangNhap(`/nop-ho-so/${encodeURIComponent(thuTuc.ma)}`)}>
                <LogIn aria-hidden="true" />
                Đăng nhập
              </Button>
              <Link
                to={`/thu-tuc/${encodeURIComponent(thuTuc.ma)}`}
                className="rounded-sm text-link underline underline-offset-4"
              >
                Xem lại giấy tờ cần có
              </Link>
            </>
          }
        >
          Bạn đang nộp hồ sơ <strong className="text-foreground">{thuTuc.ten}</strong>. Đăng nhập bằng tài khoản công dân để
          hồ sơ gắn với bạn và theo dõi được tiến độ.
        </ThongBao>
      </Khung>
    </div>
  );
}

export function NopHoSo({ taiDanhMuc }: { taiDanhMuc?: () => Promise<ThuTuc[]> }) {
  const { ma = "" } = useParams();
  const { nguoiDung, dangTai } = useXacThuc();
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
  return (
    <TaiThuTuc ma={ma} taiDanhMuc={taiDanhMuc}>
      {(t) => (nguoiDung ? <Form key={`${t.ma}-${tenHienThi(nguoiDung)}`} thuTuc={t} /> : <ChuaDangNhap thuTuc={t} />)}
    </TaiThuTuc>
  );
}

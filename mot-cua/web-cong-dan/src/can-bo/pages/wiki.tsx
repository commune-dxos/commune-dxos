// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Wiki văn bản nội bộ cho cán bộ (#95): tìm văn bản (quy chế, hướng dẫn, quy trình, biểu mẫu…) theo từ khóa, loại,
// gồm/không gồm văn bản hết hiệu lực (tham số trên URL để gửi link được), xem chi tiết và các phiên bản cũ; văn thư,
// lãnh đạo thêm, sửa, ngừng hiệu lực. Ai thấy văn bản nào do mot-cua-api và RLS của CSDL quyết định (phạm vi toàn xã,
// lĩnh vực phụ trách, lãnh đạo); web chỉ ẩn nút người dùng không được bấm. Đoạn khớp do máy chủ đánh dấu bằng hai ký
// tự U+E000/U+E001, web tự dựng <mark>: nội dung văn bản không bao giờ được chèn dưới dạng HTML.
import { ArrowLeft, FilePlus2, History, Pencil, Search, SearchX } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ThongBao } from "@/components/thong-bao";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { GOC_CAN_BO } from "@/auth/oidc";
import { ngay } from "@/lib/dinh-dang";
import { useDuLieuCanBo } from "../du-lieu";
import type {
  GhiWiki,
  KetQuaWiki,
  LinhVuc,
  LoaiWiki,
  PhamViWiki,
  PhienBanWiki,
  TimWiki,
  VanBanWiki,
  VanBanWikiTom,
} from "../lib/api";
import type { VaiTroCanBo } from "../lib/quyen";

export const TEN_LOAI_WIKI: Record<LoaiWiki, string> = {
  quy_che: "Quy chế",
  huong_dan: "Hướng dẫn",
  quy_trinh: "Quy trình",
  bieu_mau: "Biểu mẫu",
  thong_bao_noi_bo: "Thông báo nội bộ",
  khac: "Khác",
};
const TEN_PHAM_VI: Record<PhamViWiki, string> = {
  toan_xa: "Toàn xã",
  linh_vuc: "Lĩnh vực",
  lanh_dao: "Chỉ lãnh đạo",
};
const GOC_WIKI = `${GOC_CAN_BO}/wiki`;
const LOP_CHON =
  "h-12 w-full rounded-md border-2 border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring";

function thongDiep(e: unknown, macDinh: string) {
  return e instanceof Error ? e.message : macDinh;
}

/** Được thêm/sửa văn bản này không (RLS kiểm lại): văn thư mọi phạm vi trừ lãnh đạo, lãnh đạo tất cả. */
export function duocGhi(vaiTro: VaiTroCanBo, phamVi?: PhamViWiki) {
  if (vaiTro === "lanh_dao") return true;
  return vaiTro === "van_thu" && phamVi !== "lanh_dao";
}

/** Chuỗi có đoạn khớp giữa U+E000 … U+E001 → các phần, phần khớp bọc <mark>. */
export function DanhDau({ chu }: { chu: string }) {
  const phan: ReactNode[] = [];
  chu.split("\ue000").forEach((doan, i) => {
    if (i === 0) {
      phan.push(doan);
      return;
    }
    const [khop, sau = ""] = doan.split("\ue001");
    phan.push(
      <mark key={i} className="rounded-sm bg-primary-soft px-0.5 font-semibold text-primary-soft-foreground">
        {khop}
      </mark>,
      sau,
    );
  });
  return <>{phan}</>;
}

function NhanVanBan({ vb, linhVuc }: { vb: VanBanWikiTom; linhVuc: Map<string, string> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{TEN_LOAI_WIKI[vb.loai]}</Badge>
      <Badge variant="outline">
        {vb.pham_vi === "linh_vuc"
          ? `Lĩnh vực: ${(vb.linh_vuc_id && linhVuc.get(vb.linh_vuc_id)) || "—"}`
          : TEN_PHAM_VI[vb.pham_vi]}
      </Badge>
      {vb.trang_thai === "het_hieu_luc" && <Badge variant="destructive">Hết hiệu lực</Badge>}
      {vb.so_ky_hieu && <span className="text-muted-foreground">Số: {vb.so_ky_hieu}</span>}
      {vb.ngay_ban_hanh && <span className="text-muted-foreground">Ban hành {ngay(vb.ngay_ban_hanh)}</span>}
    </div>
  );
}

function useLinhVuc() {
  const { api } = useDuLieuCanBo();
  const [ds, datDs] = useState<LinhVuc[]>([]);
  useEffect(() => {
    let con = true;
    api
      .layLinhVuc()
      .then((r) => con && datDs(r))
      .catch(() => con && datDs([]));
    return () => {
      con = false;
    };
  }, [api]);
  return ds;
}

function KetQua({ kq, linhVuc }: { kq: KetQuaWiki; linhVuc: Map<string, string> }) {
  return (
    <li className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0">
      <h3 className="text-lg font-semibold">
        <Link to={`${GOC_WIKI}/${kq.id}`} className="text-link">
          <DanhDau chu={kq.tieu_de_danh_dau} />
        </Link>
      </h3>
      <NhanVanBan vb={kq} linhVuc={linhVuc} />
      {kq.trich_doan && (
        <p className="text-muted-foreground">
          <DanhDau chu={kq.trich_doan} />
        </p>
      )}
    </li>
  );
}

export function WikiVanBan() {
  const { api, vaiTro } = useDuLieuCanBo();
  const [thamSo, datThamSo] = useSearchParams();
  const q = thamSo.get("q") ?? "";
  const loai = (thamSo.get("loai") ?? "") as LoaiWiki | "";
  const tatCa = thamSo.get("tat_ca") === "1";
  const [kq, datKq] = useState<TimWiki | null>(null);
  const [loi, datLoi] = useState<string | null>(null);
  const dsLinhVuc = useLinhVuc();
  const linhVuc = new Map(dsLinhVuc.map((l) => [l.id, l.ten]));

  useEffect(() => {
    document.title = `Wiki văn bản${q ? ` – ${q}` : ""} – Cổng cán bộ`;
    let con = true;
    datKq(null);
    datLoi(null);
    api
      .timWiki({ q, loai, tatCa })
      .then((r) => con && datKq(r))
      .catch((e: unknown) => con && datLoi(thongDiep(e, "Không tìm được văn bản.")));
    return () => {
      con = false;
    };
  }, [api, q, loai, tatCa]);

  const tim = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const moi = new URLSearchParams();
    const tu = String(f.get("q") ?? "").trim();
    if (tu) moi.set("q", tu);
    if (f.get("loai")) moi.set("loai", String(f.get("loai")));
    if (f.get("tat_ca")) moi.set("tat_ca", "1");
    datThamSo(moi);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Wiki văn bản</h1>
          <p className="text-muted-foreground">
            Quy chế, hướng dẫn nghiệp vụ, quy trình và biểu mẫu nội bộ của xã. Bạn chỉ thấy văn bản thuộc phạm vi của mình.
          </p>
        </div>
        {duocGhi(vaiTro) && (
          <Button asChild>
            <Link to={`${GOC_WIKI}/moi`}>
              <FilePlus2 aria-hidden="true" />
              Thêm văn bản
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <form role="search" aria-label="Tìm văn bản nội bộ" onSubmit={tim} className="grid gap-4 md:grid-cols-[1fr_14rem_auto]"
            key={`${q}|${loai}|${tatCa}`}>
            <div className="grid gap-1.5">
              <Label htmlFor="wiki-q">Từ khóa</Label>
              <Input id="wiki-q" name="q" type="search" defaultValue={q} maxLength={200}
                placeholder="Ví dụ: tiếp công dân, chứng thực bản sao" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wiki-loai">Loại văn bản</Label>
              <select id="wiki-loai" name="loai" defaultValue={loai} className={LOP_CHON}>
                <option value="">Tất cả</option>
                {Object.entries(TEN_LOAI_WIKI).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" className="self-end">
              <Search aria-hidden="true" />
              Tìm
            </Button>
            <label className="flex items-center gap-2 md:col-span-3">
              <input type="checkbox" name="tat_ca" defaultChecked={tatCa} className="size-5" />
              Gồm cả văn bản hết hiệu lực
            </label>
          </form>
        </CardContent>
      </Card>

      {loi && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{loi}</AlertTitle>
        </Alert>
      )}
      {kq?.nguon === "csdl" && (
        <Alert role="status">
          <AlertTitle>Bộ tìm kiếm đang tạm dừng</AlertTitle>
          <AlertDescription>Kết quả được tìm trực tiếp trong cơ sở dữ liệu theo đúng cụm từ, chưa xếp theo mức liên quan.</AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="wiki-ket-qua">
        <h2 id="wiki-ket-qua" className="sr-only">
          Kết quả
        </h2>
        {kq === null && !loi ? (
          <Skeleton className="h-32 w-full" />
        ) : kq && kq.ket_qua.length === 0 ? (
          <ThongBao loai="trong" bieuTuong={SearchX} tieuDe={q ? `Không thấy văn bản nào khớp "${q}"` : "Chưa có văn bản nào"}>
            {q ? "Thử từ khóa ngắn hơn, bỏ dấu hoặc chọn loại khác." : null}
          </ThongBao>
        ) : kq ? (
          <Card>
            <CardHeader>
              <CardDescription role="status">
                {q ? `${kq.tong} văn bản khớp "${q}"` : `${kq.tong} văn bản, mới cập nhật trước`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul>
                {kq.ket_qua.map((k) => (
                  <KetQua key={k.id} kq={k} linhVuc={linhVuc} />
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

export function ChiTietWiki() {
  const { id = "" } = useParams();
  const { api, vaiTro } = useDuLieuCanBo();
  const [vb, datVb] = useState<VanBanWiki | null | undefined>(undefined);
  const [lichSu, datLichSu] = useState<PhienBanWiki[]>([]);
  const [loi, datLoi] = useState<string | null>(null);
  const [thongBao, datThongBao] = useState<string | null>(null);
  const [dang, datDang] = useState(false);
  const dsLinhVuc = useLinhVuc();
  const linhVuc = new Map(dsLinhVuc.map((l) => [l.id, l.ten]));

  const tai = useCallback(async () => {
    try {
      const [v, ls] = await Promise.all([api.layVanBanWiki(id), api.layLichSuWiki(id)]);
      datVb(v);
      datLichSu(ls);
      datLoi(null);
    } catch (e) {
      datLoi(thongDiep(e, "Không tải được văn bản."));
    }
  }, [api, id]);

  useEffect(() => {
    void tai();
  }, [tai]);
  useEffect(() => {
    if (vb) document.title = `${vb.tieu_de} – Wiki văn bản – Cổng cán bộ`;
  }, [vb]);

  const doiHieuLuc = async () => {
    if (!vb) return;
    datDang(true);
    datLoi(null);
    try {
      const moi = await api.ghiWiki({ trang_thai: vb.trang_thai === "hieu_luc" ? "het_hieu_luc" : "hieu_luc" }, vb.id);
      datThongBao(moi.trang_thai === "het_hieu_luc" ? "Đã chuyển văn bản sang hết hiệu lực." : "Văn bản có hiệu lực trở lại.");
      await tai();
    } catch (e) {
      datLoi(thongDiep(e, "Chưa đổi được hiệu lực."));
    } finally {
      datDang(false);
    }
  };

  if (vb === undefined && !loi) return <Skeleton className="h-64 w-full" />;
  if (vb === null) {
    return (
      <ThongBao loai="trong" capTieuDe="h1" tieuDe="Không thấy văn bản"
        hanhDong={<Button asChild variant="outline"><Link to={GOC_WIKI}>Về wiki văn bản</Link></Button>}>
        Văn bản không tồn tại hoặc không thuộc phạm vi bạn được xem.
      </ThongBao>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <Link to={GOC_WIKI} className="inline-flex items-center gap-2 text-link">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Về danh sách
      </Link>
      {loi && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{loi}</AlertTitle>
        </Alert>
      )}
      {thongBao && <ThongBao tieuDe={thongBao} role="status" />}
      {vb && (
        <>
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-bold">{vb.tieu_de}</h1>
            <NhanVanBan vb={vb} linhVuc={linhVuc} />
            <p className="text-sm text-muted-foreground">
              Phiên bản {vb.phien_ban} · cập nhật {new Date(vb.sua_luc).toLocaleString("vi-VN")}
            </p>
            {duocGhi(vaiTro, vb.pham_vi) && (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link to={`${GOC_WIKI}/${vb.id}/sua`}>
                    <Pencil aria-hidden="true" />
                    Sửa
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => void doiHieuLuc()} disabled={dang}>
                  {vb.trang_thai === "hieu_luc" ? "Ngừng hiệu lực" : "Cho hiệu lực lại"}
                </Button>
              </div>
            )}
          </div>
          {vb.tom_tat && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg"><h2>Tóm tắt</h2></CardTitle>
              </CardHeader>
              <CardContent><p>{vb.tom_tat}</p></CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg"><h2>Nội dung</h2></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-w-prose whitespace-pre-wrap leading-relaxed">{vb.noi_dung}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <History aria-hidden="true" className="size-5" />
                <h2>Các phiên bản trước</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lichSu.length === 0 ? (
                <p className="text-muted-foreground">Văn bản chưa được sửa lần nào.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {lichSu.map((p) => (
                    <li key={p.phien_ban}>
                      <details className="rounded-md border border-border p-3">
                        <summary className="cursor-pointer font-medium">
                          Phiên bản {p.phien_ban} · {new Date(p.sua_luc).toLocaleString("vi-VN")}
                          {p.trang_thai === "het_hieu_luc" ? " · hết hiệu lực" : ""}
                        </summary>
                        <p className="mt-2 font-semibold">{p.tieu_de}</p>
                        <div className="mt-1 max-w-prose whitespace-pre-wrap text-muted-foreground">{p.noi_dung}</div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/** Thêm (không có :id) hoặc sửa văn bản wiki. */
export function SoanWiki() {
  const { id } = useParams();
  const { api, vaiTro } = useDuLieuCanBo();
  const dieuHuong = useNavigate();
  const dsLinhVuc = useLinhVuc();
  const [cu, datCu] = useState<VanBanWiki | null | undefined>(id ? undefined : null);
  const [phamVi, datPhamVi] = useState<PhamViWiki>("toan_xa");
  const [dang, datDang] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${id ? "Sửa" : "Thêm"} văn bản – Wiki văn bản – Cổng cán bộ`;
    if (!id) return;
    let con = true;
    api
      .layVanBanWiki(id)
      .then((v) => {
        if (!con) return;
        datCu(v);
        if (v) datPhamVi(v.pham_vi);
      })
      .catch((e: unknown) => con && datLoi(thongDiep(e, "Không tải được văn bản.")));
    return () => {
      con = false;
    };
  }, [api, id]);

  if (!duocGhi(vaiTro, cu?.pham_vi)) {
    return <ThongBao loai="loi" capTieuDe="h1" tieuDe="Bạn không được sửa văn bản này" />;
  }
  if (id && cu === undefined && !loi) return <Skeleton className="h-64 w-full" />;
  if (id && cu === null) return <ThongBao loai="trong" capTieuDe="h1" tieuDe="Không thấy văn bản" />;

  const gui = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const chu = (k: string) => String(f.get(k) ?? "").trim();
    const duLieu: GhiWiki = {
      tieu_de: chu("tieu_de"),
      loai: chu("loai") as LoaiWiki,
      so_ky_hieu: chu("so_ky_hieu") || null,
      ngay_ban_hanh: chu("ngay_ban_hanh") || null,
      tom_tat: chu("tom_tat") || null,
      noi_dung: chu("noi_dung"),
      pham_vi: phamVi,
      linh_vuc_id: phamVi === "linh_vuc" ? chu("linh_vuc_id") || null : null,
    };
    if (phamVi === "linh_vuc" && !duLieu.linh_vuc_id) {
      datLoi("Chọn lĩnh vực cho văn bản phạm vi lĩnh vực.");
      return;
    }
    datDang(true);
    datLoi(null);
    try {
      const moi = await api.ghiWiki(duLieu, id);
      void dieuHuong(`${GOC_WIKI}/${moi.id}`);
    } catch (err) {
      datLoi(thongDiep(err, "Chưa lưu được văn bản."));
      datDang(false);
    }
  };

  const phamViChon: PhamViWiki[] = vaiTro === "lanh_dao" ? ["toan_xa", "linh_vuc", "lanh_dao"] : ["toan_xa", "linh_vuc"];
  return (
    <div className="flex flex-col gap-6">
      <Link to={id ? `${GOC_WIKI}/${id}` : GOC_WIKI} className="inline-flex items-center gap-2 text-link">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {id ? "Về văn bản" : "Về danh sách"}
      </Link>
      <h1 className="text-2xl font-bold">{id ? "Sửa văn bản" : "Thêm văn bản nội bộ"}</h1>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={(e) => void gui(e)} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="w-tieu-de">Tiêu đề</Label>
              <Input id="w-tieu-de" name="tieu_de" required minLength={3} maxLength={300} defaultValue={cu?.tieu_de} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="w-loai">Loại văn bản</Label>
              <select id="w-loai" name="loai" className={LOP_CHON} defaultValue={cu?.loai ?? "huong_dan"}>
                {Object.entries(TEN_LOAI_WIKI).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="w-so">Số, ký hiệu (không bắt buộc)</Label>
              <Input id="w-so" name="so_ky_hieu" maxLength={60} defaultValue={cu?.so_ky_hieu ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="w-ngay">Ngày ban hành (không bắt buộc)</Label>
              <Input id="w-ngay" name="ngay_ban_hanh" type="date" defaultValue={cu?.ngay_ban_hanh ?? ""} />
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-base font-medium">Ai được xem</legend>
              {phamViChon.map((p) => (
                <label key={p} className="flex items-center gap-2">
                  <input type="radio" name="pham_vi" value={p} checked={phamVi === p} onChange={() => datPhamVi(p)} className="size-5" />
                  {p === "toan_xa" ? "Mọi cán bộ của xã" : p === "linh_vuc" ? "Cán bộ phụ trách một lĩnh vực" : "Chỉ lãnh đạo"}
                </label>
              ))}
            </fieldset>
            {phamVi === "linh_vuc" && (
              <div className="grid gap-1.5">
                <Label htmlFor="w-linh-vuc">Lĩnh vực</Label>
                <select id="w-linh-vuc" name="linh_vuc_id" className={LOP_CHON} defaultValue={cu?.linh_vuc_id ?? ""}>
                  <option value="">Chọn lĩnh vực</option>
                  {dsLinhVuc.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.ten}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="w-tom-tat">Tóm tắt (không bắt buộc)</Label>
              <Textarea id="w-tom-tat" name="tom_tat" maxLength={1000} rows={2} defaultValue={cu?.tom_tat ?? ""} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="w-noi-dung">Nội dung</Label>
              <Textarea id="w-noi-dung" name="noi_dung" required rows={12} maxLength={100000} defaultValue={cu?.noi_dung} />
            </div>
            {loi && <p role="alert" className="text-destructive sm:col-span-2">{loi}</p>}
            <Button type="submit" disabled={dang} className="justify-self-start">
              {dang ? "Đang lưu…" : id ? "Lưu thay đổi" : "Thêm văn bản"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

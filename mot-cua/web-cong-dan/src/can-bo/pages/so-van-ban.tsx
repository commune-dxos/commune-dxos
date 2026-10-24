// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Sổ văn bản đến/đi của xã (#78): danh sách theo chiều (?chieu=den|di trên URL), văn thư vào sổ văn bản
// đến (tệp quét, ClamAV, xác minh chữ ký nếu là PDF) và soạn dự thảo văn bản đi, lãnh đạo ký ban hành
// (CSDL cấp số, PDF ký số của xã), ai xem được sổ thì tải được tệp và xác minh chữ ký một PDF. Mọi quyền
// thật do mot-cua-api và RLS kiểm lại; web chỉ ẩn nút người dùng không được bấm.
import { BadgeCheck, Download, FilePlus2, FileSignature, Inbox, ShieldAlert, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { ThongBao } from "@/components/thong-bao";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ngay } from "@/lib/dinh-dang";
import { useDuLieuCanBo } from "../du-lieu";
import { LOAI_VAN_BAN_DI, type ChieuVanBan, type KetQuaXacMinh, type VanBan } from "../lib/api";

const TEN_CHIEU: Record<ChieuVanBan, string> = { den: "Văn bản đến", di: "Văn bản đi" };

function thongDiep(e: unknown, macDinh: string) {
  return e instanceof Error ? e.message : macDinh;
}

/** Tải tệp của văn bản: lấy link ký sẵn ngắn hạn rồi mở bằng <a> (cùng origin với cổng). */
function NutTai({ vb }: { vb: VanBan }) {
  const { api } = useDuLieuCanBo();
  const [loi, datLoi] = useState<string | null>(null);
  const tai = async () => {
    datLoi(null);
    try {
      const { link } = await api.layLinkVanBan(vb.id);
      const a = document.createElement("a");
      a.href = link;
      a.download = vb.ten_tep ?? "van-ban";
      a.click();
    } catch (e) {
      datLoi(thongDiep(e, "Không tải được tệp."));
    }
  };
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => void tai()}>
        <Download aria-hidden="true" />
        Tải<span className="sr-only"> {vb.ky_hieu ?? vb.trich_yeu}</span>
      </Button>
      {loi && <p role="alert" className="text-destructive">{loi}</p>}
    </>
  );
}

function NutKy({ vb, khiXong }: { vb: VanBan; khiXong: (kq: VanBan) => void }) {
  const { api } = useDuLieuCanBo();
  const [dang, datDang] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);
  const ky = async () => {
    datDang(true);
    datLoi(null);
    try {
      khiXong(await api.kyVanBan(vb.id));
    } catch (e) {
      datLoi(thongDiep(e, "Chưa ký được văn bản."));
    } finally {
      datDang(false);
    }
  };
  return (
    <>
      <Button size="sm" onClick={() => void ky()} disabled={dang}>
        <FileSignature aria-hidden="true" />
        {dang ? "Đang ký…" : "Ký ban hành"}
        <span className="sr-only"> {vb.trich_yeu}</span>
      </Button>
      {loi && <p role="alert" className="text-destructive">{loi}</p>}
    </>
  );
}

function TrangThai({ vb }: { vb: VanBan }) {
  if (vb.trang_thai === "du_thao") return <Badge variant="secondary">Dự thảo</Badge>;
  if (vb.chieu === "di") return <Badge>Đã ký ban hành</Badge>;
  const ck = vb.xac_minh_chu_ky;
  if (ck?.coChuKy) {
    return ck.hopLe ? (
      <Badge>Chữ ký số hợp lệ</Badge>
    ) : (
      <Badge variant="destructive">Chữ ký số không hợp lệ</Badge>
    );
  }
  return <Badge variant="outline">Đã vào sổ</Badge>;
}

function FormVaoSoDen({ khiXong }: { khiXong: (vb: VanBan) => void }) {
  const { api } = useDuLieuCanBo();
  const oTep = useRef<HTMLInputElement>(null);
  const [dang, datDang] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);
  const gui = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const tep = oTep.current?.files?.[0];
    if (!tep || tep.size === 0) {
      datLoi("Chọn tệp văn bản (PDF, JPG hoặc PNG).");
      return;
    }
    const chu = (k: string) => String(f.get(k) ?? "").trim();
    datDang(true);
    datLoi(null);
    try {
      khiXong(
        await api.vaoSoDen(tep, {
          loai: chu("loai"),
          ky_hieu: chu("ky_hieu"),
          ngay_van_ban: chu("ngay_van_ban"),
          trich_yeu: chu("trich_yeu"),
          noi_gui: chu("noi_gui"),
          nguoi_ky: chu("nguoi_ky"),
        }),
      );
      form.reset();
    } catch (err) {
      datLoi(thongDiep(err, "Chưa vào sổ được."));
    } finally {
      datDang(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          <h2>Vào sổ văn bản đến</h2>
        </CardTitle>
        <CardDescription>Tệp được quét mã độc trước khi lưu; PDF có chữ ký số được xác minh. Số đến do hệ thống cấp.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void gui(e)} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="den-loai">Loại văn bản</Label>
            <Input id="den-loai" name="loai" required defaultValue="Công văn" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="den-ky-hieu">Số, ký hiệu</Label>
            <Input id="den-ky-hieu" name="ky_hieu" required placeholder="15/UBND-VP" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="den-ngay">Ngày văn bản</Label>
            <Input id="den-ngay" name="ngay_van_ban" type="date" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="den-noi-gui">Nơi gửi</Label>
            <Input id="den-noi-gui" name="noi_gui" required />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="den-trich-yeu">Trích yếu</Label>
            <Input id="den-trich-yeu" name="trich_yeu" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="den-nguoi-ky">Người ký (không bắt buộc)</Label>
            <Input id="den-nguoi-ky" name="nguoi_ky" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="den-tep">Tệp văn bản</Label>
            <Input ref={oTep} id="den-tep" name="tep" type="file" accept=".pdf,.jpg,.jpeg,.png" aria-required="true" />
          </div>
          {loi && <p role="alert" className="text-destructive sm:col-span-2">{loi}</p>}
          <Button type="submit" disabled={dang} className="justify-self-start">
            <Upload aria-hidden="true" />
            {dang ? "Đang vào sổ…" : "Vào sổ"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FormDuThaoDi({ khiXong }: { khiXong: (vb: VanBan) => void }) {
  const { api } = useDuLieuCanBo();
  const [dang, datDang] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);
  const gui = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const chu = (k: string) => String(f.get(k) ?? "").trim();
    datDang(true);
    datLoi(null);
    try {
      khiXong(await api.duThaoDi({ loai: chu("loai"), trich_yeu: chu("trich_yeu"), noi_nhan: chu("noi_nhan"),
        noi_dung: chu("noi_dung") }));
      form.reset();
    } catch (err) {
      datLoi(thongDiep(err, "Chưa lưu được dự thảo."));
    } finally {
      datDang(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          <h2>Soạn văn bản đi</h2>
        </CardTitle>
        <CardDescription>Dự thảo chưa có số; số và ngày văn bản do hệ thống cấp khi lãnh đạo ký ban hành.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void gui(e)} className="grid gap-4">
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="di-loai">Loại văn bản</Label>
            <select id="di-loai" name="loai" className="h-10 rounded-md border bg-background px-3" defaultValue="Thông báo">
              {LOAI_VAN_BAN_DI.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="di-trich-yeu">Trích yếu</Label>
            <Input id="di-trich-yeu" name="trich_yeu" required placeholder="Về việc…" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="di-noi-dung">Nội dung (mỗi dòng một đoạn)</Label>
            <Textarea id="di-noi-dung" name="noi_dung" required rows={6} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="di-noi-nhan">Nơi nhận</Label>
            <Input id="di-noi-nhan" name="noi_nhan" required placeholder="Như trên; Lưu: VT." />
          </div>
          {loi && <p role="alert" className="text-destructive">{loi}</p>}
          <Button type="submit" disabled={dang} className="justify-self-start">
            <FilePlus2 aria-hidden="true" />
            {dang ? "Đang lưu…" : "Lưu dự thảo"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function XacMinhPdf() {
  const { api } = useDuLieuCanBo();
  const [kq, datKq] = useState<KetQuaXacMinh | null>(null);
  const [loi, datLoi] = useState<string | null>(null);
  const chon = async (tep: File | undefined) => {
    datKq(null);
    datLoi(null);
    if (!tep) return;
    try {
      datKq(await api.xacMinh(tep));
    } catch (e) {
      datLoi(thongDiep(e, "Không xác minh được tệp."));
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          <h2>Xác minh chữ ký số</h2>
        </CardTitle>
        <CardDescription>Chọn một tệp PDF (văn bản đi, biên nhận, kết quả) để kiểm chữ ký theo CA của xã.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Label htmlFor="xac-minh-tep" className="sr-only">Tệp PDF cần xác minh</Label>
        <Input id="xac-minh-tep" type="file" accept=".pdf,application/pdf" onChange={(e) => void chon(e.target.files?.[0])} />
        {loi && <p role="alert" className="text-destructive">{loi}</p>}
        {kq && (
          <Alert role="status" variant={kq.hopLe ? "default" : "destructive"}>
            {kq.hopLe ? <BadgeCheck aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
            <AlertTitle>{kq.hopLe ? "Chữ ký số hợp lệ" : "Chữ ký số không hợp lệ"}</AlertTitle>
            <AlertDescription>
              {kq.hopLe ? <p>Người ký: {kq.nguoiKy}</p> : <p>{kq.loi}</p>}
              {kq.phatHanh && (
                <p>
                  Đúng văn bản đã phát hành: {kq.phatHanh.kyHieu ?? kq.phatHanh.maHoSo} ({kq.phatHanh.loai})
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export function SoVanBan() {
  const { api, vaiTro } = useDuLieuCanBo();
  const [thamSo, datThamSo] = useSearchParams();
  const chieu: ChieuVanBan = thamSo.get("chieu") === "di" ? "di" : "den";
  const [ds, datDs] = useState<VanBan[] | null>(null);
  const [loi, datLoi] = useState<string | null>(null);
  const [thongBao, datThongBao] = useState<string | null>(null);

  const tai = useCallback(async () => {
    try {
      datDs(await api.laySoVanBan(chieu));
      datLoi(null);
    } catch (e) {
      datLoi(thongDiep(e, "Không tải được sổ văn bản."));
    }
  }, [api, chieu]);

  useEffect(() => {
    document.title = `Sổ văn bản – ${TEN_CHIEU[chieu]} – Cổng cán bộ`;
    datDs(null);
    void tai();
  }, [chieu, tai]);

  const xong = (tb: (vb: VanBan) => string) => (vb: VanBan) => {
    datThongBao(tb(vb));
    void tai();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sổ văn bản</h1>
          <p className="text-muted-foreground">Văn bản đến và đi của xã, đánh số theo năm.</p>
        </div>
        <div role="group" aria-label="Chiều văn bản" className="flex gap-2">
          {(["den", "di"] as const).map((c) => (
            <Button key={c} variant={c === chieu ? "default" : "outline"} aria-pressed={c === chieu}
              onClick={() => datThamSo({ chieu: c })}>
              {TEN_CHIEU[c]}
            </Button>
          ))}
        </div>
      </div>

      {thongBao && <ThongBao tieuDe={thongBao} role="status" />}
      {loi && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{loi}</AlertTitle>
        </Alert>
      )}

      {vaiTro === "van_thu" && chieu === "den" && <FormVaoSoDen khiXong={xong((vb) => `Đã vào sổ văn bản đến, số đến ${vb.so}/${vb.nam}.`)} />}
      {vaiTro === "van_thu" && chieu === "di" && <FormDuThaoDi khiXong={xong(() => "Đã lưu dự thảo văn bản đi, chờ lãnh đạo ký ban hành.")} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            <h2>{TEN_CHIEU[chieu]}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ds === null ? (
            <Skeleton className="h-24 w-full" />
          ) : ds.length === 0 ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Inbox aria-hidden="true" /> Chưa có văn bản nào.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Số</TableHead>
                  <TableHead>Ký hiệu</TableHead>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Trích yếu</TableHead>
                  <TableHead>{chieu === "den" ? "Nơi gửi" : "Nơi nhận"}</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ds.map((vb) => (
                  <TableRow key={vb.id}>
                    <TableCell className="tabular-nums">{vb.so ? `${vb.so}/${vb.nam}` : "—"}</TableCell>
                    <TableCell>{vb.ky_hieu ?? "—"}</TableCell>
                    <TableCell>{vb.ngay_van_ban ? ngay(vb.ngay_van_ban) : "—"}</TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      <span className="font-medium">{vb.loai}</span> · {vb.trich_yeu}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal">{chieu === "den" ? vb.noi_gui : vb.noi_nhan}</TableCell>
                    <TableCell>
                      <TrangThai vb={vb} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        {vb.trang_thai === "du_thao" && vaiTro === "lanh_dao" && (
                          <NutKy vb={vb} khiXong={xong((v) => `Đã ký ban hành văn bản ${v.ky_hieu}.`)} />
                        )}
                        {vb.trang_thai !== "du_thao" && <NutTai vb={vb} />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <XacMinhPdf />
    </div>
  );
}

#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Tác vụ nền của mot-cua (dịch vụ mot-cua-worker, #9). Ba luồng, mỗi luồng tự kết nối lại khi lỗi:

  phat     đọc hộp thư đi (mot_cua.hop_thu_su_kien) các sự kiện chưa phát, phát lên exchange
           mot_cua.su_kien (routing key = loại sự kiện) qua STOMP, chờ RECEIPT của RabbitMQ
           rồi mới đánh dấu da_phat_luc. RabbitMQ dừng → sự kiện chờ trong bảng, phát khi
           broker lên lại (at-least-once, giữ nguyên id).
  quet     mỗi DXOS_SU_KIEN_QUET_GIAY giây: hồ sơ còn quy trình đang chạy và còn
           ≤ DXOS_SU_KIEN_SAP_TRE_NGAY ngày làm việc tới hạn (chưa quá giờ hết hạn) → ghi sự
           kiện ho_so.sap_tre_han, khóa chống trùng theo (hồ sơ, hạn xử lý): mỗi hạn một lần.
           Rồi đối soát trạng thái (#73): hồ sơ chưa đóng có quy trình mà ho_so.trang_thai lệch
           với bước đang mở / kết quả trong Flowable (mot-cua-api không ghi được CSDL sau khi
           Flowable đã chạy, quy trình đi tiếp ngoài API…) → sửa qua RPC dong_bo_trang_thai,
           nguồn doi_soat, kèm sự kiện. Hồ sơ giấy (không có quy trình) không đụng tới.
  nhan     consumer mẫu: nhận từ queue mot_cua.nhat_ky, kiểm định dạng, ghi
           mot_cua.nhat_ky_su_kien (chống trùng theo id) rồi ACK. Tin sai định dạng → NACK,
           RabbitMQ chuyển sang queue lỗi mot_cua.nhat_ky.loi. Lỗi ghi CSDL → không ACK, kết
           nối lại; RabbitMQ giao lại tin.
  thong_bao  consumer thông báo (#56): nhận ho_so.sap_tre_han từ queue mot_cua.thong_bao, ghi mỗi
           cán bộ phụ trách lĩnh vực của hồ sơ một thông báo (RPC ghi_thong_bao_sap_tre, chống trùng
           theo cán bộ + hồ sơ + mốc hạn) rồi ACK; kênh ngoài DXOS_THONG_BAO_KENH (email, sms) chỉ
           giả lập: ghi CSDL và log, không gửi gì ra ngoài. Sai định dạng/sai loại → NACK (queue lỗi
           mot_cua.thong_bao.loi). Cổng cán bộ đọc qua /api/thong_bao, chuông nhận qua luồng
           /workflow/thong-bao/luong của mot-cua-api.

Chạy tay một lần (vận hành, smoke):  python worker.py quet-mot-lan | doi-soat-mot-lan

Bí mật (OpenBao, AppRole `tang2`, chỉ trong bộ nhớ): thông tin kết nối RabbitMQ của user Tầng
2 (dxos/tang2/mot-cua/rabbitmq, do rabbitmq-init của nền tảng ghi), client secret
mot_cua_su_kien, mật khẩu rest-admin của Flowable (chỉ đọc trạng thái quy trình).
Chỉ dùng thư viện chuẩn Python.
"""

import base64
import datetime
import json
import logging
import os
import socket
import sys
import threading
import time
import urllib.parse

import bimat
import hop_thu
import stomp
import su_kien
import trang_thai

TANG2 = os.environ.get("DXOS_TANG2", "mot-cua")
FLOWABLE_URL = os.environ.get("DXOS_FLOWABLE_URL", "http://flowable:8080/flowable-rest/service")
FLOWABLE_USER = os.environ.get("DXOS_FLOWABLE_USER", "rest-admin")
QUET_GIAY = int(os.environ.get("DXOS_SU_KIEN_QUET_GIAY", "300"))
SAP_TRE_NGAY = int(os.environ.get("DXOS_SU_KIEN_SAP_TRE_NGAY", "1"))
# Chỉ xét hồ sơ có hạn trong khoảng này (ngày lịch) rồi tính chính xác theo ngày làm việc.
CUA_SO_NGAY = 14
# Đối soát bỏ qua hồ sơ vừa đổi bước trong khoảng này: mot-cua-api có thể đang ghi CSDL.
DOI_SOAT_CHO_GIAY = int(os.environ.get("DXOS_DOI_SOAT_CHO_GIAY", "60"))
DOI_SOAT_TOI_DA = int(os.environ.get("DXOS_DOI_SOAT_TOI_DA", "500"))
# Kênh ngoài của thông báo (#56), chế độ giả lập. Kênh lạ → dừng ngay lúc khởi động.
KENH_THONG_BAO = su_kien.kenh_thong_bao(os.environ.get("DXOS_THONG_BAO_KENH", "email,sms"))
TEP_SONG = "/tmp/song"

log = logging.getLogger("mot-cua-worker")


def rabbitmq():
    """→ KetNoi STOMP mới bằng user Tầng 2 (đọc lại OpenBao mỗi lần: theo kịp đổi mật khẩu)."""
    c = bimat.doc(f"tang2/{TANG2}/rabbitmq")
    return stomp.KetNoi(c["host"], int(c["stomp_port"]), c["username"], c["password"], c["vhost"])


def flowable(path):
    mat_khau = bimat.doc("core/flowable/rest-admin")["password"]
    auth = "Basic " + base64.b64encode(f"{FLOWABLE_USER}:{mat_khau}".encode()).decode()
    status, data = hop_thu._goi("GET", FLOWABLE_URL + path, headers={"Authorization": auth})
    if status >= 400:
        raise hop_thu.LoiHopThu(f"Flowable GET {path.split('?')[0]} → {status}")
    return data


# --- phat ---------------------------------------------------------------------------
def phat_mot_vong(ket_noi):
    """Phát các sự kiện đang chờ. → (kết nối còn dùng được hoặc None, số đã phát)."""
    rows = hop_thu.chua_phat()
    n = 0
    for r in rows:
        ev = r["noi_dung"]
        if ket_noi is None:
            ket_noi = rabbitmq()
        try:
            ket_noi.phat(su_kien.dich(r["loai"]), json.dumps(ev, ensure_ascii=False),
                         {"content-type": "application/json", "amqp-message-id": ev["id"], "type": r["loai"],
                          "app-id": su_kien.NGUON})
        except (stomp.LoiStomp, OSError) as e:
            ket_noi.dong()
            hop_thu.phat_loi(r["id"], r["so_lan_thu"] + 1, e)
            raise
        hop_thu.da_phat(r["id"])
        log.info("đã phát %s %s (%s)", r["loai"], ev["maHoSo"], ev["id"])
        n += 1
    return ket_noi, n


def vong_phat():
    ket_noi, cho = None, 1
    while True:
        try:
            ket_noi, n = phat_mot_vong(ket_noi)
            cho = 1
            time.sleep(0.2 if n else 2)
        except Exception as e:  # noqa: BLE001 – luồng nền không được chết
            log.warning("phát sự kiện lỗi, thử lại sau %ds: %s", cho, e)
            ket_noi = None
            time.sleep(cho)
            cho = min(cho * 2, 30)


# --- quet ---------------------------------------------------------------------------
def quet_mot_lan(luc=None):
    """→ số sự kiện ho_so.sap_tre_han mới ghi vào hộp thư đi."""
    luc = luc or su_kien.bay_gio()
    hom_nay = luc.date()
    den = hom_nay + datetime.timedelta(days=CUA_SO_NGAY)
    ds = hop_thu.pgrst("GET", f"/ho_so?trang_thai=not.in.(hoan_tat,tu_choi)&han_xu_ly=gte.{hom_nay}"
                              f"&han_xu_ly=lte.{den}&select={hop_thu.COT_HO_SO}&order=han_xu_ly")
    nghi = {datetime.date.fromisoformat(r["ngay"])
            for r in hop_thu.pgrst("GET", f"/ngay_nghi?ngay=gte.{hom_nay}&ngay=lte.{den}&select=ngay")}
    moi = 0
    for hs in ds:
        han = datetime.date.fromisoformat(hs["han_xu_ly"])
        canh_bao, con_lai = su_kien.sap_tre_han(han, luc, nghi, SAP_TRE_NGAY)
        if not canh_bao:
            continue
        khoa = su_kien.khoa_sap_tre_han(hs["id"], han)
        # Chỉ hồ sơ chưa xong: còn quy trình đang chạy (trạng thái trong Flowable là nguồn đúng).
        pis = flowable("/runtime/process-instances?size=10&businessKey=" + urllib.parse.quote(hs["ma_ho_so"]))
        if not pis.get("data"):
            continue
        pi = pis["data"][0]["id"]
        buoc = [t["taskDefinitionKey"] for t in flowable(f"/runtime/tasks?processInstanceId={pi}").get("data", [])]
        if hop_thu.ghi("ho_so.sap_tre_han", hs["id"], {
                "processInstanceId": pi, "hanXuLy": han.isoformat(),
                "hanXuLyLuc": su_kien.het_han_luc(han).isoformat(), "conLaiNgayLamViec": con_lai,
                "buocDangMo": buoc}, khoa_chong_trung=khoa, ho_so=hs):
            moi += 1
    log.info("quét sắp trễ hạn: %d hồ sơ có hạn tới %s, %d cảnh báo mới", len(ds), den, moi)
    return moi


# --- doi_soat (#73) ---------------------------------------------------------------------
def _luc(chuoi):
    try:
        return datetime.datetime.fromisoformat(chuoi)
    except (TypeError, ValueError):
        return None


def _bien_lich_su(pi, ten):
    v = flowable(f"/history/historic-variable-instances?processInstanceId={pi}&variableName={ten}")
    return ((v or {}).get("data") or [{}])[0].get("variable", {}).get("value")


def doi_soat_ho_so(hs, bang, luc, cho_giay):
    """Một hồ sơ chưa đóng → trạng thái mới đã ghi, hoặc None nếu không cần/không được sửa."""
    pis = flowable("/history/historic-process-instances?size=10&businessKey="
                   + urllib.parse.quote(hs["ma_ho_so"])).get("data", [])
    if not pis:
        return None  # hồ sơ giấy, xử lý tại quầy
    p = max(pis, key=lambda x: x.get("startTime") or "")
    pi, key = p["id"], (p.get("processDefinitionId") or "").split(":")[0]
    gan_nhat = luc - datetime.timedelta(seconds=cho_giay)
    if p.get("endTime"):
        if (_luc(p["endTime"]) or luc) > gan_nhat:
            return None
        ket_qua = _bien_lich_su(pi, "ketQua")
        moi = trang_thai.tinh(hs["trang_thai"], [], bang.get(key), ket_qua, da_ket_thuc=True)
        ds = [(f"ho_so.{ket_qua}", {"processInstanceId": pi, "ketQua": ket_qua, "diemKetThuc": p.get("endActivityId"),
                                    "doiSoat": True}, f"ho_so.ket_thuc:{pi}")] if moi else []
    else:
        tasks = flowable(f"/runtime/tasks?processInstanceId={pi}").get("data", [])
        if any((_luc(t.get("createTime")) or luc) > gan_nhat for t in tasks):
            return None
        buoc = [t["taskDefinitionKey"] for t in tasks]
        moi = trang_thai.tinh(hs["trang_thai"], buoc, bang.get(key))
        ds = [("ho_so.chuyen_buoc", {"processInstanceId": pi, "tuBuoc": None, "denBuoc": buoc, "doiSoat": True}, None)]
    if not moi:
        return None
    ly_do = trang_thai.ly_do(moi, _bien_lich_su(pi, "ghiChu") if moi in ("cho_bo_sung", "tu_choi") else None, None)
    kq = hop_thu.dong_bo(hs["id"], moi, [(su_kien.tao(loai, hs, du_lieu), khoa) for loai, du_lieu, khoa in ds],
                         ly_do=ly_do, nguon="doi_soat")
    if not kq.get("daDoi"):
        return None
    log.warning("đối soát: hồ sơ %s lệch Flowable, %s → %s", hs["ma_ho_so"], kq.get("trangThaiTruoc"), kq.get("trangThai"))
    return kq.get("trangThai")


def doi_soat_mot_lan(cho_giay=DOI_SOAT_CHO_GIAY, luc=None):
    """→ số hồ sơ đã sửa trạng thái cho khớp Flowable."""
    luc = luc or su_kien.bay_gio()
    bang = {r["quy_trinh"]: r.get("trang_thai_buoc")
            for r in hop_thu.pgrst("GET", "/thu_tuc?quy_trinh=not.is.null&select=quy_trinh,trang_thai_buoc")}
    ds = hop_thu.pgrst("GET", f"/ho_so?trang_thai=not.in.(hoan_tat,tu_choi)&select={hop_thu.COT_HO_SO}"
                              f"&order=han_xu_ly.asc.nullslast,id&limit={DOI_SOAT_TOI_DA}")
    sua = 0
    for hs in ds:
        try:
            sua += doi_soat_ho_so(hs, bang, luc, cho_giay) is not None
        except (hop_thu.LoiHopThu, ValueError) as e:
            log.warning("đối soát hồ sơ %s lỗi: %s", hs["ma_ho_so"], e)
    log.info("đối soát trạng thái: %d hồ sơ chưa đóng, %d hồ sơ sửa theo Flowable", len(ds), sua)
    return sua


def vong_quet():
    while True:
        for ten, ham in (("quét sắp trễ hạn", quet_mot_lan), ("đối soát trạng thái", doi_soat_mot_lan)):
            try:
                ham()
            except Exception as e:  # noqa: BLE001
                log.warning("%s lỗi: %s", ten, e)
        time.sleep(QUET_GIAY)


# --- nhan (consumer mẫu) --------------------------------------------------------------
def xu_ly_tin(ket_noi, headers, body):
    """Một tin từ queue: hợp lệ → ghi nhật ký rồi ACK; sai định dạng → NACK (sang queue lỗi).
    Lỗi ghi CSDL → LoiHopThu (không ACK, tin được giao lại)."""
    try:
        ev = su_kien.giai_ma(body)
    except ValueError as e:
        log.warning("tin sai định dạng (message-id %s): %s → queue lỗi", headers.get("message-id"), e)
        ket_noi.nack(headers["ack"])
        return False
    lan_dau = hop_thu.ghi_nhat_ky(ev)
    ket_noi.ack(headers["ack"])
    log.info("nhận %s %s lĩnh vực %s (%s)%s", ev["loai"], ev["maHoSo"], ev["linhVuc"], ev["id"],
             "" if lan_dau else " – đã có, bỏ qua")
    return lan_dau


# --- thong_bao (#56) -----------------------------------------------------------------------
def xu_ly_thong_bao(ket_noi, headers, body, kenh=None):
    """Một tin từ queue mot_cua.thong_bao: ho_so.sap_tre_han hợp lệ → ghi thông báo rồi ACK; sai định
    dạng, sai loại, CSDL từ chối dữ liệu (400) → NACK (sang queue lỗi). Lỗi tạm thời của CSDL →
    LoiHopThu (không ACK, tin được giao lại). → số thông báo mới."""
    kenh = KENH_THONG_BAO if kenh is None else kenh
    try:
        ev = su_kien.giai_ma(body)
        if ev["loai"] != "ho_so.sap_tre_han":
            raise ValueError(f"queue thông báo chỉ nhận ho_so.sap_tre_han, nhận {ev['loai']}")
    except ValueError as e:
        log.warning("tin thông báo sai (message-id %s): %s → queue lỗi", headers.get("message-id"), e)
        ket_noi.nack(headers["ack"])
        return 0
    try:
        kq = hop_thu.ghi_thong_bao(ev, kenh)
    except hop_thu.LoiHopThu as e:
        if e.status == 400:
            log.warning("CSDL từ chối sự kiện %s: %s → queue lỗi", ev["id"], e)
            ket_noi.nack(headers["ack"])
            return 0
        raise
    ket_noi.ack(headers["ack"])
    moi = int(kq.get("moi", 0))
    log.info("thông báo sắp trễ hạn %s: %d mới / %d cán bộ phụ trách%s", ev["maHoSo"], moi, kq.get("nguoiNhan", 0),
             f" ({kq['boQua']})" if kq.get("boQua") else "")
    for k in kenh if moi else ():
        log.info("giả lập gửi %s: %d thông báo hồ sơ %s (không gửi ra ngoài)", k, moi, ev["maHoSo"])
    return moi


def vong_nghe(queue, xu_ly, ten):
    """Consumer một queue: nhận tin, gọi xu_ly(kết nối, header, body); lỗi thì kết nối lại sau 5 giây."""
    while True:
        ket_noi = None
        try:
            ket_noi = rabbitmq()
            ket_noi.dang_ky(f"/amq/queue/{queue}", prefetch=20)
            log.info("%s đang nhận từ queue %s", ten, queue)
            while True:
                try:
                    lenh, h, body = ket_noi.nhan(timeout=30)
                except socket.timeout:
                    continue
                if lenh == "MESSAGE":
                    xu_ly(ket_noi, h, body)
        except Exception as e:  # noqa: BLE001
            log.warning("%s lỗi, kết nối lại sau 5s: %s", ten, e)
            if ket_noi:
                ket_noi.dong()
            time.sleep(5)


def vong_nhan():
    vong_nghe(su_kien.QUEUE_NHAT_KY, xu_ly_tin, "consumer mẫu")


def vong_thong_bao():
    vong_nghe(su_kien.QUEUE_THONG_BAO, xu_ly_thong_bao, "consumer thông báo")


def main():
    luong = [threading.Thread(target=f, name=f.__name__, daemon=True)
             for f in (vong_phat, vong_quet, vong_nhan, vong_thong_bao)]
    for t in luong:
        t.start()
    log.info("mot-cua-worker mot-cua: phát outbox, quét sắp trễ hạn mỗi %ds (ngưỡng %d ngày làm việc), consumer mẫu, "
             "consumer thông báo (kênh giả lập: %s)", QUET_GIAY, SAP_TRE_NGAY, ", ".join(KENH_THONG_BAO) or "không")
    while all(t.is_alive() for t in luong):
        with open(TEP_SONG, "w", encoding="utf-8") as f:
            f.write(str(time.time()))
        time.sleep(10)
    sys.exit("mot-cua-worker: một luồng nền đã dừng")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(threadName)s %(message)s")
    if sys.argv[1:] == ["quet-mot-lan"]:
        print(quet_mot_lan())
    elif sys.argv[1:] == ["doi-soat-mot-lan"]:
        print(doi_soat_mot_lan(cho_giay=0))
    else:
        main()

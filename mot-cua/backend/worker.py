#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Tác vụ nền của mot-cua (dịch vụ mot-cua-worker, #9). Ba luồng, mỗi luồng tự kết nối lại khi lỗi:

  phat     đọc hộp thư đi (mot_cua.hop_thu_su_kien) các sự kiện chưa phát, phát lên exchange
           mot_cua.su_kien (routing key = loại sự kiện) qua STOMP, chờ RECEIPT của RabbitMQ
           rồi mới đánh dấu da_phat_luc. RabbitMQ dừng → sự kiện chờ trong bảng, phát khi
           broker lên lại (at-least-once, giữ nguyên id).
  quet     mỗi DXOS_SU_KIEN_QUET_GIAY giây: hồ sơ còn quy trình đang chạy và còn
           ≤ DXOS_SU_KIEN_SAP_TRE_NGAY ngày làm việc tới hạn (chưa quá giờ hết hạn) → ghi sự
           kiện ho_so.sap_tre_han, khóa chống trùng theo (hồ sơ, hạn xử lý): mỗi hạn một lần.
  nhan     consumer mẫu: nhận từ queue mot_cua.nhat_ky, kiểm định dạng, ghi
           mot_cua.nhat_ky_su_kien (chống trùng theo id) rồi ACK. Tin sai định dạng → NACK,
           RabbitMQ chuyển sang queue lỗi mot_cua.nhat_ky.loi. Lỗi ghi CSDL → không ACK, kết
           nối lại; RabbitMQ giao lại tin. Nền cho thông báo (tuần 3).

Chạy tay một lần quét (vận hành, smoke):  python worker.py quet-mot-lan

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

TANG2 = os.environ.get("DXOS_TANG2", "mot-cua")
FLOWABLE_URL = os.environ.get("DXOS_FLOWABLE_URL", "http://flowable:8080/flowable-rest/service")
FLOWABLE_USER = os.environ.get("DXOS_FLOWABLE_USER", "rest-admin")
QUET_GIAY = int(os.environ.get("DXOS_SU_KIEN_QUET_GIAY", "300"))
SAP_TRE_NGAY = int(os.environ.get("DXOS_SU_KIEN_SAP_TRE_NGAY", "1"))
# Chỉ xét hồ sơ có hạn trong khoảng này (ngày lịch) rồi tính chính xác theo ngày làm việc.
CUA_SO_NGAY = 14
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


def vong_quet():
    while True:
        try:
            quet_mot_lan()
        except Exception as e:  # noqa: BLE001
            log.warning("quét sắp trễ hạn lỗi: %s", e)
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


def vong_nhan():
    while True:
        ket_noi = None
        try:
            ket_noi = rabbitmq()
            ket_noi.dang_ky(f"/amq/queue/{su_kien.QUEUE_NHAT_KY}", prefetch=20)
            log.info("consumer mẫu đang nhận từ queue %s", su_kien.QUEUE_NHAT_KY)
            while True:
                try:
                    lenh, h, body = ket_noi.nhan(timeout=30)
                except socket.timeout:
                    continue
                if lenh == "MESSAGE":
                    xu_ly_tin(ket_noi, h, body)
        except Exception as e:  # noqa: BLE001
            log.warning("consumer lỗi, kết nối lại sau 5s: %s", e)
            if ket_noi:
                ket_noi.dong()
            time.sleep(5)


def main():
    luong = [threading.Thread(target=f, name=f.__name__, daemon=True) for f in (vong_phat, vong_quet, vong_nhan)]
    for t in luong:
        t.start()
    log.info("mot-cua-worker mot-cua: phát outbox, quét sắp trễ hạn mỗi %ds (ngưỡng %d ngày làm việc), consumer mẫu",
             QUET_GIAY, SAP_TRE_NGAY)
    while all(t.is_alive() for t in luong):
        with open(TEP_SONG, "w", encoding="utf-8") as f:
            f.write(str(time.time()))
        time.sleep(10)
    sys.exit("mot-cua-worker: một luồng nền đã dừng")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(threadName)s %(message)s")
    if sys.argv[1:] == ["quet-mot-lan"]:
        print(quet_mot_lan())
    else:
        main()

# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Dựng báo cáo Superset của bộ máy một cửa bằng mã (#82): superset-init của lõi chạy tệp này trong
image Superset ở mỗi `make up-bi`. Idempotent: mọi đối tượng có uuid cố định (uuid5 theo tên), chạy lại
thì cập nhật, không nhân bản; không ai phải bấm tay trong giao diện.

  kết nối   "Báo cáo một cửa": PostgreSQL schema bao_cao (bảng mart do kho dữ liệu #80 nạp), bằng role
            chỉ đọc bao_cao_doc (mật khẩu từ OpenBao, agent superset-secrets); không đọc được mot_cua
  dataset   bao_cao.fct_ho_so, bao_cao.hieu_suat_thang, kèm thước đo (metric) dùng chung
  chart     số hồ sơ đã đóng, tỷ lệ trễ hạn, thời gian giải quyết trung bình/trung vị theo thủ tục ×
            tháng, tỷ lệ trễ hạn theo tháng × thủ tục, số hồ sơ theo lĩnh vực
  dashboard "Hiệu suất một cửa" (slug hieu-suat-mot-cua), chỉ vai "Lãnh đạo xã" xem (DASHBOARD_RBAC)
  vai trò   "Lãnh đạo xã" = quyền Gamma (xem) + quyền đọc hai dataset; lõi ánh xạ client role lanh_dao
            của Keycloak sang vai này (DXOS_SUPERSET_VAI_TRO trong docker-compose.yml)

Mỗi chart lưu cả form_data (giao diện vẽ) và query_context (GET /api/v1/chart/{id}/data trả số liệu,
smoke dùng để đối chiếu với bảng mart).
"""

import json
import os
import uuid

TEN_KET_NOI = "Báo cáo một cửa"
VAI_XEM = "Lãnh đạo xã"
SLUG = "hieu-suat-mot-cua"
GOC = uuid.UUID("7e5a0000-0000-4000-8000-000000000082")


def _uuid(ten):
    return uuid.uuid5(GOC, ten)


def uri_bao_cao():
    tep = os.environ.get("DXOS_BAO_CAO_DOC_PASSWORD_FILE", "/run/dxos-secrets/bao_cao_doc_password")
    with open(tep, encoding="utf-8") as f:
        mat_khau = f.read().strip()
    host = os.environ.get("DXOS_BAO_CAO_DB_HOST", "postgres")
    ten_db = os.environ.get("DXOS_BAO_CAO_DB", "commune")
    return f"postgresql+psycopg2://bao_cao_doc:{mat_khau}@{host}:5432/{ten_db}"


# Thước đo trên từng dataset: tên → (biểu thức SQL PostgreSQL, nhãn, định dạng d3).
METRIC = {
    "fct_ho_so": {
        "so_ho_so": ("COUNT(*)", "Số hồ sơ", ",d"),
        "ty_le_tre_han": ("AVG(CASE WHEN tre_han THEN 1.0 ELSE 0 END)", "Tỷ lệ trễ hạn", ".1%"),
        "tb_ngay_lam_viec": ("AVG(so_ngay_lam_viec)", "Ngày làm việc (trung bình)", ".1f"),
        "trung_vi_ngay_lam_viec": ("percentile_cont(0.5) WITHIN GROUP (ORDER BY so_ngay_lam_viec)",
                                   "Ngày làm việc (trung vị)", ".1f"),
        "tb_gio_giai_quyet": ("AVG(so_gio_giai_quyet)", "Số giờ (trung bình)", ".1f"),
        "trung_vi_gio_giai_quyet": ("percentile_cont(0.5) WITHIN GROUP (ORDER BY so_gio_giai_quyet)",
                                    "Số giờ (trung vị)", ".1f"),
    },
    "hieu_suat_thang": {
        "so_ho_so": ("SUM(so_ho_so)", "Số hồ sơ", ",d"),
        "ty_le_tre_han": ("SUM(so_tre_han)::numeric / NULLIF(SUM(so_ho_so), 0)", "Tỷ lệ trễ hạn", ".1%"),
    },
}
COT_THOI_GIAN = {"thang", "ngay_nhan", "ngay_hoan_tat", "han_xu_ly"}
NHAN_COT = {"thang": "Tháng", "ten_thu_tuc": "Thủ tục", "ten_linh_vuc": "Lĩnh vực", "thu_tuc": "Mã thủ tục",
            "linh_vuc": "Mã lĩnh vực", "ket_qua": "Kết quả", "tre_han": "Trễ hạn"}

# Chart: tên → (dataset, viz_type, cột nhóm, metric, form_data thêm). Cột "thang" là trục thời gian.
CHART = {
    "Hồ sơ đã đóng": ("fct_ho_so", "big_number_total", [], ["so_ho_so"],
                      {"subheader": "hoàn tất hoặc từ chối", "y_axis_format": ",d"}),
    "Tỷ lệ trễ hạn": ("fct_ho_so", "big_number_total", [], ["ty_le_tre_han"],
                      {"subheader": "đóng sau 17:00 ngày hạn", "y_axis_format": ".1%"}),
    "Thời gian giải quyết theo thủ tục và tháng": (
        "fct_ho_so", "table", ["thang", "ten_thu_tuc"],
        ["so_ho_so", "tb_ngay_lam_viec", "trung_vi_ngay_lam_viec", "tb_gio_giai_quyet", "trung_vi_gio_giai_quyet",
         "ty_le_tre_han"],
        {"query_mode": "aggregate", "order_desc": True, "table_timestamp_format": "%m/%Y"}),
    "Tỷ lệ trễ hạn theo tháng và thủ tục": (
        "hieu_suat_thang", "echarts_timeseries_bar", ["ten_thu_tuc"], ["ty_le_tre_han"],
        {"x_axis": "thang", "time_grain_sqla": "P1M", "y_axis_format": ".0%", "show_legend": True,
         "x_axis_time_format": "%m/%Y"}),
    "Số hồ sơ theo lĩnh vực": ("fct_ho_so", "pie", ["ten_linh_vuc"], ["so_ho_so"],
                               {"show_legend": True, "show_labels": True, "label_type": "key_value"}),
}
# Bố cục: mỗi dòng là danh sách (tên chart, độ rộng trên 12 cột).
BO_CUC = [
    [("Hồ sơ đã đóng", 4), ("Tỷ lệ trễ hạn", 4), ("Số hồ sơ theo lĩnh vực", 4)],
    [("Tỷ lệ trễ hạn theo tháng và thủ tục", 12)],
    [("Thời gian giải quyết theo thủ tục và tháng", 12)],
]


def form_data(ds, viz, nhom, metric, them):
    fd = {"datasource": f"{ds.id}__table", "viz_type": viz, "adhoc_filters": [], "row_limit": 1000}
    if viz == "big_number_total":
        fd["metric"] = metric[0]
    elif viz == "pie":
        fd.update(metric=metric[0], groupby=nhom)
    else:
        fd.update(metrics=metric, groupby=nhom)
    if viz == "table":
        fd["all_columns"] = []
    fd.update(them)
    return fd


def query_context(ds, viz, nhom, metric, fd):
    cot = list(nhom)
    if viz == "echarts_timeseries_bar":
        cot = [{"columnType": "BASE_AXIS", "sqlExpression": fd["x_axis"], "label": fd["x_axis"],
                "expressionType": "SQL", "timeGrain": fd["time_grain_sqla"]}] + cot
    return {"datasource": {"id": ds.id, "type": "table"}, "force": False, "form_data": fd,
            "result_format": "json", "result_type": "full",
            "queries": [{"columns": cot, "metrics": metric, "filters": [], "orderby": [],
                         "extras": {"having": "", "where": ""}, "row_limit": 1000, "order_desc": True,
                         "url_params": {}, "custom_params": {}, "custom_form_data": {}}]}


def bo_cuc_json(chart_theo_ten):
    """position_json dạng mà frontend dashboard v2 đọc: ROOT → GRID → ROW → CHART."""
    vt = {"DASHBOARD_VERSION_KEY": "v2", "ROOT_ID": {"type": "ROOT", "id": "ROOT_ID", "children": ["GRID_ID"]},
          "GRID_ID": {"type": "GRID", "id": "GRID_ID", "children": [], "parents": ["ROOT_ID"]}}
    for i, dong in enumerate(BO_CUC):
        hang = f"ROW-{i}"
        vt["GRID_ID"]["children"].append(hang)
        vt[hang] = {"type": "ROW", "id": hang, "children": [], "parents": ["ROOT_ID", "GRID_ID"],
                    "meta": {"background": "BACKGROUND_TRANSPARENT"}}
        for ten, rong in dong:
            c = chart_theo_ten[ten]
            khoa = f"CHART-{c.uuid.hex[:10]}"
            vt[hang]["children"].append(khoa)
            vt[khoa] = {"type": "CHART", "id": khoa, "children": [], "parents": ["ROOT_ID", "GRID_ID", hang],
                        "meta": {"chartId": c.id, "uuid": str(c.uuid), "sliceName": ten, "width": rong,
                                 "height": 50 if ten.startswith("Thời gian") else 40}}
    return vt


def dung():
    from superset import db, security_manager as sm
    from superset.connectors.sqla.models import SqlaTable, SqlMetric
    from superset.models.core import Database
    from superset.models.dashboard import Dashboard
    from superset.models.slice import Slice

    ket_noi = db.session.query(Database).filter_by(uuid=_uuid("ket-noi")).one_or_none()
    if ket_noi is None:
        ket_noi = Database(uuid=_uuid("ket-noi"), database_name=TEN_KET_NOI)
        db.session.add(ket_noi)
    ket_noi.database_name = TEN_KET_NOI
    ket_noi.set_sqlalchemy_uri(uri_bao_cao())
    ket_noi.expose_in_sqllab = False
    ket_noi.allow_dml = False
    db.session.flush()

    ds = {}
    for bang, metric in METRIC.items():
        t = db.session.query(SqlaTable).filter_by(uuid=_uuid(f"dataset-{bang}")).one_or_none()
        if t is None:
            t = SqlaTable(uuid=_uuid(f"dataset-{bang}"), table_name=bang, schema="bao_cao", database=ket_noi)
            db.session.add(t)
            db.session.flush()
        t.fetch_metadata()
        for c in t.columns:
            c.is_dttm = c.column_name in COT_THOI_GIAN
            c.verbose_name = NHAN_COT.get(c.column_name, c.verbose_name)
        t.main_dttm_col = "thang"
        co = {m.metric_name: m for m in t.metrics}
        for ten, (bieu_thuc, nhan, dinh_dang) in metric.items():
            m = co.get(ten) or SqlMetric(metric_name=ten, table=t)
            m.expression, m.verbose_name, m.d3format = bieu_thuc, nhan, dinh_dang
            if ten not in co:
                t.metrics.append(m)
        ds[bang] = t
    db.session.flush()

    vai = sm.find_role(VAI_XEM) or sm.add_role(VAI_XEM)
    for pv in sm.find_role("Gamma").permissions:
        if pv not in vai.permissions:
            vai.permissions.append(pv)
    for t in ds.values():
        pv = sm.add_permission_view_menu("datasource_access", t.get_perm())
        if pv not in vai.permissions:
            vai.permissions.append(pv)

    chart = {}
    for ten, (bang, viz, nhom, metric, them) in CHART.items():
        s = db.session.query(Slice).filter_by(uuid=_uuid(f"chart-{ten}")).one_or_none()
        if s is None:
            s = Slice(uuid=_uuid(f"chart-{ten}"))
            db.session.add(s)
        fd = form_data(ds[bang], viz, nhom, metric, them)
        s.slice_name, s.viz_type, s.datasource_id, s.datasource_type = ten, viz, ds[bang].id, "table"
        s.params = json.dumps(fd, ensure_ascii=False)
        s.query_context = json.dumps(query_context(ds[bang], viz, nhom, metric, fd), ensure_ascii=False)
        chart[ten] = s
    db.session.flush()

    d = db.session.query(Dashboard).filter_by(uuid=_uuid("dashboard")).one_or_none()
    if d is None:
        d = Dashboard(uuid=_uuid("dashboard"))
        db.session.add(d)
    d.dashboard_title, d.slug, d.published = "Hiệu suất một cửa", SLUG, True
    d.slices = list(chart.values())
    d.position_json = json.dumps(bo_cuc_json(chart), ensure_ascii=False)
    d.json_metadata = json.dumps({"refresh_frequency": 0, "color_scheme": "supersetColors",
                                  "cross_filters_enabled": True}, ensure_ascii=False)
    d.roles = [vai]
    db.session.commit()
    print(f"superset-init: báo cáo một cửa: kết nối \"{TEN_KET_NOI}\", {len(ds)} dataset, {len(chart)} chart, "
          f"dashboard /superset/dashboard/{SLUG}/ (vai \"{VAI_XEM}\")", flush=True)


if __name__ == "__main__":
    from superset.app import create_app
    with create_app().app_context():
        dung()

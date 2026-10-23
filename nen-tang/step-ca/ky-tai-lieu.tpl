{{- /* SPDX-FileCopyrightText: 2026 DTU_DZ_2 */ -}}
{{- /* SPDX-License-Identifier: GPL-3.0-or-later */ -}}
{{- /*
  Mẫu chứng thư X.509 của provisioner ký tài liệu (#77), step-ca áp cho mọi chứng thư provisioner
  này cấp. Chỉ dùng để ký tài liệu (PAdES): Key Usage digitalSignature + contentCommitment
  (non-repudiation), không phải CA, không có tên miền (SAN) dù yêu cầu có: chứng thư không dùng
  được cho TLS. Tên chủ thể lấy từ yêu cầu (tên cơ quan, UTF-8), quốc gia VN.
*/ -}}
{
  "subject": {"commonName": {{ toJson .Subject.CommonName }}, "country": "VN"},
  "keyUsage": ["digitalSignature", "contentCommitment"],
  "basicConstraints": {"isCA": false}
}

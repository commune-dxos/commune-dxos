// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Cấu hình lúc chạy (#57). Khi chạy `npm run dev`/`vite preview` tệp này để trống: web dùng biến
// VITE_* lúc build (.env.example). Container mot-cua-web thay tệp này bằng cấu hình sinh từ biến
// môi trường (nginx/default.conf.template, location /cau-hinh.js).
window.__DXOS_CAU_HINH__ = {};

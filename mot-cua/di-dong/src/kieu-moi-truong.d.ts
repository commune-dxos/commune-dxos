// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// `process.env.DXOS_*` được babel.config.js thay bằng chuỗi lúc đóng gói; khai kiểu cho TypeScript.
declare const process: { env: Record<string, string | undefined> };

// Hermes (React Native ≥ 0.74) và Node có sẵn atob/btoa; @types/react-native chưa khai.
declare function atob(duLieu: string): string;
declare function btoa(duLieu: string): string;

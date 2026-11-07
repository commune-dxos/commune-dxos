// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Babel của app di động. Biến môi trường DXOS_* (tệp .env hoặc biến của shell lúc chạy Metro/Gradle)
// được thay thành chuỗi cố định ở chỗ viết `process.env.DXOS_…` (src/cau-hinh/moi-truong.ts), vì app
// React Native không đọc được biến môi trường lúc chạy. Đổi .env xong thì chạy `yarn start --reset-cache`.
const fs = require('fs');
const path = require('path');

function docTepEnv(tep) {
  if (!fs.existsSync(tep)) return {};
  const bien = {};
  for (const dong of fs.readFileSync(tep, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(DXOS_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(dong);
    if (m) bien[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return bien;
}

const BIEN = { ...docTepEnv(path.join(__dirname, '.env')) };
for (const [k, v] of Object.entries(process.env)) {
  if (k.startsWith('DXOS_') && v !== undefined) BIEN[k] = v;
}

function thayBienMoiTruong({ types: t }) {
  return {
    visitor: {
      MemberExpression(p) {
        if (!p.get('object').matchesPattern('process.env')) return;
        const ten = p.node.computed ? p.node.property.value : p.node.property.name;
        if (typeof ten !== 'string' || !ten.startsWith('DXOS_')) return;
        p.replaceWith(ten in BIEN ? t.stringLiteral(BIEN[ten]) : t.identifier('undefined'));
      },
    },
  };
}

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [thayBienMoiTruong],
};

// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.ts'],
  // Bản ESM (.mjs) của lucide không qua babel-jest: Jest dùng bản CommonJS.
  moduleNameMapper: {
    '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|lucide-react-native|react-native-svg)/)',
  ],
};

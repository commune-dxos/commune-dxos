// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// jsdom chưa có ResizeObserver; Radix (RadioGroup của shadcn/ui) cần nó để đo kích thước.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
// jsdom không cuộn trang; form nộp hồ sơ cuộn lên đầu khi sang bước.
window.scrollTo = () => {};

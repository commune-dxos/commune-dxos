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

// Polyfill localStorage & sessionStorage cho Node 22+ & jsdom
const taoKhoLuuTru = () => {
  let kho: Record<string, string> = {};
  return {
    getItem: (khoa: string) => kho[khoa] ?? null,
    setItem: (khoa: string, giaTri: string) => {
      kho[khoa] = String(giaTri);
    },
    removeItem: (khoa: string) => {
      delete kho[khoa];
    },
    clear: () => {
      kho = {};
    },
    key: (i: number) => Object.keys(kho)[i] ?? null,
    get length() {
      return Object.keys(kho).length;
    },
  };
};
const storageMock = taoKhoLuuTru();
Object.defineProperty(globalThis, "localStorage", { value: storageMock, writable: true, configurable: true });
Object.defineProperty(window, "localStorage", { value: storageMock, writable: true, configurable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: storageMock, writable: true, configurable: true });
Object.defineProperty(window, "sessionStorage", { value: storageMock, writable: true, configurable: true });
// jsdom không cuộn trang; form nộp hồ sơ cuộn lên đầu khi sang bước.
window.scrollTo = () => {};
// jsdom chưa có matchMedia; một số thành phần Radix gọi nó.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

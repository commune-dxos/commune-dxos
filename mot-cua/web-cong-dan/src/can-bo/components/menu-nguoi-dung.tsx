// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Người đăng nhập ở đầu trang: chữ viết tắt, họ tên, vai trò, lĩnh vực phụ trách, đăng xuất (đăng xuất
// cả phiên Keycloak, quay về /can-bo).
import { ChevronDown, LogOut } from "lucide-react";
import { useXacThuc } from "@/auth/xac-thuc";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { chuVietTat, tenNguoiDung, useDuLieuCanBo } from "../du-lieu";
import { TEN_VAI_TRO } from "../lib/quyen";

export function MenuNguoiDung() {
  const { nguoiDung, canBo, vaiTro } = useDuLieuCanBo();
  const { dangXuat } = useXacThuc();
  const ten = tenNguoiDung(nguoiDung, canBo);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 px-2" aria-label={`Tài khoản: ${ten}`}>
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary text-sm font-bold text-primary-foreground">{chuVietTat(ten)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-48 flex-col items-start leading-tight lg:flex">
            <span className="truncate text-base font-semibold">{ten}</span>
            <span className="truncate text-sm font-normal text-muted-foreground">{TEN_VAI_TRO[vaiTro]}</span>
          </span>
          <ChevronDown aria-hidden="true" className="hidden size-4 lg:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex flex-col gap-0.5 text-base font-normal">
          <span className="font-semibold">{ten}</span>
          <span className="text-muted-foreground">{canBo?.chuc_vu ?? TEN_VAI_TRO[vaiTro]}</span>
          {canBo && canBo.linh_vuc.length > 0 && (
            <span className="text-muted-foreground">Lĩnh vực: {canBo.linh_vuc.map((l) => l.ten).join(", ")}</span>
          )}
          <span className="text-muted-foreground">Tài khoản: {nguoiDung.profile.preferred_username}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-base" onSelect={() => void dangXuat()}>
          <LogOut aria-hidden="true" />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

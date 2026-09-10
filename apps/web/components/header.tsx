"use client";

import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from "@newsekolah/ui";
import { LogOut, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLogoutMutation } from "../features/auth/api";
import { NotificationBell } from "../features/notifications/components/notification-bell";
import { useSession } from "../lib/session/session-provider";

import { useCommandPalette } from "./command-palette-provider";
import { TenantBrand } from "./tenant-brand";
import { ThemeToggle } from "./theme-toggle";

export function Header(): ReactElement {
  const { me } = useSession();
  const t = useTranslations("app.shell");
  const tPalette = useTranslations("app.shell.commandPalette");
  const commandPalette = useCommandPalette();
  const logoutMutation = useLogoutMutation();
  const router = useRouter();

  async function handleLogout() {
    await logoutMutation.mutateAsync();
    router.replace("/login");
  }

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3 md:hidden">
        <TenantBrand size="sm" />
      </div>
      <button
        type="button"
        onClick={commandPalette.open}
        className="hidden h-9 min-w-64 items-center gap-2 rounded-xs border border-border bg-bg px-3 text-[13px] text-fg-muted md:flex"
      >
        <Search className="size-4" aria-hidden="true" />
        {tPalette("trigger")}
      </button>
      <IconButton
        icon={<Search />}
        aria-label={tPalette("trigger")}
        onClick={commandPalette.open}
        className="md:hidden"
      />
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("profileMenu.label")}
              className="ml-1 flex size-11 items-center justify-center rounded-full md:size-8"
            >
              <Avatar name={me?.name ?? "?"} src={me?.avatar_url} size="sm" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2">
                <UserRound className="size-4" aria-hidden="true" />
                {t("profileMenu.profile")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void handleLogout()}
              className="flex items-center gap-2"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {t("profileMenu.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

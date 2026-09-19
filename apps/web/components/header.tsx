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
import { LogOut, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useSyncExternalStore } from "react";

import { useLogoutMutation } from "../features/auth/api";
import { NotificationBell } from "../features/notifications/components/notification-bell";
import { filterNavigation, navigation } from "../lib/navigation";
import { useSession } from "../lib/session/session-provider";

import { useCommandPalette } from "./command-palette-provider";
import { TenantBrand } from "./tenant-brand";
import { ThemeToggle } from "./theme-toggle";

/**
 * The command palette answers to a keyboard shortcut that the trigger
 * never mentioned, so nobody found it. Which key depends on the platform,
 * and the server cannot know that, so it renders after mount rather than
 * guessing and correcting itself.
 */
const NO_SHORTCUT_SUBSCRIBE = () => () => undefined;

function readShortcutHint(): string {
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? "\u2318K" : "Ctrl K";
}

function useShortcutHint(): string | null {
  // The server has no platform to read, so it renders nothing and the
  // client fills it in on its first paint. useSyncExternalStore is how
  // React wants that told apart, rather than correcting state in an
  // effect after the fact.
  return useSyncExternalStore(NO_SHORTCUT_SUBSCRIBE, readShortcutHint, () => null);
}

export function Header(): ReactElement {
  const { me } = useSession();
  const t = useTranslations("app.shell");
  const tNav = useTranslations();
  const accountItems = filterNavigation(
    navigation,
    (permission) => me?.permissions.includes(permission) ?? false,
    me?.profile_kind,
  ).filter((item) => item.accountMenu);
  const tPalette = useTranslations("app.shell.commandPalette");
  const commandPalette = useCommandPalette();
  const shortcutHint = useShortcutHint();
  const logoutMutation = useLogoutMutation();
  const router = useRouter();

  async function handleLogout() {
    await logoutMutation.mutateAsync();
    router.replace("/login");
  }

  return (
    <header className="flex h-14 items-center gap-2 border-b border-border bg-surface px-4 md:gap-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3 md:hidden">
        <TenantBrand size="sm" />
      </div>
      {/*
        Grows with the window instead of sitting at a fixed width with a
        gulf of empty bar beside it, and carries its own keyboard shortcut
        so the palette is findable without being told about it.
      */}
      <button
        type="button"
        onClick={commandPalette.open}
        aria-keyshortcuts="Meta+K Control+K"
        className="hidden h-9 w-full max-w-md items-center gap-2 rounded-xs border border-border bg-bg px-3 text-[13px] text-fg-muted transition-colors hover:border-fg-muted/40 md:flex"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{tPalette("trigger")}</span>
        {shortcutHint && (
          <kbd className="ml-auto shrink-0 rounded-xs border border-border px-1.5 py-0.5 text-[11px] font-medium text-fg-muted">
            {shortcutHint}
          </kbd>
        )}
      </button>
      <div className="hidden flex-1 md:block" />
      <IconButton
        icon={<Search />}
        aria-label={tPalette("trigger")}
        onClick={commandPalette.open}
        className="md:hidden"
      />
      {/*
        A thin rule separates the two tools from the account: three
        unlabelled circles in a row read as one control otherwise.
      */}
      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle />
        <NotificationBell />
        <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-border md:block" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("profileMenu.label")}
              className="flex size-11 items-center justify-center rounded-full md:size-8"
            >
              <Avatar name={me?.name ?? "?"} src={me?.avatar_url} size="sm" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {accountItems.map((item) => (
              <DropdownMenuItem key={item.key} asChild>
                <Link href={item.href} className="flex items-center gap-2">
                  <item.icon className="size-4" aria-hidden="true" />
                  {tNav(item.labelKey)}
                </Link>
              </DropdownMenuItem>
            ))}
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

"use client";

import { IconButton, Kbd, cn } from "@newsekolah/ui";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { NotificationBell } from "../features/notifications/components/notification-bell";

import { AccountMenu } from "./account-menu";
import { useCommandPalette } from "./command-palette-provider";
import { RoleTestingSwitcher } from "./role-testing-switcher";
import { TenantBrand } from "./tenant-brand";

/**
 * The command palette answers to a keyboard shortcut that the trigger
 * never mentioned, so nobody found it. Which key depends on the platform,
 * and the server cannot know that, so it renders after mount rather than
 * guessing and correcting itself.
 */
const NO_SHORTCUT_SUBSCRIBE = () => () => undefined;

function readModifierKey(): string {
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";
}

function useModifierKey(): string | null {
  return useSyncExternalStore(NO_SHORTCUT_SUBSCRIBE, readModifierKey, () => null);
}

/** True once the page has scrolled under the header, so a phone header can show its edge only then. */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => {
      setScrolled(window.scrollY > 4);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
    };
  }, []);
  return scrolled;
}

/**
 * The bar above every screen. Desktop: a search field that opens the
 * command palette (with its shortcut), then the tester tools when they
 * apply, notifications, and the account menu. Phone (after the artboard):
 * the school's mark and name, then search, notifications and the account
 * as 44px round buttons; the bar takes the page colour and shows its edge
 * only once content scrolls under it. Theme moved into the account menu.
 */
export function Header(): ReactElement {
  const tPalette = useTranslations("app.shell.palette");
  const commandPalette = useCommandPalette();
  const modifier = useModifierKey();
  const scrolled = useScrolled();

  return (
    <header
      className={cn(
        "flex h-14 items-center gap-2 border-b px-4 transition-colors md:gap-4 md:px-6",
        "bg-bg md:border-line md:bg-surface",
        scrolled ? "border-line" : "border-transparent",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center md:hidden">
        <TenantBrand />
      </div>
      {/*
        Reads as a field rather than a button: a sunken box with the
        placeholder and the shortcut, growing with the window up to a
        comfortable measure.
      */}
      <button
        type="button"
        onClick={commandPalette.open}
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(
          "hidden h-9 w-full max-w-[26rem] items-center gap-2.5 rounded-md border border-border bg-surface-sunken pr-1.5 pl-3 md:flex",
          "text-body-sm text-fg-muted outline-none transition-colors hover:border-border-strong hover:text-fg",
        )}
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-left">{tPalette("placeholder")}</span>
        {modifier && (
          <span aria-hidden="true" className="flex shrink-0 items-center gap-0.5">
            <Kbd>{modifier}</Kbd>
            <Kbd>K</Kbd>
          </span>
        )}
      </button>
      <div className="hidden flex-1 md:block" />
      <div className="flex shrink-0 items-center gap-2 md:gap-1">
        <RoleTestingSwitcher />
        <IconButton
          icon={<Search />}
          aria-label={tPalette("placeholder")}
          tooltip={false}
          variant="surface"
          size="lg"
          onClick={commandPalette.open}
          className="md:hidden"
        />
        <NotificationBell />
        <span aria-hidden="true" className="mx-2 hidden h-6 w-px bg-line md:block" />
        <AccountMenu />
      </div>
    </header>
  );
}

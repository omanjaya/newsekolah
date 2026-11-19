"use client";

import { IconButton, Kbd, Skeleton, cn, useCollapsedTitle } from "@newsekolah/ui";
import { Search } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { NotificationBell } from "../features/notifications/components/notification-bell";
import { useTenant } from "../lib/tenant/tenant-provider";

import { AccountMenu } from "./account-menu";
import { useCommandPalette } from "./command-palette-provider";
import { RoleTestingSwitcher } from "./role-testing-switcher";
import { SchoolMark } from "./school-mark";

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
 * The phone header's left side: the school's mark, then its name (the
 * short name when the school set one), which
 * gives way to the page's title once the page's large title has scrolled
 * away under the header (PageHeader publishes that, `useCollapsedTitle`).
 * The two share one grid cell, so the swap never moves anything: the name
 * slides up and fades out as the title slides up and fades in, 200ms.
 * The title repeats the page's h1, so it is hidden from assistive
 * technology.
 */
function PhoneBrand(): ReactElement {
  const { displayName, shortName, isLoading } = useTenant();
  const { title, collapsed } = useCollapsedTitle();
  const showTitle = collapsed && title !== null;
  const swap = "min-w-0 truncate transition-[opacity,translate] duration-base ease-standard";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 md:hidden">
      <SchoolMark size={32} />
      <div className="grid min-w-0 flex-1 items-center *:col-start-1 *:row-start-1">
        {isLoading ? (
          <Skeleton className="h-4 w-24" />
        ) : (
          <span
            className={cn(
              swap,
              "font-heading text-body font-bold tracking-tight text-fg",
              showTitle && "-translate-y-1.5 opacity-0",
            )}
          >
            {/* About 17 characters fit beside the three buttons, so the
                school's short name goes here when it set one; truncation
                is the last resort for one that did not. */}
            {shortName ?? displayName}
          </span>
        )}
        <span
          aria-hidden="true"
          data-compact-title=""
          className={cn(
            swap,
            "text-heading text-fg",
            showTitle
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-1.5 opacity-0",
          )}
        >
          {title}
        </span>
      </div>
    </div>
  );
}

/**
 * The bar above every screen. Desktop: a search field that opens the
 * command palette (with its shortcut), then the tester tools when they
 * apply, notifications, and the account menu. Phone (after the artboard):
 * the school's mark and name, then search, notifications and the account
 * as 44px round buttons; the bar takes the page colour and shows its edge
 * only once content scrolls under it, and the page's title takes the
 * school name's place once the page's own title has scrolled away. In an
 * installed app the bar reaches up under the status bar (safe-area inset).
 * Theme moved into the account menu.
 */
export function Header(): ReactElement {
  const commandPalette = useCommandPalette();
  const modifier = useModifierKey();
  const scrolled = useScrolled();

  return (
    <header
      className={cn(
        "flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)] transition-colors md:gap-4 md:px-6",
        "bg-bg md:border-line md:bg-surface",
        scrolled ? "border-line" : "border-transparent",
      )}
    >
      <PhoneBrand />
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
          "text-body-sm text-fg-muted transition-colors hover:border-border-strong hover:text-fg",
        )}
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-left">{commandPalette.placeholder}</span>
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
          aria-label={commandPalette.placeholder}
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

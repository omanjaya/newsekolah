"use client";

import { IconButton } from "@newsekolah/ui";
import { X } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useSyncExternalStore, type ReactElement, type ReactNode } from "react";

import { businessNow, useSimulation } from "../lib/simulation/clock";

import { TenantBrand } from "./tenant-brand";

/** A minute key that changes the moment the school clock turns over, checked each second. */
function subscribeToSeconds(listener: () => void): () => void {
  const timer = window.setInterval(listener, 1000);
  return () => {
    window.clearInterval(timer);
  };
}

function minuteNow(): number {
  return Math.floor(businessNow().getTime() / 60_000);
}

/**
 * The school's time, to the minute, in the school's zone; follows the
 * simulated clock when a tester has one set. Null on the server, so the
 * first paint never shows a time that the client would then correct.
 */
function useSchoolMinute(): Date | null {
  useSimulation();
  const minute = useSyncExternalStore(subscribeToSeconds, minuteNow, () => null);
  return minute === null ? null : businessNow();
}

function formatLocale(locale: string): string {
  return locale === "en" ? "en-GB" : "id-ID";
}

export interface KioskShellProps {
  /** The screen's name, beside the school's ("Monitor presensi"). */
  title?: string;
  /** Where "leave kiosk mode" goes: the page the kiosk was opened from. */
  exitHref: string;
  /** The school's IANA time zone for the clock (`me.tenant.timezone`). */
  timeZone?: string;
  children: ReactNode;
}

/**
 * The frame of a screen left running on a wall or a reading-room desk
 * (docs/07-ui-ux.md "Kiosk/monitor"): no sidebar, header or tab bar; the
 * school's brand and the screen's name on the left, a large clock and the
 * date on the right, and one quiet way back for whoever is signed in. The
 * bar is a raised surface with a hairline, so the screen below keeps the
 * full contrast of the page background.
 */
export function KioskShell({ title, exitHref, timeZone, children }: KioskShellProps): ReactElement {
  const t = useTranslations("app.page.kiosk");
  const locale = formatLocale(useLocale());
  const now = useSchoolMinute();
  const time =
    now &&
    new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(now);
  const date =
    now &&
    new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone,
    }).format(now);

  return (
    <div data-kiosk-shell="" className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="flex items-center gap-4 border-b border-line bg-surface px-4 py-3 md:gap-6 md:px-6 md:py-4">
        {/* From sm up the screen's name follows the school's after a
            divider. On a phone it sits under the school's name as a
            caption, indented past the 32px mark and its 10px gap
            (TenantBrand), so the screen is still named there. */}
        <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3 md:gap-4">
          <TenantBrand />
          {title && (
            <>
              <span aria-hidden="true" className="hidden h-6 w-px bg-line sm:block" />
              <p className="-mt-1 truncate pl-10.5 text-caption text-fg-muted sm:mt-0 sm:pl-0 sm:text-heading">
                {title}
              </p>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end" aria-label={t("clock")} role="timer">
          {/* Reserves the clock's width before the client knows the time.
              The kiosk display role, read from across the room, from sm
              up; on a phone held in the hand the title-lg role is plenty
              and leaves the school and the screen their names. */}
          <time
            className="min-w-[5ch] text-right text-title-lg tabular-nums sm:text-kiosk-display"
            suppressHydrationWarning
          >
            {time ?? " "}
          </time>
          <span className="text-body-sm text-fg-muted max-sm:hidden" suppressHydrationWarning>
            {date ?? " "}
          </span>
        </div>
        <IconButton
          asChild
          variant="ghost"
          size="md"
          aria-label={t("exit")}
          tooltipSide="bottom"
          className="text-fg-muted hover:text-fg"
          icon={<X />}
        >
          <Link href={exitHref} />
        </IconButton>
      </header>
      <main id="main-content" className="flex flex-1 flex-col animate-enter">
        {children}
      </main>
    </div>
  );
}

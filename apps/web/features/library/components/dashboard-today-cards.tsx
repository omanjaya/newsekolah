"use client";

import { cn } from "@newsekolah/ui";
import { ArrowRight, BookMarked, BookUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * The dashboard's first, unmissable answer to "what do I need to do right
 * now": today's loans, today's returns, and how many books are overdue --
 * each a link straight into the desk instead of a number buried in an
 * 11-item stat grid (docs/07-ui-ux.md: "layar pertama ... menjawab 'apa
 * yang harus saya lakukan sekarang' ... tanpa scroll").
 */
export function DashboardTodayCards({
  loansToday,
  returnsToday,
  overdue,
}: {
  loansToday: number;
  returnsToday: number;
  overdue: number;
}): ReactElement {
  const t = useTranslations("app.library.dashboard.today");

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <TodayCard
        icon={<BookUp aria-hidden="true" />}
        label={t("loansToday")}
        value={loansToday}
        actionLabel={t("openDesk")}
        href="/library/desk"
      />
      <TodayCard
        icon={<BookMarked aria-hidden="true" />}
        label={t("returnsToday")}
        value={returnsToday}
        actionLabel={t("openDesk")}
        href="/library/desk"
      />
      <TodayCard
        icon={<TriangleAlert aria-hidden="true" />}
        label={t("overdue")}
        value={overdue}
        actionLabel={t("followUp")}
        href="/library/desk"
        emphasize={overdue > 0}
      />
    </div>
  );
}

function TodayCard({
  icon,
  label,
  value,
  actionLabel,
  href,
  emphasize = false,
}: {
  icon: ReactElement;
  label: string;
  value: number;
  actionLabel: string;
  href: string;
  emphasize?: boolean;
}): ReactElement {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center justify-between gap-3 rounded-sm border p-4 transition-colors",
        emphasize
          ? "border-status-absent/40 bg-status-absent/5 hover:bg-status-absent/10"
          : "border-border bg-surface hover:bg-bg",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-sm [&>svg]:size-5",
            emphasize ? "bg-status-absent/15 text-status-absent" : "bg-accent/10 text-accent",
          )}
        >
          {icon}
        </span>
        <div className="flex flex-col">
          <span
            className={cn(
              "text-[22px] leading-tight font-semibold tabular-nums",
              emphasize ? "text-status-absent" : "text-fg",
            )}
          >
            {value}
          </span>
          <span className="text-[13px] text-fg-muted">{label}</span>
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-accent">
        {actionLabel}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  type CategoryTone,
  IconCircle,
  List,
  ListRow,
  Stat,
  StatGrid,
  cn,
  domainIcons,
} from "@newsekolah/ui";
import { ArrowUpRight, FileBarChart, MonitorSmartphone, QrCode } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { useCan } from "../../../lib/session/session-provider";
import { useLibraryDashboardQuery } from "../dashboard-api";

import { buildDeskTodayTiles } from "./desk-today-tiles";

interface Shortcut {
  key: string;
  href: string;
  label: string;
  icon: ReactNode;
  /** A topic hue per shortcut, as the home's shortcuts and the tiles above tint theirs. */
  tone: CategoryTone;
  /** Kiosks run on their own screen: they open in a new tab. */
  newTab?: boolean;
}

/**
 * The desk's side column: today's circulation in four quiet figures and
 * the places a librarian reaches from the desk now and then (the two
 * kiosks, the loan rules, the circulation report). Kept beside the scan
 * bar on a wide screen and under the work on a phone, so it never pushes
 * the scan below the fold.
 */
export function DeskTodayPanel({ className }: { className?: string }): ReactElement {
  const t = useTranslations("app.library.desk");
  const dashboard = useLibraryDashboardQuery();
  const canCirculate = useCan("manage_library_circulation");
  const canSettings = useCan("manage_library_settings");
  const canReport = useCan("view_library_reports");
  const tiles = dashboard.data ? buildDeskTodayTiles(dashboard.data.summary) : [];

  const shortcuts: Shortcut[] = [
    ...(canCirculate
      ? [
          {
            key: "kiosk",
            href: "/library/kiosk",
            label: t("shortcuts.kiosk"),
            icon: <MonitorSmartphone />,
            tone: "blue" as const,
            newTab: true,
          },
          {
            key: "visitKiosk",
            href: "/library/visit-kiosk",
            label: t("shortcuts.visitKiosk"),
            icon: <QrCode />,
            tone: "purple" as const,
            newTab: true,
          },
        ]
      : []),
    ...(canSettings
      ? [
          {
            key: "loanRules",
            href: "/library/settings?section=loanRules",
            label: t("shortcuts.loanRules"),
            icon: <domainIcons.settings />,
            tone: "amber" as const,
          },
        ]
      : []),
    ...(canReport
      ? [
          {
            key: "report",
            href: "/library/reports?tab=loans",
            label: t("shortcuts.report"),
            icon: <FileBarChart />,
            tone: "green" as const,
          },
        ]
      : []),
  ];

  return (
    <div className={cn("flex flex-col gap-4", className)} data-testid="desk-aside">
      {(dashboard.isLoading || tiles.length > 0) && (
        <Card padding="md">
          <CardHeader>
            <CardTitle as="h2">{t("today.heading")}</CardTitle>
          </CardHeader>
          <StatGrid className="gap-x-4 gap-y-5 lg:grid-cols-2" data-testid="desk-tiles">
            {(dashboard.isLoading ? PLACEHOLDER_TILES : tiles).map((tile) => (
              <Stat
                key={tile.key}
                data-testid={`desk-tile-${tile.key}`}
                icon={<tile.icon />}
                category={tile.tone}
                value={tile.value}
                label={t(`tiles.${tile.labelKey}`)}
                loading={dashboard.isLoading}
                href={tile.key === "overdue" ? "#desk-overdue" : undefined}
              />
            ))}
          </StatGrid>
        </Card>
      )}
      {shortcuts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("shortcuts.heading")}</CardTitle>
          </CardHeader>
          <List>
            {shortcuts.map((shortcut) => (
              <ListRow
                key={shortcut.key}
                leading={
                  <IconCircle tone={shortcut.tone} size="sm">
                    {shortcut.icon}
                  </IconCircle>
                }
                title={
                  <>
                    {shortcut.label}
                    {shortcut.newTab && <span className="sr-only"> ({t("shortcuts.newTab")})</span>}
                  </>
                }
                {...(shortcut.newTab
                  ? {
                      onClick: () => {
                        window.open(shortcut.href, "_blank", "noopener,noreferrer");
                      },
                      trailing: (
                        <ArrowUpRight className="size-4 text-fg-muted" aria-hidden="true" />
                      ),
                      chevron: false,
                    }
                  : { href: shortcut.href })}
              />
            ))}
          </List>
        </Card>
      )}
    </div>
  );
}

const PLACEHOLDER_TILES = buildDeskTodayTiles({
  loans_today: 0,
  returns_today: 0,
  overdue: 0,
  visits_today: 0,
});

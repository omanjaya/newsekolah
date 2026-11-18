"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  HeroCard,
  IconCircle,
  List,
  ListRow,
  Skeleton,
  SkeletonList,
} from "@newsekolah/ui";
import { FileWarning, ShieldAlert, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useSession } from "../../../lib/session/session-provider";
import { useMyDisciplineQuery } from "../api";

import { PointsMeter, nextLevel } from "./points-meter";

/**
 * A student's own discipline record, phone first: the points against the
 * school's warning-letter thresholds always in view (also when the record
 * is clean, so the rules are known), then any letters, then the history.
 * Plain and factual, no verdict beyond what the ledger itself carries.
 */
export function MyDisciplineView(): ReactElement {
  const t = useTranslations("app.discipline.myDiscipline");
  const tNav = useTranslations("app.shell.nav.items");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  const { data, isLoading, error, refetch } = useMyDisciplineQuery();
  const records = (data?.records ?? []).filter((r) => !r.is_voided);
  const letters = data?.letters ?? [];

  if (isLoading) {
    return (
      <AppPage variant="narrow" title={tNav("myDiscipline")}>
        <Skeleton className="h-52 w-full rounded-xl" />
        <SkeletonList rows={3} leading framed />
      </AppPage>
    );
  }
  if (error || !data) {
    return (
      <AppPage variant="narrow" title={tNav("myDiscipline")}>
        <QueryError retry={() => refetch()} error={error} />
      </AppPage>
    );
  }

  const total = data.total_points;
  const next = nextLevel(total, data.policy.levels);
  const crossedAny = data.first_crossed.length > 0;
  const clean = records.length === 0 && letters.length === 0;

  return (
    <AppPage variant="narrow" title={tNav("myDiscipline")}>
      <HeroCard
        tone={crossedAny ? "warning" : "accent-soft"}
        eyebrow={t("heroEyebrow")}
        title={t("points", { points: total })}
        meta={
          clean
            ? t("clean")
            : next
              ? t("toNext", { points: next.min_points - total, level: next.label })
              : t("pastAll")
        }
      >
        <Card padding="sm" className="mt-3 text-fg">
          <PointsMeter total={total} levels={data.policy.levels} crossings={data.first_crossed} />
        </Card>
      </HeroCard>

      {letters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("letters")}</CardTitle>
          </CardHeader>
          <List>
            {letters.map((letter) => (
              <ListRow
                key={letter.id}
                leading={
                  <IconCircle tone="warning">
                    <FileWarning />
                  </IconCircle>
                }
                title={letter.level_label}
                titleLines={2}
                meta={`${letter.letter_number} · ${formatDate(letter.issued_at, { locale, timeZone })}`}
              />
            ))}
          </List>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("records")}</CardTitle>
        </CardHeader>
        {records.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck aria-hidden="true" />}
            tone="success"
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        ) : (
          <List>
            {records.map((record) => (
              <ListRow
                key={record.id}
                leading={
                  <IconCircle tone="neutral">
                    <ShieldAlert />
                  </IconCircle>
                }
                title={record.type_name}
                titleLines={2}
                meta={formatDate(record.occurred_on, { locale, timeZone: "UTC" })}
                trailing={
                  <span className="text-label text-fg tabular-nums">
                    {t("recordPoints", { points: record.points })}
                  </span>
                }
              />
            ))}
          </List>
        )}
      </Card>
    </AppPage>
  );
}

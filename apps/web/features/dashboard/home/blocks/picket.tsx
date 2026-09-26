"use client";

import { Card, CardHeader, CardTitle, Skeleton } from "@newsekolah/ui";
import { AlarmClock, DoorOpen } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../../components/query-error";
import {
  type ExitPermitSummary,
  type LateArrivalSummary,
  useExitPermitReviewQueueQuery,
  useLateArrivalQueueQuery,
} from "../../../permits/api";
import { EMPTY_BLOCK, HERO_PRIORITY } from "../types";
import type { Me, PersonaBlock } from "../types";

const DUTY_SCAN_HREF = "/duty";
const LATE_ARRIVALS_HREF = "/late-arrivals";
const EXIT_PERMITS_HREF = "/exit-permits";
const QUEUE_PREVIEW_SIZE = 5;

/** The duty teacher's home block: today's late-arrival gate queue and the exit-permit review queue. */
export function usePicketBlock(_me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardDuty");
  const late = useLateArrivalQueueQuery(active);
  const exit = useExitPermitReviewQueueQuery(active);

  if (!active) return EMPTY_BLOCK;

  const block: PersonaBlock = { tiles: [], left: [], right: [] };

  const lateItems = !late.isLoading && !late.isError ? (late.data?.data ?? []) : undefined;
  const exitItems = !exit.isLoading && !exit.isError ? (exit.data?.data ?? []) : undefined;

  if (lateItems) {
    block.tiles.push({
      key: "picket.late",
      priority: 88,
      label: t("picket.tileLateLabel"),
      value: String(lateItems.length),
      icon: AlarmClock,
      tone: "amber",
      href: LATE_ARRIVALS_HREF,
    });
    if (lateItems.length > 0) {
      block.hero = {
        key: "picket.late",
        priority: HERO_PRIORITY.picketQueue,
        eyebrow: t("picket.heroEyebrow"),
        title: t("picket.heroTitle", { count: lateItems.length }),
        action: { label: t("picket.heroAction"), href: DUTY_SCAN_HREF },
      };
    }
  }

  if (exitItems) {
    block.tiles.push({
      key: "picket.exit",
      priority: 86,
      label: t("picket.tileExitLabel"),
      value: String(exitItems.length),
      icon: DoorOpen,
      tone: "blue",
      href: EXIT_PERMITS_HREF,
    });
  }

  block.left.push({
    key: "picket.queue",
    node: (
      <PicketQueueCard
        key="picket.queue"
        late={late}
        exit={exit}
        lateItems={lateItems}
        exitItems={exitItems}
      />
    ),
  });

  return block;
}

function PicketQueueCard({
  late,
  exit,
  lateItems,
  exitItems,
}: {
  late: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  exit: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  lateItems: LateArrivalSummary[] | undefined;
  exitItems: ExitPermitSummary[] | undefined;
}): ReactElement {
  const t = useTranslations("app.dashboardDuty");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("picket.cardTitle")}</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-5 px-5 pb-5">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[13px] font-medium text-fg">{t("picket.lateSectionTitle")}</h4>
            <Link href={LATE_ARRIVALS_HREF} className="text-[12px] text-accent hover:underline">
              {t("picket.seeAll")}
            </Link>
          </div>
          {late.isLoading ? (
            <Skeleton className="h-16 w-full" aria-busy="true" />
          ) : late.isError ? (
            <QueryError retry={late.refetch} />
          ) : lateItems?.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("picket.lateEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(lateItems ?? []).slice(0, QUEUE_PREVIEW_SIZE).map((item) => (
                <li
                  key={item.instance_id}
                  className="flex items-center justify-between gap-2 text-[13px] text-fg"
                >
                  <span className="truncate">{item.reason}</span>
                  <span className="shrink-0 text-fg-muted">#{item.occurrence_number}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[13px] font-medium text-fg">{t("picket.exitSectionTitle")}</h4>
            <Link href={EXIT_PERMITS_HREF} className="text-[12px] text-accent hover:underline">
              {t("picket.seeAll")}
            </Link>
          </div>
          {exit.isLoading ? (
            <Skeleton className="h-16 w-full" aria-busy="true" />
          ) : exit.isError ? (
            <QueryError retry={exit.refetch} />
          ) : exitItems?.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("picket.exitEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(exitItems ?? []).slice(0, QUEUE_PREVIEW_SIZE).map((item) => (
                <li
                  key={item.instance_id}
                  className="flex items-center justify-between gap-2 text-[13px] text-fg"
                >
                  <span className="truncate">{item.student_name ?? "-"}</span>
                  <span className="shrink-0 text-fg-muted">{item.destination}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Card>
  );
}

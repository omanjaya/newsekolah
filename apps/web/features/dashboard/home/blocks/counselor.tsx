"use client";

import { Card, CardHeader, CardTitle, Skeleton } from "@newsekolah/ui";
import { FileClock, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../../components/query-error";
import {
  type SPCandidate,
  type SPCandidateFilters,
  useSPCandidatesQuery,
} from "../../../discipline/api";
import { type LeaveRequestSummary, useLeaveReviewQueueQuery } from "../../../permits/api";
import { EMPTY_BLOCK, HERO_PRIORITY } from "../types";
import type { Me, PersonaBlock } from "../types";

const LEAVE_REQUESTS_HREF = "/leave-requests";
const WARNING_LETTERS_HREF = "/discipline/warning-letters";
const QUEUE_PREVIEW_SIZE = 5;

const SP_CANDIDATE_FILTERS: SPCandidateFilters = {
  classId: "",
  level: "",
  search: "",
  limit: QUEUE_PREVIEW_SIZE,
  offset: 0,
};

/** The counselor's home block: leave requests at the counseling stage, and warning-letter (SP) candidates. */
export function useCounselorBlock(me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardDuty");
  const canReviewLeave = me.permissions.includes("review_leave_requests");
  const canIssueWarningLetters = me.permissions.includes("issue_warning_letters");
  const leave = useLeaveReviewQueueQuery(active && canReviewLeave);
  const sp = useSPCandidatesQuery(SP_CANDIDATE_FILTERS, active && canIssueWarningLetters);

  if (!active) return EMPTY_BLOCK;

  const block: PersonaBlock = { tiles: [], left: [], right: [] };

  const leaveItems =
    canReviewLeave && !leave.isLoading && !leave.isError ? (leave.data?.data ?? []) : undefined;
  const spItems =
    canIssueWarningLetters && !sp.isLoading && !sp.isError ? (sp.data?.data ?? []) : undefined;

  if (canReviewLeave && leaveItems) {
    block.tiles.push({
      key: "counselor.leave",
      priority: 84,
      label: t("counselor.tileLeaveLabel"),
      value: String(leaveItems.length),
      icon: FileClock,
      tone: "amber",
      href: LEAVE_REQUESTS_HREF,
    });
    if (leaveItems.length > 0) {
      block.hero = {
        key: "counselor.leave",
        priority: HERO_PRIORITY.leaveQueue,
        eyebrow: t("counselor.heroEyebrow"),
        title: t("counselor.heroTitle", { count: leaveItems.length }),
        action: { label: t("counselor.heroAction"), href: LEAVE_REQUESTS_HREF },
      };
    }
  }

  if (canIssueWarningLetters && spItems) {
    block.tiles.push({
      key: "counselor.sp",
      priority: 60,
      label: t("counselor.tileSpLabel"),
      value: String(spItems.length),
      icon: ShieldAlert,
      tone: "red",
      href: WARNING_LETTERS_HREF,
    });
  }

  // Neither queue is any of this counselor's business without at least one
  // of the two permissions -- an empty card saying so would just be noise.
  if (canReviewLeave || canIssueWarningLetters) {
    block.left.push({
      key: "counselor.queue",
      node: (
        <CounselorQueueCard
          key="counselor.queue"
          leave={leave}
          sp={sp}
          leaveItems={leaveItems}
          spItems={spItems}
          showLeave={canReviewLeave}
          showSp={canIssueWarningLetters}
        />
      ),
    });
  }

  return block;
}

function CounselorQueueCard({
  leave,
  sp,
  leaveItems,
  spItems,
  showLeave,
  showSp,
}: {
  leave: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  sp: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  leaveItems: LeaveRequestSummary[] | undefined;
  spItems: SPCandidate[] | undefined;
  showLeave: boolean;
  showSp: boolean;
}): ReactElement {
  const t = useTranslations("app.dashboardDuty");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("counselor.cardTitle")}</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-5 px-5 pb-5">
        {showLeave && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[13px] font-medium text-fg">
                {t("counselor.leaveSectionTitle")}
              </h4>
              <Link href={LEAVE_REQUESTS_HREF} className="text-[12px] text-accent hover:underline">
                {t("counselor.seeAll")}
              </Link>
            </div>
            {leave.isLoading ? (
              <Skeleton className="h-16 w-full" aria-busy="true" />
            ) : leave.isError ? (
              <QueryError retry={leave.refetch} />
            ) : leaveItems?.length === 0 ? (
              <p className="text-[13px] text-fg-muted">{t("counselor.leaveEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {(leaveItems ?? []).slice(0, QUEUE_PREVIEW_SIZE).map((item) => (
                  <li
                    key={item.instance_id}
                    className="flex items-center justify-between gap-2 text-[13px] text-fg"
                  >
                    <span className="truncate">
                      {item.student_name} · {item.class_name}
                    </span>
                    <Link
                      href={`${LEAVE_REQUESTS_HREF}/${item.instance_id}`}
                      className="shrink-0 text-accent hover:underline"
                    >
                      {t("counselor.review")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {showSp && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[13px] font-medium text-fg">{t("counselor.spSectionTitle")}</h4>
              <Link href={WARNING_LETTERS_HREF} className="text-[12px] text-accent hover:underline">
                {t("counselor.seeAll")}
              </Link>
            </div>
            {sp.isLoading ? (
              <Skeleton className="h-16 w-full" aria-busy="true" />
            ) : sp.isError ? (
              <QueryError retry={sp.refetch} />
            ) : spItems?.length === 0 ? (
              <p className="text-[13px] text-fg-muted">{t("counselor.spEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {(spItems ?? []).slice(0, QUEUE_PREVIEW_SIZE).map((item) => (
                  <li
                    key={item.student_user_id}
                    className="flex items-center justify-between gap-2 text-[13px] text-fg"
                  >
                    <span className="truncate">
                      {item.student_name} · {item.class_name}
                    </span>
                    <span className="shrink-0 tabular-nums text-fg-muted">{item.total_points}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Card>
  );
}

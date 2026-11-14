"use client";

import type { components } from "@newsekolah/api-client";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  SectionHeader,
  SkeletonList,
  TextLink,
} from "@newsekolah/ui";
import { CheckCheck, FileClock, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { QueryError } from "../../../../components/query-error";
import { isModuleEnabled } from "../../../../lib/modules/feature-modules";
import { useAtRiskStudentsQuery } from "../../../analytics/api";
import { RiskLevelBadge } from "../../../analytics/components/risk-level-badge";
import {
  type SPCandidate,
  type SPCandidateFilters,
  useSPCandidatesQuery,
} from "../../../discipline/api";
import { type LeaveRequestSummary, useLeaveReviewQueueQuery } from "../../../permits/api";
import {
  type ClassRef,
  type DirectoryUser,
  useClassesQuery,
  useLookup,
} from "../../../reference/api";
import { useDirectoryNames } from "../../../reference/directory-names";
import { EMPTY_BLOCK, HERO_PRIORITY } from "../types";
import type { Me, PersonaBlock } from "../types";

type StudentRisk = components["schemas"]["StudentRisk"];

const LEAVE_REQUESTS_HREF = "/leave-requests";
const WARNING_LETTERS_HREF = "/discipline/warning-letters";
const COUNSELING_HREF = "/discipline/counseling";
const ANALYTICS_HREF = "/analytics";
const QUEUE_PREVIEW_SIZE = 5;
const AT_RISK_PREVIEW_SIZE = 3;
/** A list inside a section of the card lines its rows up with the card header's 20px inset. */
const SECTION_LIST_INSET = "[--list-inset:var(--space-5)]";

const SP_CANDIDATE_FILTERS: SPCandidateFilters = {
  classId: "",
  level: "",
  search: "",
  limit: QUEUE_PREVIEW_SIZE,
  offset: 0,
};

interface QueueState {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * The counselor's home block: leave requests at the counseling stage and
 * warning-letter (SP) candidates as the task card, the students flagged by
 * the early-warning roster beside it, and a calm hero when the counseling
 * queue is empty.
 */
export function useCounselorBlock(me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardDuty");
  // Leave requests belong to permits and warning letters to discipline; a
  // school that switched either off gets neither the query nor the section.
  const canReviewLeave =
    me.permissions.includes("review_leave_requests") && isModuleEnabled(me, "permits");
  const canIssueWarningLetters =
    me.permissions.includes("issue_warning_letters") && isModuleEnabled(me, "discipline");
  const leave = useLeaveReviewQueueQuery(active && canReviewLeave);
  const sp = useSPCandidatesQuery(SP_CANDIDATE_FILTERS, active && canIssueWarningLetters);
  const canViewAtRisk = me.permissions.includes("view_early_warning");
  const atRisk = useAtRiskStudentsQuery(active && canViewAtRisk);
  const classes = useClassesQuery(active && canViewAtRisk);
  // The roster endpoint also returns students whose level is "none" (safe);
  // only the ones who actually need attention belong on this card.
  const flagged = (atRisk.data?.data ?? []).filter((row) => row.level !== "none");
  const studentMap = useDirectoryNames(
    [...flagged]
      .sort((a, b) => b.score - a.score)
      .slice(0, AT_RISK_PREVIEW_SIZE)
      .map((row) => row.student_user_id),
    active && canViewAtRisk,
  );
  const classMap = useLookup(classes.data?.data);

  if (!active) return EMPTY_BLOCK;

  const block: PersonaBlock = {
    tiles: [],
    main: [],
    side: [],
    pending: (canReviewLeave && leave.isLoading) || (canIssueWarningLetters && sp.isLoading),
  };

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
        meta: t("counselor.heroMeta"),
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

  // Nothing waits at the counseling stage: the counselor's own daily work
  // (counseling notes) is the way forward.
  const queuesSettled =
    (!canReviewLeave || leaveItems !== undefined) &&
    (!canIssueWarningLetters || spItems !== undefined);
  if (!block.hero && queuesSettled) {
    block.hero = {
      key: "counselor.idle",
      priority: HERO_PRIORITY.counselorIdle,
      tone: "neutral",
      eyebrow: t("counselor.heroEyebrow"),
      title: t("counselor.idleTitle"),
      meta:
        spItems && spItems.length > 0
          ? t("counselor.idleMetaSp", { count: spItems.length })
          : t("counselor.idleMeta"),
      action:
        spItems && spItems.length > 0
          ? { label: t("counselor.spAction"), href: WARNING_LETTERS_HREF }
          : { label: t("counselor.idleAction"), href: COUNSELING_HREF },
    };
  }

  // Neither queue is any of this counselor's business without at least one
  // of the two permissions -- an empty card saying so would just be noise.
  if (canReviewLeave || canIssueWarningLetters) {
    block.main.push({
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

  if (canViewAtRisk) {
    block.side.push({
      key: "counselor.atRisk",
      node: (
        <AtRiskCard
          key="counselor.atRisk"
          isLoading={atRisk.isLoading}
          error={atRisk.isError ? atRisk.error : null}
          refetch={atRisk.refetch}
          total={flagged.length}
          rows={[...flagged].sort((a, b) => b.score - a.score).slice(0, AT_RISK_PREVIEW_SIZE)}
          studentMap={studentMap}
          classMap={classMap}
        />
      ),
    });
  }

  return block;
}

function AtRiskCard({
  isLoading,
  error,
  refetch,
  total,
  rows,
  studentMap,
  classMap,
}: {
  isLoading: boolean;
  error: unknown;
  refetch: () => unknown;
  total: number;
  rows: StudentRisk[];
  studentMap: Map<string, DirectoryUser>;
  classMap: Map<string, ClassRef>;
}): ReactElement {
  const t = useTranslations("app.dashboardDuty.counselor.atRisk");
  const levelLabel = useTranslations("app.analytics.level");
  return (
    <Card>
      <CardHeader action={<TextLink href={ANALYTICS_HREF}>{t("viewAll")}</TextLink>}>
        <CardTitle as="h2">{t("title")}</CardTitle>
        {!isLoading && !error && rows.length > 0 && (
          <CardDescription>{t("count", { count: total })}</CardDescription>
        )}
      </CardHeader>
      {error ? (
        <div className="px-5 pb-5">
          <QueryError retry={refetch} error={error} />
        </div>
      ) : isLoading ? (
        <div className="px-5 pb-5">
          <SkeletonList rows={3} framed={false} />
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState variant="compact" icon={<ShieldCheck />} title={t("empty")} />
        </div>
      ) : (
        <List>
          {rows.map((row) => (
            <ListRow
              key={row.student_user_id}
              href={`${ANALYTICS_HREF}/${row.student_user_id}`}
              title={studentMap.get(row.student_user_id)?.name ?? t("unknownStudent")}
              meta={classMap.get(row.class_id)?.name ?? "-"}
              trailing={<RiskLevelBadge level={row.level} label={levelLabel(row.level)} />}
            />
          ))}
        </List>
      )}
    </Card>
  );
}

/** One titled part of the counseling queue card, with its own "see all" link. */
function QueueSection({
  title,
  href,
  query,
  empty,
  children,
}: {
  title: string;
  href: string;
  query: QueueState;
  empty: string | null;
  children: ReactNode;
}): ReactElement {
  const t = useTranslations("app.dashboardDuty");
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        as="h3"
        title={title}
        className="px-5"
        action={<TextLink href={href}>{t("counselor.seeAll")}</TextLink>}
      />
      {query.isLoading ? (
        <div className="px-5 pt-2">
          <SkeletonList rows={2} framed={false} />
        </div>
      ) : query.isError ? (
        <div className="px-5 pt-2">
          <QueryError retry={query.refetch} error={query.error} />
        </div>
      ) : empty !== null ? (
        <div className="px-5">
          <EmptyState variant="compact" icon={<CheckCheck />} title={empty} />
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function CounselorQueueCard({
  leave,
  sp,
  leaveItems,
  spItems,
  showLeave,
  showSp,
}: {
  leave: QueueState;
  sp: QueueState;
  leaveItems: LeaveRequestSummary[] | undefined;
  spItems: SPCandidate[] | undefined;
  showLeave: boolean;
  showSp: boolean;
}): ReactElement {
  const t = useTranslations("app.dashboardDuty");
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("counselor.cardTitle")}</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-4 pb-3">
        {showLeave && (
          <QueueSection
            title={t("counselor.leaveSectionTitle")}
            href={LEAVE_REQUESTS_HREF}
            query={leave}
            empty={leaveItems?.length === 0 ? t("counselor.leaveEmpty") : null}
          >
            <List className={SECTION_LIST_INSET}>
              {(leaveItems ?? []).slice(0, QUEUE_PREVIEW_SIZE).map((item) => (
                <ListRow
                  key={item.instance_id}
                  href={`${LEAVE_REQUESTS_HREF}/${item.instance_id}`}
                  title={item.student_name}
                  meta={item.class_name}
                  trailing={t("counselor.review")}
                />
              ))}
            </List>
          </QueueSection>
        )}
        {showSp && (
          <QueueSection
            title={t("counselor.spSectionTitle")}
            href={WARNING_LETTERS_HREF}
            query={sp}
            empty={spItems?.length === 0 ? t("counselor.spEmpty") : null}
          >
            <List className={SECTION_LIST_INSET}>
              {(spItems ?? []).slice(0, QUEUE_PREVIEW_SIZE).map((item) => (
                <ListRow
                  key={item.student_user_id}
                  title={item.student_name}
                  meta={item.class_name}
                  trailing={t("counselor.points", { points: item.total_points })}
                />
              ))}
            </List>
          </QueueSection>
        )}
      </div>
    </Card>
  );
}

"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
  useToast,
} from "@newsekolah/ui";
import { Plus, Repeat } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { AcademicWorkspaceLinks } from "../../academic/components/academic-workspace-links";
import {
  useAllPeriodsQuery,
  useClassesQuery,
  useLookup,
  useSubjectsQuery,
} from "../../reference/api";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  type Direction,
  type Substitution,
  useCancelSubstitutionMutation,
  useRespondSubstitutionMutation,
  useSubstitutionsQuery,
} from "../api";

import { RequestForm } from "./request-form";

const STATUS_VARIANT: Record<Substitution["status"], "neutral" | "accent"> = {
  pending: "accent",
  accepted: "accent",
  rejected: "neutral",
  cancelled: "neutral",
};

/** Requests I received (incoming) and requests I sent (outgoing), rendered with the same session-card look as the attendance day list. */
export function SubstitutionsView(): ReactElement {
  const t = useTranslations("app.substitutions");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const [direction, setDirection] = useState<Direction>("incoming");
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useSubstitutionsQuery(direction);
  const respond = useRespondSubstitutionMutation();
  const cancel = useCancelSubstitutionMutation();
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const periods = useAllPeriodsQuery();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const periodMap = useLookup(periods.data?.data);

  const today = todayInZone(me?.tenant.timezone);

  function fail(error: unknown) {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  const items = data?.data ?? [];
  const teacherMap = useDirectoryNames(
    items.map((item) =>
      direction === "incoming" ? item.requester_user_id : item.substitute_user_id,
    ),
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <AcademicWorkspaceLinks area="schedule" />
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setCreating(true);
            }}
          >
            {t("request")}
          </Button>
        }
      />
      <Tabs
        value={direction}
        onValueChange={(v) => {
          setDirection(v as Direction);
        }}
      >
        <TabsList>
          <TabsTrigger value="incoming">{t("incoming")}</TabsTrigger>
          <TabsTrigger value="outgoing">{t("outgoing")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Repeat aria-hidden="true" />}
          title={t("emptyTitle")}
          description={direction === "incoming" ? t("emptyIncomingBody") : t("emptyOutgoingBody")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const other =
              direction === "incoming" ? item.requester_user_id : item.substitute_user_id;
            const className = item.class_id
              ? (classMap.get(item.class_id)?.name ?? undefined)
              : undefined;
            const subjectName = item.subject_id
              ? (subjectMap.get(item.subject_id)?.name ?? undefined)
              : undefined;
            const start = item.start_period_id ? periodMap.get(item.start_period_id) : undefined;
            const end = item.end_period_id ? periodMap.get(item.end_period_id) : undefined;
            const isToday = item.date === today;
            return (
              <li
                key={item.id}
                className={cn(
                  "flex flex-col gap-3 rounded-sm border bg-surface p-4 md:flex-row md:items-center md:justify-between",
                  isToday && item.status === "accepted"
                    ? "border-accent ring-1 ring-accent/40"
                    : "border-border",
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {isToday && <Badge variant="accent">{t("todayBadge")}</Badge>}
                    <span className="text-[15px] font-medium text-fg">
                      {formatDate(item.date, { locale, timeZone: me?.tenant.timezone })}
                    </span>
                    <Badge variant={STATUS_VARIANT[item.status]}>
                      {t(`status.${item.status}`)}
                    </Badge>
                  </div>
                  {(className ?? subjectName) && (
                    <span className="text-[14px] text-fg">
                      {className}
                      {className && subjectName ? " • " : ""}
                      {subjectName}
                      {start && end && (
                        <span className="text-fg-muted">
                          {" "}
                          ({start.name} - {end.name})
                        </span>
                      )}
                    </span>
                  )}
                  <span className="text-[13px] text-fg-muted">
                    {direction === "incoming" ? t("fromTeacher") : t("toTeacher")}:{" "}
                    {teacherMap.get(other)?.name ?? t("unknownTeacher")}
                  </span>
                  {item.requester_note && (
                    <span className="text-[13px] text-fg">{item.requester_note}</span>
                  )}
                  {item.response_note && (
                    <span className="text-[13px] text-fg-muted">
                      {t("responseNote")}: {item.response_note}
                    </span>
                  )}
                </div>
                {item.status === "pending" && (
                  <div className="flex gap-2">
                    {direction === "incoming" ? (
                      <>
                        <Button
                          size="sm"
                          loading={
                            respond.isPending &&
                            respond.variables.id === item.id &&
                            respond.variables.accept
                          }
                          onClick={() => {
                            respond.mutate(
                              { id: item.id, accept: true },
                              {
                                onError: fail,
                                onSuccess: () => {
                                  toast.success(t("accepted"));
                                },
                              },
                            );
                          }}
                        >
                          {t("accept")}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={
                            respond.isPending &&
                            respond.variables.id === item.id &&
                            !respond.variables.accept
                          }
                          onClick={() => {
                            respond.mutate(
                              { id: item.id, accept: false },
                              {
                                onError: fail,
                                onSuccess: () => {
                                  toast.success(t("rejected"));
                                },
                              },
                            );
                          }}
                        >
                          {t("reject")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={cancel.isPending && cancel.variables === item.id}
                        onClick={() => {
                          cancel.mutate(item.id, {
                            onError: fail,
                            onSuccess: () => {
                              toast.success(t("cancelled"));
                            },
                          });
                        }}
                      >
                        {t("cancel")}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("request")}>
          {creating && (
            <RequestForm
              onDone={() => {
                setCreating(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

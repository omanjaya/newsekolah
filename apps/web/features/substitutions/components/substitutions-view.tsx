"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Card,
  CardFooter,
  CardTitle,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  SegmentedControl,
  SemanticStatusBadge,
  SkeletonList,
  Textarea,
  useToast,
  type SemanticStatus,
} from "@newsekolah/ui";
import { Plus, Repeat } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import {
  useAllPeriodsQuery,
  useClassesQuery,
  useLookup,
  useSubjectsQuery,
} from "../../reference/api";
import { useDirectoryNames } from "../../reference/directory-names";
import { clockRange } from "../../schedule/clock-label";
import {
  type Direction,
  type Substitution,
  useCancelSubstitutionMutation,
  useRespondSubstitutionMutation,
  useSubstitutionsQuery,
} from "../api";

import { RequestForm } from "./request-form";

/** A substitution's state in the shared workflow vocabulary, so its colour matches every module. */
const SEMANTIC_STATUS: Record<Substitution["status"], SemanticStatus> = {
  pending: "pending",
  accepted: "approved",
  rejected: "rejected",
  cancelled: "cancelled",
};

/** The pending request a confirmation is open for, with the names its copy needs. */
interface PendingAction {
  item: Substitution;
  teacher: string;
  lesson: string;
}

/**
 * Substitution requests: the ones asking this teacher to stand in ("Untuk
 * saya", with how many still wait on an answer) and the ones they sent
 * ("Dari saya"), as one list of cards. Each card names the lesson, the day
 * and the other teacher, and carries its own answer or cancel action. A
 * schedule manager also gets "Semua": every request in the school, each
 * naming both teachers, to coordinate cover; it opens there when they do
 * not teach themselves.
 */
export function SubstitutionsView(): ReactElement {
  const t = useTranslations("app.substitutions");
  const format = useFormatter();
  const locale = useLocale();
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canSeeAll = useCan("manage_schedules");
  const isTeacher = me?.roles.some((role) => role.slug === "teacher") ?? false;
  const [direction, setDirection] = useState<Direction>(() =>
    canSeeAll && !isTeacher ? "all" : "incoming",
  );
  const [creating, setCreating] = useState(false);
  // Refusing or withdrawing a request cannot be undone, so each asks first.
  const [rejecting, setRejecting] = useState<PendingAction | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [cancelling, setCancelling] = useState<PendingAction | null>(null);
  const incoming = useSubstitutionsQuery("incoming");
  const outgoing = useSubstitutionsQuery("outgoing");
  const all = useSubstitutionsQuery("all", canSeeAll);
  const list = direction === "incoming" ? incoming : direction === "outgoing" ? outgoing : all;
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

  const items = list.data?.data ?? [];
  const pendingIncoming = (incoming.data?.data ?? []).filter((r) => r.status === "pending").length;
  const teacherMap = useDirectoryNames(
    items.flatMap((item) => [item.requester_user_id, item.substitute_user_id]),
  );
  const nameOf = (id: string) => teacherMap.get(id)?.name ?? t("unknownTeacher");

  function openRequest() {
    setCreating(true);
  }

  return (
    <AppPage
      primaryAction={
        <Button icon={<Plus />} onClick={openRequest}>
          {t("request")}
        </Button>
      }
      primaryActionCompact={{ icon: <Plus />, label: t("request"), onSelect: openRequest }}
      toolbar={
        <SegmentedControl<Direction>
          aria-label={t("directionLabel")}
          value={direction}
          onValueChange={setDirection}
          options={[
            {
              value: "incoming",
              label: t("incoming"),
              count: pendingIncoming > 0 ? pendingIncoming : undefined,
            },
            { value: "outgoing", label: t("outgoing") },
            ...(canSeeAll ? [{ value: "all" as const, label: t("all") }] : []),
          ]}
        />
      }
    >
      {list.isLoading ? (
        <SkeletonList rows={3} />
      ) : list.isError ? (
        <QueryError retry={list.refetch} error={list.error} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Repeat aria-hidden="true" />}
          title={t("emptyTitle")}
          description={
            direction === "incoming"
              ? t("emptyIncomingBody")
              : direction === "outgoing"
                ? t("emptyOutgoingBody")
                : t("emptyAllBody")
          }
          // The header carries the primary request. The empty list of one's
          // own requests repeats it quietly; the list of requests to this
          // teacher has nothing to start.
          action={
            direction === "outgoing" ? (
              <Button variant="secondary" icon={<Plus />} onClick={openRequest}>
                {t("request")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            // Only the invited substitute answers and only the requester
            // withdraws; the school-wide list shows the rest read-only.
            const canAnswer = item.substitute_user_id === me?.id;
            const canWithdraw = item.requester_user_id === me?.id;
            const lesson = [
              item.subject_id ? subjectMap.get(item.subject_id)?.name : undefined,
              item.class_id ? classMap.get(item.class_id)?.name : undefined,
            ]
              .filter(Boolean)
              .join(" · ");
            const start = item.start_period_id ? periodMap.get(item.start_period_id) : undefined;
            const end = item.end_period_id ? periodMap.get(item.end_period_id) : undefined;
            const isToday = item.date === today;
            const when = [
              format.dateTime(new Date(`${item.date}T12:00:00Z`), {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: me?.tenant.timezone,
              }),
              start && end ? `${start.name} – ${end.name}` : undefined,
              start && end ? clockRange(start.starts_at, end.ends_at, locale) : undefined,
            ]
              .filter(Boolean)
              .join(" · ");
            const teacher = nameOf(canAnswer ? item.requester_user_id : item.substitute_user_id);
            const action: PendingAction = { item, teacher, lesson: lesson || when };
            return (
              <Card
                key={item.id}
                padding="md"
                tone={isToday && item.status === "accepted" ? "accent-soft" : "default"}
                data-testid={`substitution-${item.id}`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle as="h2" className="min-w-0">
                      {lesson || when}
                    </CardTitle>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {isToday && (
                        <Badge tone="accent" size="sm">
                          {t("todayBadge")}
                        </Badge>
                      )}
                      <SemanticStatusBadge
                        status={SEMANTIC_STATUS[item.status]}
                        label={t(`status.${item.status}`)}
                        size="sm"
                      />
                    </span>
                  </div>
                  {lesson && <p className="text-body-sm text-fg-muted">{when}</p>}
                  {direction === "all" ? (
                    <p className="text-body-sm text-fg-muted">
                      {t("fromTeacher")}:{" "}
                      <span className="text-fg">{nameOf(item.requester_user_id)}</span>
                      {" · "}
                      {t("toTeacher")}:{" "}
                      <span className="text-fg">{nameOf(item.substitute_user_id)}</span>
                    </p>
                  ) : (
                    <p className="text-body-sm text-fg-muted">
                      {direction === "incoming" ? t("fromTeacher") : t("toTeacher")}:{" "}
                      <span className="text-fg">{teacher}</span>
                    </p>
                  )}
                  {item.requester_note && (
                    <p className="text-body-sm text-fg">{item.requester_note}</p>
                  )}
                  {item.response_note && (
                    <p className="text-body-sm text-fg-muted">
                      {t("responseNote")}: {item.response_note}
                    </p>
                  )}
                </div>
                {item.status === "pending" && (canAnswer || canWithdraw) && (
                  <CardFooter className="justify-end">
                    {canAnswer ? (
                      <>
                        <Button
                          variant="secondary"
                          disabled={respond.isPending && respond.variables.id === item.id}
                          onClick={() => {
                            setRejectNote("");
                            setRejecting(action);
                          }}
                        >
                          {t("reject")}
                        </Button>
                        <Button
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
                      </>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setCancelling(action);
                        }}
                      >
                        {t("cancel")}
                      </Button>
                    )}
                  </CardFooter>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(open) => {
          if (!open) setRejecting(null);
        }}
        title={t("rejectConfirm.title", { teacher: rejecting?.teacher ?? "" })}
        description={
          <div className="flex flex-col gap-3">
            <p className="text-body-sm text-fg-muted">
              {t("rejectConfirm.body", { lesson: rejecting?.lesson ?? "" })}
            </p>
            <Field label={t("rejectConfirm.noteLabel")} optional>
              <Textarea
                value={rejectNote}
                onChange={(event) => {
                  setRejectNote(event.target.value);
                }}
                rows={3}
                maxLength={500}
              />
            </Field>
          </div>
        }
        confirmLabel={t("rejectConfirm.confirm")}
        tone="danger"
        confirming={respond.isPending}
        onConfirm={() => {
          if (!rejecting) return;
          const note = rejectNote.trim();
          respond.mutate(
            { id: rejecting.item.id, accept: false, ...(note ? { note } : {}) },
            {
              // On failure the dialog stays open with the typed reason, so
              // confirming again retries without retyping it.
              onError: fail,
              onSuccess: () => {
                setRejecting(null);
                toast.success(t("rejected"));
              },
            },
          );
        }}
      />

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
        title={t("cancelConfirm.title", { teacher: cancelling?.teacher ?? "" })}
        description={t("cancelConfirm.body", { lesson: cancelling?.lesson ?? "" })}
        confirmLabel={t("cancelConfirm.confirm")}
        cancelLabel={t("cancelConfirm.keep")}
        tone="danger"
        confirming={cancel.isPending}
        onConfirm={() => {
          if (!cancelling) return;
          cancel.mutate(cancelling.item.id, {
            // On failure the dialog stays open, so confirming again retries.
            onError: fail,
            onSuccess: () => {
              setCancelling(null);
              toast.success(t("cancelled"));
            },
          });
        }}
      />

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
    </AppPage>
  );
}

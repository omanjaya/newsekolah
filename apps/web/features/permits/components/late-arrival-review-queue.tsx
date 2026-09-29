"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogContent,
  Input,
  Skeleton,
  StatTile,
  cn,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { bentoCells, tileColumns } from "../../../lib/layout/bento";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type LateArrivalSummary,
  useLateArrivalQuery,
  useReviewLateArrivalMutation,
  type useLateArrivalQueueQuery,
} from "../api";
import { buildLateArrivalQueueTiles } from "../lib/late-arrival-queue-tiles";

import { WorkflowStatusBadge, WorkflowStepper } from "./workflow-stepper";

/**
 * The duty teacher's queue: the bento stat-tile row (docs/07-ui-ux.md),
 * a search box, and one card per late arrival still `in_progress`.
 * `queue` is fetched once by the parent view (which also needs the count
 * for its tab label) and passed down here, rather than re-queried, so the
 * realtime subscription in the query hook only ever fires once.
 */
export function ReviewQueue({
  queue,
}: {
  queue: ReturnType<typeof useLateArrivalQueueQuery>;
}): ReactElement {
  const t = useTranslations("app.permits.late");
  const tReview = useTranslations("app.permits.review");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const [reviewing, setReviewing] = useState<LateArrivalSummary | null>(null);
  const [search, setSearch] = useState("");
  const items = useMemo(() => queue.data?.data ?? [], [queue.data]);
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      (studentMap.get(item.student_user_id)?.name ?? "").toLowerCase().includes(query),
    );
  }, [items, search, studentMap]);
  const tiles = useMemo(
    () => buildLateArrivalQueueTiles(items, todayInZone(me?.tenant.timezone), me?.tenant.timezone),
    [items, me?.tenant.timezone],
  );
  const grid = tileColumns(tiles.length);
  const cells = bentoCells(
    visibleItems.map((item) => {
      const studentName = studentMap.get(item.student_user_id)?.name;
      return {
        key: item.instance_id,
        node: (
          <Card className="flex h-full flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[14px] font-medium text-fg">
                  {studentName ? formatDisplayName(studentName) : t("unknownStudent")}
                </span>
                <span className="text-[13px] text-fg-muted">
                  {formatDateTime(item.opened_at, { locale, timeZone: me?.tenant.timezone })} ·{" "}
                  {t("occurrenceValue", { n: item.occurrence_number })}
                </span>
                {item.reason && <span className="text-[13px] text-fg">{item.reason}</span>}
              </div>
              <WorkflowStatusBadge status={item.status} />
            </div>
            <div className="mt-auto flex justify-end">
              <Button
                size="sm"
                onClick={() => {
                  setReviewing(item);
                }}
              >
                {t("review")}
              </Button>
            </div>
          </Card>
        ),
      };
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      {queue.isLoading ? null : (
        <div className={grid.container} data-testid="late-arrival-queue-tiles">
          {tiles.map((tile, index) => (
            <div
              key={tile.key}
              data-testid={`late-arrival-queue-tile-${tile.key}`}
              className={cn("h-full", index === tiles.length - 1 && grid.lastTileClassName)}
            >
              <StatTile
                className="h-full"
                icon={tile.icon}
                tone={tile.tone}
                value={tile.value}
                label={tReview(tile.labelKey)}
              />
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="w-full sm:w-64"
        />
      )}
      {queue.isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-[13px] text-fg-muted">
          <domainIcons.late className="size-4 shrink-0" aria-hidden="true" />
          {t("queueEmptyBody")}
        </p>
      ) : visibleItems.length === 0 ? (
        <p className="px-1 py-6 text-center text-[13px] text-fg-muted">{t("noMatch")}</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2" data-testid="late-arrival-queue-cards">
          {cells.map((cell) => (
            <li
              key={cell.key}
              className={cn("flex h-full flex-col", cell.span === "full" && "lg:col-span-2")}
            >
              {cell.node}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={reviewing !== null}
        onOpenChange={(open) => {
          if (!open) setReviewing(null);
        }}
      >
        <DialogContent title={t("reviewTitle")}>
          {reviewing && (
            <ReviewForm
              item={reviewing}
              onDone={() => {
                setReviewing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReviewForm({
  item,
  onDone,
}: {
  item: LateArrivalSummary;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.permits.late");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const detail = useLateArrivalQuery(item.instance_id);
  const review = useReviewLateArrivalMutation();
  const [reason, setReason] = useState(item.reason);
  const [homeroomReported, setHomeroomReported] = useState(item.homeroom_reported ?? false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        review.mutate(
          {
            id: item.instance_id,
            reason: reason.trim() || undefined,
            homeroom_reported: homeroomReported,
          },
          {
            onSuccess: () => {
              toast.success(t("reviewed"));
              onDone();
            },
            onError: (error) => {
              toast.error(
                error instanceof ApiError
                  ? apiErrorMessage(error.code)
                  : apiErrorMessage("UNKNOWN"),
              );
            },
          },
        );
      }}
    >
      {detail.data && <WorkflowStepper instance={detail.data.instance} />}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("reasonLabel")}</span>
        <Input
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
          maxLength={500}
        />
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <Checkbox
          checked={homeroomReported}
          onCheckedChange={(v) => {
            setHomeroomReported(v === true);
          }}
        />
        {t("homeroomReported")}
      </label>
      <p className="text-[13px] text-fg-muted">{t("reviewHint")}</p>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={review.isPending}>
          {t("submitReview")}
        </Button>
      </div>
    </form>
  );
}

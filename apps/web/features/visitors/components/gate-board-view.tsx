"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  SearchInput,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type BoardEntry, useCheckOutVisitMutation, useVisitorBoardQuery } from "../api";

import { CheckInForm } from "./check-in-form";

function BoardCard({ entry }: { entry: BoardEntry }): ReactElement {
  const t = useTranslations("app.visitors.board");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const checkOut = useCheckOutVisitMutation();
  const { visit } = entry;

  return (
    <li
      className="flex flex-col gap-3 rounded-lg border border-border bg-bg-raised p-4"
      data-overdue={entry.overdue || undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[17px] font-semibold">{visit.full_name}</span>
          {visit.organization && (
            <span className="text-[13px] text-fg-muted">{visit.organization}</span>
          )}
        </div>
        {entry.overdue && <Badge variant="accent">{t("overdue")}</Badge>}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-fg-muted">{t("purpose")}</dt>
        <dd>{visit.purpose || t("noPurpose")}</dd>
        <dt className="text-fg-muted">{t("arrivedAt")}</dt>
        <dd>{formatDateTime(visit.arrived_at, { locale })}</dd>
        <dt className="text-fg-muted">{t("badgeNumber")}</dt>
        <dd>{visit.badge_number || t("noBadge")}</dd>
      </dl>
      <Button
        variant="secondary"
        loading={checkOut.isPending}
        className="min-h-14 text-[16px] font-semibold"
        onClick={() => {
          checkOut.mutate(visit.id, {
            onSuccess: () => {
              toast.success(t("signedOut", { name: visit.full_name }));
            },
            onError: (error) => {
              toast.error(
                error instanceof ApiError
                  ? apiErrorMessage(error.code)
                  : apiErrorMessage("UNKNOWN"),
              );
            },
          });
        }}
      >
        {t("checkOut")}
      </Button>
    </li>
  );
}

/**
 * The screen a guard actually works from, standing at the gate desk: big
 * cards with one large action each, a 30s auto-refresh, and a single
 * button to start a new sign-in. Touch targets stay at
 * least 44px tall even at desk-tablet width.
 */
export function GateBoardView(): ReactElement {
  const t = useTranslations("app.visitors.board");
  const board = useVisitorBoardQuery();
  const [checkingIn, setCheckingIn] = useState(false);
  const [search, setSearch] = useState("");

  const entries = board.data?.data ?? [];
  const query = search.trim().toLowerCase();
  const visibleEntries = useMemo(() => {
    if (query === "") return entries;
    return entries.filter(
      (entry) =>
        entry.visit.full_name.toLowerCase().includes(query) ||
        entry.visit.organization.toLowerCase().includes(query),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `entries` is a fresh array each render; `query` alone decides when this needs to rerun.
  }, [query, board.data]);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-fg-muted">{t("count", { count: entries.length })}</p>
        <Button
          icon={<Plus />}
          className="min-h-14 text-[16px] font-semibold"
          onClick={() => {
            setCheckingIn(true);
          }}
        >
          {t("newVisitor")}
        </Button>
      </div>

      {entries.length > 3 && (
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="max-w-sm"
        />
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={<domainIcons.visitor aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : visibleEntries.length === 0 ? (
        <EmptyState
          icon={<domainIcons.visitor aria-hidden="true" />}
          title={t("searchEmptyTitle")}
          description={t("searchEmptyBody", { query: search.trim() })}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleEntries.map((entry) => (
            <BoardCard key={entry.visit.id} entry={entry} />
          ))}
        </ul>
      )}

      <Dialog
        open={checkingIn}
        onOpenChange={(open) => {
          setCheckingIn(open);
        }}
      >
        <DialogContent title={t("newVisitor")}>
          {checkingIn && (
            <CheckInForm
              onDone={() => {
                setCheckingIn(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

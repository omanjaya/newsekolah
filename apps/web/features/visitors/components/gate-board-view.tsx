"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatTime, type Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  cn,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  FilteredEmptyState,
  FirstUseEmptyState,
  SearchInput,
  SectionHeader,
  SegmentedControl,
  SkeletonList,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useId, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useQuickAction } from "../../../lib/hooks/use-quick-action";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { VisitorsWorkspaceNav } from "../../student-services/components/service-workspace-nav";
import {
  type Visit,
  useCheckOutVisitMutation,
  useExpectedGuestsQuery,
  useVisitBadgeUrlMutation,
  useVisitorBoardQuery,
} from "../api";
import { matchesSearch, sortBoardEntries } from "../lib/board";

import { CheckInForm } from "./check-in-form";
import { ExpectedTodayPanel } from "./expected-today-panel";
import { OnSiteList } from "./on-site-list";

const FILTERS = ["all", "onSite", "expected"] as const;
type BoardFilter = (typeof FILTERS)[number];

/**
 * Whether the board is current: a pulsing "updated 10.42" while the live
 * feed and the 30s refresh keep it fresh, a warning once a refresh failed
 * (the list below is then the last one that loaded).
 */
function LiveStatus({ updatedAt, failed }: { updatedAt: number; failed: boolean }) {
  const t = useTranslations("app.visitors.board");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  if (updatedAt === 0) return null;
  const time = formatTime(updatedAt, { locale, timeZone: me?.tenant.timezone });
  return failed ? (
    <Badge tone="warning" size="sm" dot>
      {t("stale", { time })}
    </Badge>
  ) : (
    <Badge tone="success" size="sm" dot dotClassName="bg-success animate-live">
      {t("live", { time })}
    </Badge>
  );
}

/**
 * The gate board, the screen a guard works from all day, often on a phone:
 * who is on site now (with whom they came to see and for how long), a
 * one-tap check out that asks first, today's scheduled visitors to check
 * in, one search over both, and "Tamu baru" in the header (also offered by
 * the phone's quick-action button). Live updates plus a 30s refresh keep
 * it current; the header of the list says when it last did.
 */
export function GateBoardView(): ReactElement {
  const t = useTranslations("app.visitors.board");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  const board = useVisitorBoardQuery();
  const expected = useExpectedGuestsQuery(todayInZone(timeZone));
  const checkOut = useCheckOutVisitMutation();
  const badgeUrl = useVisitBadgeUrlMutation();
  const canManage = useCan("manage_visitors");
  const [status, setStatus] = useUrlState<BoardFilter>("status", FILTERS, "all");
  const [search, setSearch] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState<Visit | null>(null);
  const onSiteTitleId = useId();
  const startCheckIn = () => {
    setCheckingIn(true);
  };
  // The badge PDF opens in a new tab, where the browser prints it.
  const printBadge = (visit: Visit) => {
    badgeUrl.mutate(visit.id, {
      onSuccess: (result) => {
        window.open(result.url, "_blank", "noopener,noreferrer");
      },
      onError: (error) => {
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        );
      },
    });
  };
  useQuickAction("add-visitor", startCheckIn, canManage);

  const entries = sortBoardEntries(board.data?.data ?? []);
  const visible = entries.filter(({ visit }) =>
    matchesSearch(search, visit.full_name, visit.organization),
  );
  const expectedCount = expected.data?.data.length ?? 0;
  const showOnSite = status !== "expected";
  const showExpected = status !== "onSite";

  let onSiteBody: ReactElement;
  if (board.isLoading) {
    onSiteBody = <SkeletonList rows={3} />;
  } else if (board.isError && !board.data) {
    onSiteBody = <QueryError retry={() => board.refetch()} error={board.error} />;
  } else if (entries.length === 0) {
    const empty = {
      icon: <domainIcons.visitor />,
      title: t("emptyTitle"),
      description: t("emptyBody"),
    };
    onSiteBody = canManage ? (
      <FirstUseEmptyState {...empty} actionLabel={t("newVisitor")} onAction={startCheckIn} />
    ) : (
      <EmptyState {...empty} />
    );
  } else if (visible.length === 0) {
    onSiteBody = (
      <FilteredEmptyState
        title={t("searchEmptyTitle")}
        description={t("searchEmptyBody", { query: search.trim() })}
        resetLabel={t("clearSearch")}
        onReset={() => {
          setSearch("");
        }}
      />
    );
  } else {
    onSiteBody = (
      <OnSiteList
        entries={visible}
        timeZone={timeZone}
        canManage={canManage}
        onCheckOut={setCheckingOut}
        onPrintBadge={printBadge}
        printingBadgeId={badgeUrl.isPending ? badgeUrl.variables : undefined}
      />
    );
  }

  return (
    <AppPage
      nav={<VisitorsWorkspaceNav />}
      documentTitle={t("documentTitle")}
      primaryAction={
        canManage ? (
          <Button icon={<Plus />} onClick={startCheckIn}>
            {t("newVisitor")}
          </Button>
        ) : undefined
      }
      // On a phone the action is an icon on the title's line, as on every
      // Buku tamu page, so the tab row sits at one height across them.
      primaryActionCompact={
        canManage ? { icon: <Plus />, label: t("newVisitor"), onSelect: startCheckIn } : undefined
      }
      toolbar={
        // Full width of the toolbar row and allowed to shrink, so the filter
        // strip scrolls inside the column instead of pushing past it; the
        // search keeps the data-table toolbar's width.
        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="sm:w-72 sm:flex-none lg:w-80"
          />
          <SegmentedControl<BoardFilter>
            aria-label={t("filterLabel")}
            value={status}
            onValueChange={setStatus}
            fullWidth="phone"
            options={[
              { value: "all", label: t("filters.all") },
              {
                value: "onSite",
                label: t("filters.onSite"),
                count: board.data ? entries.length : undefined,
              },
              {
                value: "expected",
                label: t("filters.expected"),
                count: expected.data ? expectedCount : undefined,
              },
            ]}
          />
        </div>
      }
    >
      <div
        className={cn(
          "grid grid-cols-1 gap-6",
          showOnSite && showExpected && "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start",
        )}
      >
        {showOnSite && (
          <section aria-labelledby={onSiteTitleId} className="flex min-w-0 flex-col gap-3">
            <SectionHeader
              titleId={onSiteTitleId}
              title={t("onSiteTitle")}
              count={board.data ? entries.length : undefined}
              action={
                <LiveStatus
                  updatedAt={board.dataUpdatedAt}
                  failed={board.isError && board.data !== undefined}
                />
              }
            />
            {onSiteBody}
          </section>
        )}
        {showExpected && <ExpectedTodayPanel search={search} />}
      </div>

      <ConfirmDialog
        open={checkingOut !== null}
        onOpenChange={(open) => {
          if (!open) setCheckingOut(null);
        }}
        title={t("checkOutDialog.title")}
        description={t("checkOutDialog.body", { name: checkingOut?.full_name ?? "" })}
        confirmLabel={t("checkOut")}
        confirming={checkOut.isPending}
        onConfirm={() => {
          if (!checkingOut) return;
          const name = checkingOut.full_name;
          checkOut.mutate(checkingOut.id, {
            onSuccess: () => {
              toast.success(t("signedOut", { name }));
            },
            onError: (error) => {
              toast.error(
                error instanceof ApiError
                  ? apiErrorMessage(error.code)
                  : apiErrorMessage("UNKNOWN"),
              );
            },
            onSettled: () => {
              setCheckingOut(null);
            },
          });
        }}
      />

      <Dialog open={checkingIn} onOpenChange={setCheckingIn}>
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
    </AppPage>
  );
}

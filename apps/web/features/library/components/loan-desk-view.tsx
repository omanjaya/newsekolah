"use client";

import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  type ScannerResultValue,
} from "@newsekolah/ui";
import { ScanLine, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";

import { AppPage } from "../../../components/app-page";
import { confirmableItems, hasUndoableItem } from "../lib/desk-basket";
import { deskItemTone, deskLastResult } from "../lib/desk-last-result";

import { DeskMemberPanel, memberNeedsAttention } from "./desk-member-panel";
import { DeskOverdueTable } from "./desk-overdue-table";
import { DeskReceiptDialog } from "./desk-receipt-dialog";
import { DeskScanBar } from "./desk-scan-bar";
import { DeskScanBasket } from "./desk-scan-basket";
import { DeskTodayPanel } from "./desk-today-panel";
import { LibraryWorkspaceNav } from "./library-workspace-nav";
import { useDeskSession } from "./use-desk-session";

/**
 * The librarian's circulation desk, scan first (docs/07-ui-ux.md
 * "Scanner"): one tall scan bar under the title, always focused, that
 * takes a member card and then the books, with the mode on the bar and
 * the last result large under it. The session (who is served, what was
 * scanned) follows, then the overdue queue; today's figures and the
 * occasional destinations sit in a side column. Every circulation
 * behaviour lives in `useDeskSession`, unchanged: the scanner input and
 * its focus flow, member lookup, the borrow, return and renew baskets,
 * receipts, keyboard shortcuts and realtime refresh.
 */
export function LoanDeskView(): ReactElement {
  const t = useTranslations("app.library.desk");
  const tStatus = useTranslations("app.library.members.status");
  const session = useDeskSession();

  // The scan field only focuses on mount, so hand focus back to it after a
  // member is picked or the session ends, and after each scan resolves.
  const inputRef = useRef<HTMLInputElement>(null);
  const memberId = session.member?.userId ?? null;
  const { scanning } = session;
  useEffect(() => {
    if (scanning) return;
    inputRef.current?.focus();
  }, [memberId, scanning]);

  const items = session.basket[session.mode];
  const pendingBorrow = confirmableItems(session.basket.borrow).length;
  const canUndo = hasUndoableItem(items);
  const attention = memberNeedsAttention(session.memberStatus);

  const last = deskLastResult({
    scanError: session.scanError,
    memberName: session.member?.name ?? null,
    memberNeedsAttention: attention,
    items,
  });
  let result: ScannerResultValue | null = null;
  if (last?.kind === "error") {
    result = { tone: "danger", title: last.message, key: `error:${last.message}` };
  } else if (last?.kind === "item") {
    result = {
      tone: deskItemTone(last.item.state),
      title: last.item.title,
      description: [last.item.barcode, last.item.detail ?? t(`basket.state.${last.item.state}`)]
        .filter(Boolean)
        .join(" · "),
      key: `${session.mode}:${last.item.barcode}:${last.item.state}`,
    };
  } else if (last?.kind === "member") {
    result = {
      tone: last.attention ? "warning" : "success",
      title: t("result.memberTitle", { name: last.name }),
      description:
        last.attention && session.memberStatus
          ? t("result.memberAttention", { status: tStatus(session.memberStatus) })
          : t(`result.memberNext.${session.mode}`),
      key: `member:${memberId ?? ""}:${session.mode}`,
    };
  }

  return (
    <AppPage variant="wide" nav={<LibraryWorkspaceNav area="circulation" />}>
      {/* The work on the left, today and the occasional destinations on the
          right; on a phone the overdue queue comes before the side column. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <DeskScanBar
            mode={session.mode}
            onModeChange={session.setMode}
            pendingBorrow={pendingBorrow}
            hasMember={session.member !== null}
            scanning={session.scanning}
            onScan={session.handleScan}
            onSelectMember={(selected) => {
              session.selectMember({
                userId: selected.user_id,
                name: selected.user_name,
                memberNo: selected.member_no,
                nis: selected.nis,
                username: selected.username,
              });
            }}
            result={result}
            inputRef={inputRef}
          />

          <Card data-testid="desk-session">
            {session.member ? (
              <>
                <div className="p-5">
                  <DeskMemberPanel
                    member={session.member}
                    memberStatus={session.memberStatus}
                    onOpenReceipt={() => {
                      session.setReceiptOpen(true);
                    }}
                    onClear={session.endSession}
                  />
                </div>
                <CardHeader
                  className="border-t border-line pt-4"
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Undo2 />}
                      disabled={!canUndo}
                      onClick={() => {
                        session.undo(session.mode);
                      }}
                    >
                      {t("undoLastScan")}
                    </Button>
                  }
                >
                  <CardTitle as="h2">{t(`basket.heading.${session.mode}`)}</CardTitle>
                </CardHeader>
                <div aria-live="polite">
                  <DeskScanBasket
                    mode={session.mode}
                    items={items}
                    onRemove={(barcode) => {
                      session.removeItem(session.mode, barcode);
                    }}
                  />
                </div>
                {session.mode === "borrow" && pendingBorrow > 0 && (
                  <div className="flex justify-end border-t border-line p-4">
                    <Button
                      size="lg"
                      loading={session.confirmingBorrow}
                      onClick={() => {
                        void session.confirmBorrow();
                      }}
                      className="max-sm:w-full"
                    >
                      {t("basket.confirmBorrow", { count: pendingBorrow })}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              // Compact: an idle desk keeps the overdue queue near the
              // fold instead of a tall placeholder above it.
              <EmptyState
                variant="compact"
                className="px-5 py-4"
                icon={<ScanLine aria-hidden="true" />}
                title={t("member.hintTitle")}
                description={t("member.hintBody")}
              />
            )}
          </Card>
        </div>

        <DeskTodayPanel className="max-lg:order-last" />

        {/* Full width: the queue's six columns do not fit beside the side
            column. */}
        <div className="min-w-0 lg:col-span-2">
          <DeskOverdueTable />
        </div>
      </div>

      <DeskReceiptDialog
        open={session.receiptOpen}
        onOpenChange={session.setReceiptOpen}
        member={session.member}
        basket={session.basket}
      />
    </AppPage>
  );
}

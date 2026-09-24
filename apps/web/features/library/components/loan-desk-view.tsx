"use client";

import { Alert, BarcodeScannerField, Button, PageHeader } from "@newsekolah/ui";
import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { confirmableItems, hasUndoableItem } from "../lib/desk-basket";

import { DeskMemberPanel } from "./desk-member-panel";
import { DeskModeTabs } from "./desk-mode-tabs";
import { DeskOverdueTable } from "./desk-overdue-table";
import { DeskReceiptDialog } from "./desk-receipt-dialog";
import { DeskScanBasket } from "./desk-scan-basket";
import { useDeskSession } from "./use-desk-session";

/**
 * The librarian's circulation desk: scan a member card, then scan books in
 * a continuous flow without touching the mouse -- Pinjam/Kembali/Perpanjang
 * switch with one tap or Alt+1/2/3, every scan gets immediate sound/visual
 * feedback, and the day's overdue list sits below for follow-up.
 */
export function LoanDeskView(): ReactElement {
  const t = useTranslations("app.library.desk");
  const session = useDeskSession();

  const pendingCounts = {
    borrow: confirmableItems(session.basket.borrow).length,
    return: 0,
    renew: 0,
  };
  const canUndo = hasUndoableItem(session.basket[session.mode]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          session.member && (
            <Button
              variant="secondary"
              onClick={() => {
                session.setReceiptOpen(true);
              }}
            >
              {t("receipt.open")}
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
        <DeskMemberPanel
          member={session.member}
          memberStatus={session.memberStatus}
          onSelectMember={session.selectMember}
          onClear={session.endSession}
        />

        {session.member && (
          <>
            <DeskModeTabs
              mode={session.mode}
              onModeChange={session.setMode}
              pendingCounts={pendingCounts}
            />

            <div className="flex flex-wrap items-end gap-3">
              <BarcodeScannerField
                label={t(`modes.scanLabel.${session.mode}`)}
                onScan={session.handleScan}
                submitLabel={t("scanSubmit")}
                disabled={session.scanning}
                autoFocus
                stretch
              />
              <Button
                type="button"
                variant="secondary"
                icon={<Undo2 />}
                disabled={!canUndo}
                onClick={() => {
                  session.undo(session.mode);
                }}
              >
                {t("undoLastScan")}
              </Button>
            </div>
            {session.scanError && (
              <p className="text-[13px] text-status-absent">{session.scanError}</p>
            )}

            <DeskScanBasket
              mode={session.mode}
              items={session.basket[session.mode]}
              confirming={session.confirmingBorrow}
              onRemove={(barcode) => {
                session.removeItem(session.mode, barcode);
              }}
              onConfirm={() => {
                void session.confirmBorrow();
              }}
            />
          </>
        )}

        {!session.member && (
          <Alert variant="info" title={t("member.hintTitle")}>
            {t("member.hintBody")}
          </Alert>
        )}
      </div>

      <DeskOverdueTable />

      <DeskReceiptDialog
        open={session.receiptOpen}
        onOpenChange={session.setReceiptOpen}
        member={session.member}
        basket={session.basket}
      />
    </div>
  );
}

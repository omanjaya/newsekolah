"use client";

import {
  Alert,
  BarcodeScannerField,
  Button,
  Card,
  PageHeader,
  Skeleton,
  StatTile,
  cn,
} from "@newsekolah/ui";
import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { bentoCells, tileColumns } from "../../../lib/layout/bento";
import { useLibraryDashboardQuery } from "../dashboard-api";
import { confirmableItems, hasUndoableItem } from "../lib/desk-basket";

import { DeskMemberPanel } from "./desk-member-panel";
import { DeskModeTabs } from "./desk-mode-tabs";
import { DeskOverdueTable } from "./desk-overdue-table";
import { DeskReceiptDialog } from "./desk-receipt-dialog";
import { DeskScanBasket } from "./desk-scan-basket";
import { buildDeskTodayTiles } from "./desk-today-tiles";
import { LibraryWorkspaceNav } from "./library-workspace-nav";
import { useDeskSession } from "./use-desk-session";

/**
 * The librarian's circulation desk, in the Hijau Segar bento language
 * (docs/07-ui-ux.md section 0): the pill mode switch (Pinjam/Kembali/
 * Perpanjang) sits in the header next to the session receipt button,
 * today's counts are four equal-width stat tiles from the same library
 * dashboard query the landing page uses, the scan+member panel and the
 * running basket form a symmetric two-card row of equal height, and the
 * overdue queue stays the shared table it already was
 * (`DeskOverdueTable`). Every circulation behavior -- barcode/USB scanner
 * input and its focus flow, member lookup, borrow/return/renew baskets,
 * receipts, violations, keyboard shortcuts, realtime refresh -- is
 * unchanged; only the chrome around it moved.
 */
export function LoanDeskView(): ReactElement {
  const t = useTranslations("app.library.desk");
  const session = useDeskSession();
  const dashboard = useLibraryDashboardQuery();

  const pendingCounts = {
    borrow: confirmableItems(session.basket.borrow).length,
    return: 0,
    renew: 0,
  };
  const canUndo = hasUndoableItem(session.basket[session.mode]);

  const tiles = dashboard.data ? buildDeskTodayTiles(dashboard.data.summary) : [];
  const tileGrid = tileColumns(tiles.length || 1);

  const cards = bentoCells([
    {
      key: "scan",
      node: (
        <Card className="flex h-full flex-col gap-4 p-4" data-testid="desk-scan-card">
          <DeskMemberPanel
            member={session.member}
            memberStatus={session.memberStatus}
            onSelectMember={session.selectMember}
            onClear={session.endSession}
          />

          {session.member ? (
            <>
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
            </>
          ) : (
            <Alert variant="info" title={t("member.hintTitle")}>
              {t("member.hintBody")}
            </Alert>
          )}
        </Card>
      ),
    },
    {
      key: "basket",
      node: (
        <Card className="flex h-full flex-col gap-3 p-4" data-testid="desk-basket-card">
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
        </Card>
      ),
    },
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          <>
            <DeskModeTabs
              mode={session.mode}
              onModeChange={session.setMode}
              pendingCounts={pendingCounts}
            />
            {session.member && (
              <Button
                variant="secondary"
                onClick={() => {
                  session.setReceiptOpen(true);
                }}
              >
                {t("receipt.open")}
              </Button>
            )}
          </>
        }
      />
      <LibraryWorkspaceNav area="circulation" />

      {dashboard.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
          <Skeleton className="h-[104px] w-full" />
          <Skeleton className="h-[104px] w-full" />
          <Skeleton className="h-[104px] w-full" />
          <Skeleton className="h-[104px] w-full" />
        </div>
      ) : tiles.length > 0 ? (
        <div className={tileGrid.container} data-testid="desk-tiles">
          {tiles.map((tile, index) => (
            <div
              key={tile.key}
              data-testid={`desk-tile-${tile.key}`}
              className={cn("h-full", index === tiles.length - 1 && tileGrid.lastTileClassName)}
            >
              <StatTile
                className="h-full"
                icon={tile.icon}
                tone={tile.tone}
                value={tile.value}
                label={t(`tiles.${tile.labelKey}`)}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2" data-testid="desk-cards">
        {cards.map((cell) => (
          <div
            key={cell.key}
            data-testid={`desk-cell-${cell.key}`}
            className={cn("flex h-full flex-col", cell.span === "full" && "lg:col-span-2")}
          >
            <div className="flex-1">{cell.node}</div>
          </div>
        ))}
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

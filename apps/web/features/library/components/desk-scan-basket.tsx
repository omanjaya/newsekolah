"use client";

import { Button, EmptyState, IconButton, cn, domainIcons } from "@newsekolah/ui";
import { AlertTriangle, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { type DeskBasketItem, type DeskMode, confirmableItems } from "../lib/desk-basket";

const ROW_ACCENT: Record<DeskBasketItem["state"], string> = {
  pending: "border-border",
  blocked: "border-status-late/40 bg-status-late/5",
  done: "border-status-present/40 bg-status-present/5",
  failed: "border-status-absent/40 bg-status-absent/5",
};

function RowIcon({ state }: { state: DeskBasketItem["state"] }): ReactElement | null {
  if (state === "done")
    return <Check className="size-4 shrink-0 text-status-present" aria-hidden="true" />;
  if (state === "failed" || state === "blocked")
    return <AlertTriangle className="size-4 shrink-0 text-status-absent" aria-hidden="true" />;
  return null;
}

/**
 * The running list of scanned copies for the active mode. Pinjam builds a
 * pending queue committed by one Confirm (batch-borrow); Kembali and
 * Perpanjang commit each scan immediately (return-by-barcode /
 * renew-by-barcode both already act on one copy at a time, so nothing is
 * gained by delaying them behind a second click) and this list becomes a
 * running receipt of what just happened instead of a queue -- which is
 * also why only a pending/blocked row (Pinjam, before Confirm) offers
 * remove/undo: a "done" or "failed" row already reflects a real server
 * call.
 */
export function DeskScanBasket({
  mode,
  items,
  confirming,
  onRemove,
  onConfirm,
}: {
  mode: DeskMode;
  items: DeskBasketItem[];
  confirming: boolean;
  onRemove: (barcode: string) => void;
  onConfirm: () => void;
}): ReactElement {
  const t = useTranslations("app.library.desk.basket");

  const confirmCount = mode === "borrow" ? confirmableItems(items).length : 0;

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.library aria-hidden="true" />}
          title={t(`emptyTitle.${mode}`)}
          description={t(`emptyBody.${mode}`)}
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li
              key={item.barcode}
              data-state={item.state}
              className={cn(
                "flex items-center gap-2.5 rounded-sm border px-3 py-2",
                ROW_ACCENT[item.state],
              )}
            >
              <RowIcon state={item.state} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium text-fg">{item.title}</span>
                <span className="truncate text-[12px] text-fg-muted">
                  {item.barcode}
                  {item.detail ? ` · ${item.detail}` : ""}
                </span>
              </div>
              {(item.state === "pending" || item.state === "blocked") && (
                <IconButton
                  icon={<X />}
                  aria-label={t("removeFromList", { barcode: item.barcode })}
                  variant="ghost"
                  onClick={() => {
                    onRemove(item.barcode);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {mode === "borrow" && (
        <Button
          type="button"
          loading={confirming}
          disabled={confirmCount === 0}
          onClick={onConfirm}
        >
          {t("confirmBorrow", { count: confirmCount })}
        </Button>
      )}
    </div>
  );
}

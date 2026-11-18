"use client";

import { IconButton, IconCircle, List, ListRow } from "@newsekolah/ui";
import { BookCheck, BookPlus, CircleAlert, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { DeskBasketItem, DeskMode } from "../lib/desk-basket";

function StateIcon({ state }: { state: DeskBasketItem["state"] }): ReactElement {
  if (state === "done")
    return (
      <IconCircle tone="success" size="md">
        <BookCheck />
      </IconCircle>
    );
  if (state === "failed")
    return (
      <IconCircle tone="danger" size="md">
        <CircleAlert />
      </IconCircle>
    );
  if (state === "blocked")
    return (
      <IconCircle tone="warning" size="md">
        <TriangleAlert />
      </IconCircle>
    );
  return (
    <IconCircle tone="accent" size="md">
      <BookPlus />
    </IconCircle>
  );
}

/**
 * The running list of scanned copies for the active mode, newest first.
 * Pinjam builds a pending queue committed by one Confirm (batch-borrow);
 * Kembali and Perpanjang commit each scan immediately (return-by-barcode
 * and renew-by-barcode both act on one copy at a time) and the list
 * becomes a running receipt. Only a pending or refused row (Pinjam,
 * before Confirm) can be removed: a settled row is a real server call.
 */
export function DeskScanBasket({
  mode,
  items,
  onRemove,
}: {
  mode: DeskMode;
  items: DeskBasketItem[];
  onRemove: (barcode: string) => void;
}): ReactElement {
  const t = useTranslations("app.library.desk.basket");

  if (items.length === 0) {
    return (
      <p className="px-5 pb-5 text-body-sm text-fg-muted" data-testid="desk-basket-empty">
        {t(`emptyBody.${mode}`)}
      </p>
    );
  }

  return (
    <List aria-label={t(`heading.${mode}`)}>
      {items.map((item) => (
        <ListRow
          key={item.barcode}
          data-state={item.state}
          leading={<StateIcon state={item.state} />}
          title={item.title}
          meta={[item.barcode, item.detail ?? t(`state.${item.state}`)].join(" · ")}
          action={
            item.state === "pending" || item.state === "blocked" ? (
              <IconButton
                icon={<X />}
                size="sm"
                aria-label={t("removeFromList", { barcode: item.barcode })}
                onClick={() => {
                  onRemove(item.barcode);
                }}
              />
            ) : undefined
          }
        />
      ))}
    </List>
  );
}

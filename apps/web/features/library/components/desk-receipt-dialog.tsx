"use client";

import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Button, Dialog, DialogClose, DialogContent } from "@newsekolah/ui";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { DeskBasketItem, DeskMode } from "../lib/desk-basket";

import type { DeskSelectedMember } from "./desk-member-panel";

/**
 * Opens a small, self-contained print window instead of printing the app
 * shell itself: the desk's sidebar, tabs, and scan input have no business
 * on a paper receipt, and a dedicated window avoids having to fight the
 * whole page's layout with print media queries for one dialog. Built with
 * DOM calls (`createElement`/`textContent`) rather than `document.write`
 * (deprecated) or an `innerHTML` template, so a title or barcode is never
 * interpreted as markup.
 */
function printReceipt(
  title: string,
  sections: { label: string; rows: { text: string; detail?: string }[] }[],
) {
  const win = window.open("", "_blank", "width=380,height=600");
  if (!win) return;
  const doc = win.document;
  doc.title = title;

  const style = doc.createElement("style");
  style.textContent = `
    body { font-family: ui-monospace, monospace; font-size: 13px; width: 320px; margin: 16px auto; color: #111; }
    h1 { font-size: 15px; margin: 0 0 4px; }
    h2 { font-size: 12px; text-transform: uppercase; margin: 16px 0 4px; border-top: 1px dashed #999; padding-top: 8px; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { padding: 3px 0; border-bottom: 1px dotted #ccc; }
    small { color: #666; }
  `;
  doc.head.append(style);

  const heading = doc.createElement("h1");
  heading.textContent = title;
  doc.body.append(heading);

  for (const section of sections) {
    if (section.rows.length === 0) continue;
    const h2 = doc.createElement("h2");
    h2.textContent = section.label;
    doc.body.append(h2);
    const ul = doc.createElement("ul");
    for (const row of section.rows) {
      const li = doc.createElement("li");
      li.append(row.text);
      if (row.detail) {
        li.append(doc.createElement("br"));
        const small = doc.createElement("small");
        small.textContent = row.detail;
        li.append(small);
      }
      ul.append(li);
    }
    doc.body.append(ul);
  }

  win.print();
}

const MODE_ORDER: DeskMode[] = ["borrow", "return", "renew"];

export function DeskReceiptDialog({
  open,
  onOpenChange,
  member,
  basket,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: DeskSelectedMember | null;
  basket: Record<DeskMode, DeskBasketItem[]>;
}): ReactElement {
  const t = useTranslations("app.library.desk.receipt");
  const tModes = useTranslations("app.library.desk.modes");
  const locale = useLocale() as Locale;

  const settled = MODE_ORDER.map((mode) => ({
    mode,
    label: tModes(mode),
    items: basket[mode].filter((item) => item.state === "done" || item.state === "failed"),
  })).filter((section) => section.items.length > 0);

  const hasAnything = settled.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("title")}
        description={member ? t("forMember", { name: member.name }) : undefined}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                {t("close")}
              </Button>
            </DialogClose>
            <Button
              size="sm"
              icon={<Printer />}
              disabled={!hasAnything}
              onClick={() => {
                printReceipt(t("title"), [
                  {
                    label: formatDateTime(new Date(), { locale }),
                    rows: [],
                  },
                  ...settled.map((section) => ({
                    label: section.label,
                    rows: section.items.map((item) => ({
                      text: `${item.title} (${item.barcode})`,
                      detail: item.detail,
                    })),
                  })),
                ]);
              }}
            >
              {t("print")}
            </Button>
          </>
        }
      >
        {hasAnything ? (
          <div className="flex flex-col gap-4">
            {settled.map((section) => (
              <div key={section.mode} className="flex flex-col gap-1.5">
                <h3 className="text-[13px] font-semibold text-fg">{section.label}</h3>
                <ul className="flex flex-col gap-1">
                  {section.items.map((item) => (
                    <li key={item.barcode} className="text-[13px]">
                      <span className="text-fg">{item.title}</span>
                      {item.detail && (
                        <span className="block text-[12px] text-fg-muted">{item.detail}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-fg-muted">{t("empty")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

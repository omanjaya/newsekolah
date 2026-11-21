"use client";

import { IconButton, useScrollEdges } from "@newsekolah/ui";
import {
  AlignCenter,
  Bold,
  CornerDownLeft,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Underline,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useRef, type ReactElement } from "react";

import type { TemplateFormat } from "../template-format";

/** The buttons in groups: blocks, inline styles, lists and breaks. */
const GROUPS: { format: TemplateFormat; icon: LucideIcon }[][] = [
  [
    { format: "heading", icon: Heading2 },
    { format: "paragraph", icon: Pilcrow },
    { format: "center", icon: AlignCenter },
  ],
  [
    { format: "bold", icon: Bold },
    { format: "italic", icon: Italic },
    { format: "underline", icon: Underline },
  ],
  [
    { format: "bulletList", icon: List },
    { format: "numberedList", icon: ListOrdered },
    { format: "lineBreak", icon: CornerDownLeft },
  ],
];

/**
 * The format buttons over the template body: each wraps the selected text
 * in the tags for it, so a school admin can bold a word or centre a
 * heading without writing HTML. Every button is named (and shows its name
 * as a tooltip); groups are split by a thin rule.
 *
 * Nine 44px touch targets do not fit a phone's card, and wrapping left the
 * last button alone on a second row. Below `sm` the strip stays one row
 * and scrolls sideways, with an edge fade where buttons wait past the edge;
 * from `sm` up it wraps as before.
 */
export function TemplateFormatToolbar({
  onFormat,
}: {
  onFormat: (format: TemplateFormat) => void;
}): ReactElement {
  const t = useTranslations("app.documents.templates.editor");
  const stripRef = useRef<HTMLDivElement>(null);
  useScrollEdges(stripRef, { axis: "x" });
  return (
    <div
      ref={stripRef}
      role="toolbar"
      aria-label={t("toolbarLabel")}
      aria-orientation="horizontal"
      className="relative scrollbar-none flex items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-md bg-surface-sunken p-1 scroll-fade-x sm:flex-wrap sm:overflow-visible"
    >
      {GROUPS.map((group, index) => (
        <Fragment key={group[0]?.format}>
          {index > 0 && <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line" />}
          {group.map(({ format, icon: Icon }) => (
            <IconButton
              key={format}
              size="sm"
              icon={<Icon />}
              aria-label={t(`format.${format}`)}
              // Keeps the textarea's selection: a button that took focus
              // on press would collapse it before the click lands.
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                onFormat(format);
              }}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}

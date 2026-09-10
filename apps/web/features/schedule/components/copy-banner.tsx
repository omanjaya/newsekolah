"use client";

import { Button } from "@newsekolah/ui";
import { Copy, X } from "lucide-react";
import type { ReactElement } from "react";

import type { ScheduleBlock } from "../api";

/**
 * Says which lesson is on the clipboard while it is, because a mode the
 * interface does not announce is a mode people forget they are in.
 */
export function CopyBanner({
  copied,
  subjectMap,
  classMap,
  onCancel,
  t,
}: {
  copied: ScheduleBlock | null;
  subjectMap: Map<string, { name: string }>;
  classMap: Map<string, { name: string }>;
  onCancel: () => void;
  t: (key: string, values?: Record<string, string>) => string;
}): ReactElement | null {
  if (!copied) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm border border-accent/40 bg-accent/10 px-3 py-2 text-[13px] text-fg">
      <Copy className="size-4 shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {t("copyingHint", {
          subject: subjectMap.get(copied.subject_id)?.name ?? t("unknownSubject"),
          class: classMap.get(copied.class_id)?.name ?? t("unknownClass"),
        })}
      </span>
      <Button variant="ghost" size="sm" icon={<X />} onClick={onCancel}>
        {t("cancelCopy")}
      </Button>
    </div>
  );
}

"use client";

import { Alert, Button } from "@newsekolah/ui";
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
    <Alert
      variant="info"
      icon={<Copy aria-hidden="true" />}
      action={
        <Button variant="secondary" size="sm" icon={<X />} onClick={onCancel}>
          {t("cancelCopy")}
        </Button>
      }
    >
      {t("copyingHint", {
        subject: subjectMap.get(copied.subject_id)?.name ?? t("unknownSubject"),
        class: classMap.get(copied.class_id)?.name ?? t("unknownClass"),
      })}
    </Alert>
  );
}

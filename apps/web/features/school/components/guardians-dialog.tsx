"use client";

import { Dialog, DialogContent, Skeleton } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useStudentGuardiansQuery } from "../guardians-api";

/** Read-only: the parent accounts linked to one student, from that student's own row. */
export function GuardiansDialog({
  open,
  onOpenChange,
  studentUserId,
  studentName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentUserId: string;
  studentName: string;
}): ReactElement {
  const t = useTranslations("app.family.guardianLinks.guardians");
  const guardians = useStudentGuardiansQuery(studentUserId, open);
  const rows = guardians.data?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("title", { name: studentName })} className="max-w-lg">
        {guardians.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rows.map((guardian) => (
              <li
                key={guardian.parent_user_id}
                className="flex items-center justify-between gap-2 rounded-xs border border-border px-3 py-2 text-[13px]"
              >
                <span className="flex flex-col">
                  <span className="text-fg">{guardian.parent_name}</span>
                  <span className="text-[12px] text-fg-muted">
                    {t(`relation.${guardian.relation}`)}
                    {guardian.phone ? ` · ${guardian.phone}` : ""}
                  </span>
                </span>
                {guardian.can_approve_leave && (
                  <span className="text-[12px] text-fg-muted">{t("canApproveLeave")}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

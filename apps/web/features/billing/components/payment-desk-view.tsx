"use client";

import { EmptyState, domainIcons } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { DirectoryPicker } from "../../reference/components/directory-picker";

import { StudentBillHistoryView } from "./student-bill-history-view";

/**
 * The finance office's front desk: pick a student, see every bill they
 * have this year and the payments recorded against each, record a new
 * payment, void a mistaken one, or print/share a receipt.
 *
 * The picker searches the directory on the server (debounced, capped at
 * 50 results) instead of loading every student, so it stays fast for a
 * school of thousands.
 */
export function PaymentDeskView(): ReactElement {
  const t = useTranslations("app.billing.paymentDesk");
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("pickStudent")}</span>
        <DirectoryPicker
          profileKind="student"
          value={studentId}
          onValueChange={(id, label) => {
            setStudentId(id);
            setStudentName(label);
          }}
          labels={{
            placeholder: t("pickStudentPlaceholder"),
            searchPlaceholder: t("pickStudentSearchPlaceholder"),
            emptyLabel: t("pickStudentEmpty"),
          }}
          className="w-full sm:w-80"
        />
      </label>

      {studentId === "" ? (
        <EmptyState
          icon={<domainIcons.billing aria-hidden="true" />}
          title={t("pickStudentTitle")}
          description={t("pickStudentBody")}
        />
      ) : (
        <StudentBillHistoryView studentId={studentId} studentName={studentName} />
      )}
    </div>
  );
}

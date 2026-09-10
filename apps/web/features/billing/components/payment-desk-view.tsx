"use client";

import { EmptyState, Select, domainIcons } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useDirectoryQuery } from "../../reference/api";

import { StudentBillHistoryView } from "./student-bill-history-view";

/**
 * The finance office's front desk: pick a student, see every bill they
 * have this year and the payments recorded against each, record a new
 * payment, void a mistaken one, or print a receipt.
 */
export function PaymentDeskView(): ReactElement {
  const t = useTranslations("app.billing.paymentDesk");
  const students = useDirectoryQuery("student");
  const [studentId, setStudentId] = useState("");

  const studentOptions = (students.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }));

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("pickStudent")}</span>
        <Select
          options={studentOptions}
          value={studentId}
          onValueChange={setStudentId}
          placeholder={t("pickStudentPlaceholder")}
          className="w-72"
        />
      </label>

      {studentId === "" ? (
        <EmptyState
          icon={<domainIcons.billing aria-hidden="true" />}
          title={t("pickStudentTitle")}
          description={t("pickStudentBody")}
        />
      ) : (
        <StudentBillHistoryView studentId={studentId} />
      )}
    </div>
  );
}

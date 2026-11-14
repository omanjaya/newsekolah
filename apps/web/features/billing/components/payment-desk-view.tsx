"use client";

import { EmptyState, Field, domainIcons } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { DirectoryPicker } from "../../reference/components/directory-picker";
import { useDirectoryName } from "../../reference/directory-names";

import { StudentBillHistoryView } from "./student-bill-history-view";

/** A user id as the API issues them; anything else in the URL is ignored. */
const isUserId = (value: string) => /^[\w-]{1,64}$/.test(value);

/**
 * The finance office's front desk: find a student, then see what they
 * owe, record a payment, hand over the receipt or void a mistake. The
 * student is kept in the URL (`?student=`), so a refresh or the back
 * button returns to them and the arrears report can link straight here.
 *
 * The picker searches the directory on the server (debounced, capped at
 * 50 results) instead of loading every student, so it stays fast for a
 * school of thousands.
 */
export function PaymentDeskView(): ReactElement {
  const t = useTranslations("app.billing.paymentDesk");
  const [studentId, setStudentId] = useUrlState<string>("student", isUserId, "");
  const [pickedName, setPickedName] = useState("");
  const person = useDirectoryName(studentId === "" ? undefined : studentId);
  const studentName = person?.name ?? pickedName;

  return (
    <div className="flex flex-col gap-6">
      <Field label={t("pickStudent")} hint={t("pickStudentHint")} className="sm:max-w-md">
        <DirectoryPicker
          profileKind="student"
          value={studentId}
          onValueChange={(id, label) => {
            setPickedName(label);
            setStudentId(id);
          }}
          labels={{
            placeholder: t("pickStudentPlaceholder"),
            searchPlaceholder: t("pickStudentSearchPlaceholder"),
            emptyLabel: t("pickStudentEmpty"),
          }}
        />
      </Field>

      {studentId === "" ? (
        <EmptyState
          icon={<domainIcons.billing />}
          title={t("pickStudentTitle")}
          description={t("pickStudentBody")}
        />
      ) : (
        <StudentBillHistoryView
          key={studentId}
          studentId={studentId}
          studentName={studentName}
          studentNis={person?.nis}
        />
      )}
    </div>
  );
}

"use client";

import { Combobox, EmptyState, domainIcons } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useDirectoryQuery } from "../../reference/api";

import { StudentBillHistoryView } from "./student-bill-history-view";

/**
 * The finance office's front desk: pick a student, see every bill they
 * have this year and the payments recorded against each, record a new
 * payment, void a mistaken one, or print/share a receipt.
 *
 * The picker filters the already-loaded student directory client-side as
 * the counter types (`Combobox` with `shouldFilter={false}`, so it renders
 * exactly the options handed to it) rather than a plain `Select` someone
 * would have to scroll through the whole roster to search -- a school of
 * a few hundred students makes that too slow for a line at the desk. A
 * full async `PersonPicker` (per `docs/05-shared-components.md`) would be
 * the eventual shared version of this; it does not exist yet, and the
 * directory here is small enough that client-side filtering is enough.
 */
export function PaymentDeskView(): ReactElement {
  const t = useTranslations("app.billing.paymentDesk");
  const students = useDirectoryQuery("student");
  const [studentId, setStudentId] = useState("");
  const [search, setSearch] = useState("");

  const allOptions = useMemo(
    () => (students.data?.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [students.data],
  );
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query === "") return allOptions;
    return allOptions.filter((option) => option.label.toLowerCase().includes(query));
  }, [allOptions, search]);
  const studentName = allOptions.find((option) => option.value === studentId)?.label ?? "";

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("pickStudent")}</span>
        <Combobox
          options={filteredOptions}
          value={studentId}
          onValueChange={setStudentId}
          search={search}
          onSearchChange={setSearch}
          placeholder={t("pickStudentPlaceholder")}
          searchPlaceholder={t("pickStudentSearchPlaceholder")}
          emptyLabel={t("pickStudentEmpty")}
          loading={students.isLoading}
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

"use client";

import { Combobox } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { Employee } from "../api";

/**
 * Picks an employee from the roster the page already holds; the shared
 * Combobox narrows it by what is typed, so a school of eighty staff is one
 * search away instead of a long scroll. Wires itself into a surrounding
 * Field.
 */
export function EmployeeCombobox({
  employees,
  value,
  onValueChange,
  invalid,
  className,
}: {
  employees: Employee[];
  value: string;
  onValueChange: (id: string) => void;
  invalid?: boolean;
  className?: string;
}): ReactElement {
  const t = useTranslations("app.staffAttendance.employeePicker");
  return (
    <Combobox
      options={employees.map((employee) => ({ value: employee.id, label: employee.name }))}
      value={value}
      onValueChange={onValueChange}
      placeholder={t("placeholder")}
      searchPlaceholder={t("search")}
      emptyLabel={t("empty")}
      invalid={invalid}
      className={className}
    />
  );
}

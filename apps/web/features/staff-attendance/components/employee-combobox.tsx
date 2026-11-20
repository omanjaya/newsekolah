"use client";

import { Combobox } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { Employee } from "../api";

/**
 * Picks an employee from the list the page already holds (every active
 * teacher and staff member); the shared Combobox narrows it by what is
 * typed, so a school of eighty staff is one search away instead of a long
 * scroll. Someone with no work schedule yet says so under their name.
 * Wires itself into a surrounding Field.
 */
export function EmployeeCombobox({
  employees,
  value,
  onValueChange,
  invalid,
  className,
}: {
  employees: (Employee & { has_schedule?: boolean })[];
  value: string;
  onValueChange: (id: string) => void;
  invalid?: boolean;
  className?: string;
}): ReactElement {
  const t = useTranslations("app.staffAttendance.employeePicker");
  return (
    <Combobox
      options={employees.map((employee) => ({
        value: employee.id,
        label: employee.name,
        ...(employee.has_schedule === false ? { description: t("noSchedule") } : {}),
      }))}
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

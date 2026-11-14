"use client";

import { Combobox } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import type { Employee } from "../api";

/**
 * Picks an employee from the roster the page already holds, filtering it
 * by what is typed, so a school of eighty staff is one search away
 * instead of a long scroll. Wires itself into a surrounding Field.
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
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const options = employees
    .filter((employee) => query === "" || employee.name.toLocaleLowerCase().includes(query))
    .map((employee) => ({ value: employee.id, label: employee.name }));
  // Keep the picked person listed while a search hides them, so the field still names them.
  const picked = employees.find((employee) => employee.id === value);
  if (picked && !options.some((option) => option.value === value)) {
    options.unshift({ value: picked.id, label: picked.name });
  }

  return (
    <Combobox
      options={options}
      value={value}
      onValueChange={onValueChange}
      search={search}
      onSearchChange={setSearch}
      placeholder={t("placeholder")}
      searchPlaceholder={t("search")}
      emptyLabel={t("empty")}
      invalid={invalid}
      className={className}
    />
  );
}

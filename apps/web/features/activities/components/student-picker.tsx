"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { DirectoryPicker } from "../../reference/components/directory-picker";
import { useDirectoryName } from "../../reference/directory-names";

export function StudentName({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.activities.students");
  const student = useDirectoryName(id);
  return <>{student?.name ?? t("unknown")}</>;
}

export function StudentPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  const t = useTranslations("app.activities.students");
  return (
    <DirectoryPicker
      profileKind="student"
      value={value}
      onValueChange={(id) => {
        onChange(id);
      }}
      showUsername
      labels={{
        placeholder: t("choose"),
        searchPlaceholder: t("search"),
        emptyLabel: t("empty"),
        loadingLabel: t("loading"),
      }}
    />
  );
}

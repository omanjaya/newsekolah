"use client";

import { Button, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { IMPORT_FIELDS, type ImportField } from "../import-fields";

const UNMAPPED = "__unmapped__";

/** Step 2: adjust which uploaded column feeds each internal field, defaulted from a best guess. */
export function ImportMappingStep({
  headers,
  mapping,
  onMappingChange,
  onBack,
  onContinue,
}: {
  headers: string[];
  mapping: Partial<Record<ImportField, string>>;
  onMappingChange: (mapping: Partial<Record<ImportField, string>>) => void;
  onBack: () => void;
  onContinue: () => void;
}): ReactElement {
  const t = useTranslations("app.library.import.mapping");
  const tFields = useTranslations("app.library.import.fields");

  const headerOptions = [
    { value: UNMAPPED, label: t("unmapped") },
    ...headers.map((header) => ({ value: header, label: header })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-fg-muted">{t("description")}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {IMPORT_FIELDS.map((field) => (
          <label key={field} className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{tFields(field)}</span>
            <Select
              options={headerOptions}
              value={mapping[field] ?? UNMAPPED}
              onValueChange={(value) => {
                onMappingChange({ ...mapping, [field]: value === UNMAPPED ? undefined : value });
              }}
            />
          </label>
        ))}
      </div>
      <div className="flex justify-between gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onBack}>
          {t("back")}
        </Button>
        <Button type="button" onClick={onContinue} disabled={!mapping.title}>
          {t("continue")}
        </Button>
      </div>
      {!mapping.title && <p className="text-[13px] text-status-absent">{t("titleRequired")}</p>}
    </div>
  );
}

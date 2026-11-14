"use client";

import { Button, Card, Field, FormActions, FormSection, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { IMPORT_FIELDS, type ImportField } from "../import-fields";

const UNMAPPED = "__unmapped__";

/**
 * Step 2 of the import: which uploaded column feeds each library field,
 * filled from a best guess. The title column is required; until it is
 * mapped the title field says so and the way on stays closed.
 */
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
    <Card padding="md">
      <FormSection title={t("heading")} description={t("description")}>
        {IMPORT_FIELDS.map((field) => (
          <Field
            key={field}
            label={tFields(field)}
            required={field === "title"}
            error={field === "title" && !mapping.title ? t("titleRequired") : undefined}
          >
            <Select
              options={headerOptions}
              value={mapping[field] ?? UNMAPPED}
              onValueChange={(value) => {
                onMappingChange({ ...mapping, [field]: value === UNMAPPED ? undefined : value });
              }}
            />
          </Field>
        ))}
      </FormSection>
      <FormActions align="between">
        <Button variant="secondary" onClick={onBack}>
          {t("back")}
        </Button>
        <Button onClick={onContinue} disabled={!mapping.title}>
          {t("continue")}
        </Button>
      </FormActions>
    </Card>
  );
}

"use client";

import { Alert, Button, Card, Field, Select, Stepper, type StepperStep } from "@newsekolah/ui";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import type { AcademicYear } from "../api";

/**
 * The two years of a yearly flow, kept in the URL (`fromYear`, `toYear`)
 * so the flows link to each other. Until the reader picks, they start at
 * the active year and the first year after it, the usual direction.
 */
export function useYearPair(years: readonly AcademicYear[]): {
  fromYearId: string;
  toYearId: string;
  setFromYearId: (id: string) => void;
  setToYearId: (id: string) => void;
} {
  const sorted = [...years].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const active = sorted.find((year) => year.is_active);
  const next = active ? sorted.find((year) => year.starts_on > active.starts_on) : undefined;
  const ids = years.map((year) => year.id);
  const [fromYearId, setFromYearId] = useUrlState("fromYear", ids, active?.id ?? "");
  const [toYearId, setToYearId] = useUrlState("toYear", ids, next?.id ?? "");
  return { fromYearId, toYearId, setFromYearId, setToYearId };
}

/** The numbered progress of a yearly wizard: choose, review, done. */
export function WizardProgress({
  current,
  labels,
}: {
  current: 0 | 1 | 2;
  labels: [string, string, string];
}): ReactElement {
  const steps: StepperStep[] = labels.map((label, index) => ({
    id: String(index),
    label,
    state:
      index < current || current === 2 ? "complete" : index === current ? "current" : "upcoming",
  }));
  return <Stepper steps={steps} currentIndex={current} variant="compact" />;
}

/**
 * Step one of a yearly wizard: the source and destination years side by
 * side (one column on a phone) and the button that builds the preview.
 */
export function YearPairStep({
  years,
  fromYearId,
  toYearId,
  onFromChange,
  onToChange,
  onPreview,
  previewing,
  previewLabel,
  children,
}: {
  years: readonly AcademicYear[];
  fromYearId: string;
  toYearId: string;
  onFromChange: (id: string) => void;
  onToChange: (id: string) => void;
  onPreview: () => void;
  previewing: boolean;
  previewLabel: string;
  /** Extra fields of the flow, after the years. */
  children?: ReactNode;
}): ReactElement {
  const t = useTranslations("app.academic.yearFlow");
  const options = years.map((year) => ({ value: year.id, label: year.label }));
  const same = fromYearId !== "" && fromYearId === toYearId;
  return (
    <Card padding="md">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end">
        <Field label={t("fromYear")} hint={t("fromYearHint")}>
          <Select
            options={options}
            value={fromYearId}
            onValueChange={onFromChange}
            placeholder={t("pickYear")}
          />
        </Field>
        <ArrowRight
          aria-hidden="true"
          className="hidden size-5 text-fg-muted md:mb-[calc(var(--space-6)+0.375rem)] md:block"
        />
        <Field
          label={t("toYear")}
          hint={same ? undefined : t("toYearHint")}
          error={same ? t("sameYearError") : undefined}
        >
          <Select
            options={options}
            value={toYearId}
            onValueChange={onToChange}
            placeholder={t("pickYear")}
          />
        </Field>
      </div>
      {children}
      {years.length < 2 && <Alert tone="info" title={t("needTwoYears")} />}
      <div className="flex justify-end">
        <Button
          className="max-sm:w-full"
          onClick={onPreview}
          loading={previewing}
          disabled={!fromYearId || !toYearId || same}
        >
          {previewLabel}
        </Button>
      </div>
    </Card>
  );
}

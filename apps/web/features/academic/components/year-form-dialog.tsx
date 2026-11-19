"use client";

import {
  Button,
  DateRangePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  useSubmitValidation,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import type { AcademicYear, AcademicYearInput } from "../api";

/**
 * Keyed by the target's identity from the parent (see below) so each open
 * of the dialog gets a fresh `useState` initializer instead of syncing
 * fields through an effect when `target` changes.
 */
function YearForm({
  target,
  onCancel,
  onSubmit,
  pending,
}: {
  target: AcademicYear | "new";
  onCancel: () => void;
  onSubmit: (body: AcademicYearInput) => void;
  pending: boolean;
}): ReactElement {
  const t = useTranslations("app.academic.years");
  const [label, setLabel] = useState(target === "new" ? "" : target.label);
  const [startsOn, setStartsOn] = useState(target === "new" ? "" : target.starts_on);
  const [endsOn, setEndsOn] = useState(target === "new" ? "" : target.ends_on);
  // Simpan stays enabled: pressing it on an empty form marks each missing
  // field and focuses the first (docs/07-ui-ux.md, "Tombol simpan form").
  const { ref, attempted, check } = useSubmitValidation();
  const tValidation = useTranslations("validation");
  const labelMissing = !label.trim();
  const periodMissing = !startsOn || !endsOn;

  return (
    <form
      ref={ref}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!check(!labelMissing && !periodMissing)) return;
        onSubmit({ label: label.trim(), starts_on: startsOn, ends_on: endsOn });
      }}
    >
      <Field
        label={t("form.label")}
        required
        error={attempted && labelMissing ? tValidation("required") : undefined}
      >
        <Input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
          }}
          placeholder={t("form.labelPlaceholder")}
        />
      </Field>
      <Field
        label={t("form.period")}
        required
        hint={t("form.periodHint")}
        error={attempted && periodMissing ? t("form.periodRequired") : undefined}
      >
        <DateRangePicker
          value={startsOn ? { from: startsOn, to: endsOn } : null}
          onChange={(range) => {
            setStartsOn(range.from);
            setEndsOn(range.to);
          }}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("form.cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("form.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function YearFormDialog({
  target,
  onOpenChange,
  onSubmit,
  pending,
}: {
  target: AcademicYear | "new" | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: AcademicYearInput) => void;
  pending: boolean;
}): ReactElement {
  const t = useTranslations("app.academic.years");

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent title={target === "new" ? t("add") : t("editTitle")} size="md">
        {target !== null && (
          <YearForm
            key={target === "new" ? "new" : target.id}
            target={target}
            pending={pending}
            onSubmit={onSubmit}
            onCancel={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

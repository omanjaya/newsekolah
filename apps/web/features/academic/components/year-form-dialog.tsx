"use client";

import { Button, Dialog, DialogContent, Input } from "@newsekolah/ui";
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

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim() || !startsOn || !endsOn) return;
        onSubmit({ label: label.trim(), starts_on: startsOn, ends_on: endsOn });
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("form.label")}</span>
        <Input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
          }}
          placeholder={t("form.labelPlaceholder")}
          required
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("form.startsOn")}</span>
          <Input
            type="date"
            value={startsOn}
            onChange={(e) => {
              setStartsOn(e.target.value);
            }}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("form.endsOn")}</span>
          <Input
            type="date"
            value={endsOn}
            onChange={(e) => {
              setEndsOn(e.target.value);
            }}
            required
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("form.cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("form.save")}
        </Button>
      </div>
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
      <DialogContent title={target === "new" ? t("add") : t("edit")}>
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

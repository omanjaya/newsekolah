"use client";

import { Button, SegmentedControl, Stepper, cn } from "@newsekolah/ui";
import { FileSpreadsheet, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useId, useRef } from "react";

/**
 * Pieces both import screens (users, class placement) share, so the two
 * read as one flow: the numbered steps, the file field and the "only
 * problem rows" switch above the preview.
 */

export type ImportStage = "upload" | "preview" | "done";

export function ImportProgress({ stage }: { stage: ImportStage }): ReactElement {
  const t = useTranslations("app.school.importFlow");
  const index = stage === "upload" ? 0 : stage === "preview" ? 1 : 2;
  return (
    <Stepper
      variant="compact"
      currentIndex={index}
      steps={(["upload", "preview", "done"] as const).map((id, i) => ({
        id,
        label: t(`steps.${id}`),
        state: i < index || stage === "done" ? "complete" : i === index ? "current" : "upcoming",
      }))}
    />
  );
}

/**
 * A spreadsheet picker: one labelled button (44px under a finger) that
 * opens the file dialog, and the chosen file's name beside it. The input
 * itself stays for keyboard and assistive tech.
 */
export function ImportFileField({
  label,
  fileName,
  loading,
  disabled,
  onFile,
  accept = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  className,
}: {
  label: string;
  fileName?: string | null;
  loading?: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
  /** File types the picker offers; a spreadsheet by default. */
  accept?: string;
  className?: string;
}): ReactElement {
  const t = useTranslations("app.school.importFlow");
  const input = useRef<HTMLInputElement>(null);
  const nameId = useId();
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <Button
        variant="secondary"
        icon={<Upload />}
        loading={loading}
        disabled={disabled}
        aria-describedby={fileName ? nameId : undefined}
        onClick={() => {
          input.current?.click();
        }}
      >
        {fileName ? t("chooseOther") : label}
      </Button>
      <span id={nameId} className="flex min-w-0 items-center gap-1.5 text-body-sm text-fg-muted">
        <FileSpreadsheet className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{fileName ?? t("noFile")}</span>
      </span>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        aria-label={label}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

/** "All rows" or "only the rows with a problem", with their counts. */
export function ImportRowFilter({
  value,
  onValueChange,
  total,
  problems,
}: {
  value: "all" | "problems";
  onValueChange: (value: "all" | "problems") => void;
  total: number;
  problems: number;
}): ReactElement {
  const t = useTranslations("app.school.importFlow");
  return (
    <SegmentedControl
      aria-label={t("showRows")}
      options={[
        { value: "all", label: t("allRows"), count: total },
        { value: "problems", label: t("problemRows"), count: problems, disabled: problems === 0 },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}

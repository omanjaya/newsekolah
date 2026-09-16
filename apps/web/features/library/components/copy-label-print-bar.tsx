"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, useToast } from "@newsekolah/ui";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { printLibraryCopyLabelsBatch } from "../copies-api";

const MAX_BATCH = 500;

/**
 * Shown once at least one copy is selected: prints the A4 label sheet for
 * the batch in the order the copies were selected.
 */
export function CopyLabelPrintBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}): ReactElement | null {
  const t = useTranslations("app.library.copyLabels");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const [printing, setPrinting] = useState(false);

  if (selectedIds.length === 0) return null;
  const overLimit = selectedIds.length > MAX_BATCH;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-accent/30 bg-accent/5 p-3 text-[13px]">
      <span className="text-fg">
        {overLimit
          ? t("overLimit", { count: selectedIds.length, max: MAX_BATCH })
          : t("selectedCount", { count: selectedIds.length })}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            onClear();
          }}
        >
          {t("clearSelection")}
        </Button>
        <Button
          size="sm"
          icon={<Printer />}
          loading={printing}
          disabled={overLimit}
          onClick={() => {
            setPrinting(true);
            printLibraryCopyLabelsBatch(selectedIds)
              .catch((error: unknown) => {
                toast.error(
                  error instanceof ApiError
                    ? apiErrorMessage(error.code)
                    : apiErrorMessage("UNKNOWN"),
                );
              })
              .finally(() => {
                setPrinting(false);
              });
          }}
        >
          {t("printLabels")}
        </Button>
      </div>
    </div>
  );
}

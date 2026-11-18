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
 * The label sheet for the selected copies, as a table bulk action (the
 * table's own selection bar shows the count and the clear button): prints
 * the A4 sheet in the order the copies were selected, up to 500 at once.
 */
export function CopyLabelPrintAction({ selectedIds }: { selectedIds: string[] }): ReactElement {
  const t = useTranslations("app.library.copyLabels");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const [printing, setPrinting] = useState(false);
  const overLimit = selectedIds.length > MAX_BATCH;

  return (
    <>
      {overLimit && (
        <span className="text-caption">
          {t("overLimit", { count: selectedIds.length, max: MAX_BATCH })}
        </span>
      )}
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
    </>
  );
}

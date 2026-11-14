"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, useToast } from "@newsekolah/ui";
import { CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { printLibraryMemberCardsBatch } from "../members-api";

const MAX_BATCH = 500;

/**
 * A table bulk action for the selected members: prints the A4 card sheet
 * for the batch in the order the members were selected (mirrors
 * copy-label-print-bar.tsx for copy labels).
 */
export function MemberCardPrintAction({ selectedIds }: { selectedIds: string[] }): ReactElement {
  const t = useTranslations("app.library.memberCards");
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
        icon={<CreditCard />}
        loading={printing}
        disabled={overLimit}
        onClick={() => {
          setPrinting(true);
          printLibraryMemberCardsBatch({ memberIds: selectedIds })
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
        {t("printCards")}
      </Button>
    </>
  );
}

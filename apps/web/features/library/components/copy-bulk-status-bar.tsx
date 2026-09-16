"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, ConfirmDialog, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type LibraryCopyStatus, useBulkSetLibraryCopyStatusMutation } from "../copies-api";

const STATUSES: LibraryCopyStatus[] = [
  "available",
  "damaged",
  "lost",
  "in_repair",
  "processing",
  "donated",
  "reserve_stack",
  "unknown",
];

/**
 * Shown once at least one copy is selected: sets a single manual status on
 * the whole batch. A copy on loan is skipped rather than failing the whole
 * request, and the result names how many were skipped.
 */
export function CopyBulkStatusBar({
  selectedIds,
  onDone,
}: {
  selectedIds: string[];
  onDone: () => void;
}): ReactElement | null {
  const t = useTranslations("app.library.copiesBrowser.bulkStatus");
  const tStatus = useTranslations("app.library.copiesBrowser.status");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const bulkSetStatus = useBulkSetLibraryCopyStatusMutation();

  const [status, setStatus] = useState<LibraryCopyStatus | "">("");
  const [confirming, setConfirming] = useState(false);

  if (selectedIds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-surface p-3 text-[13px]">
      <span className="text-fg">{t("label")}</span>
      <Select
        options={STATUSES.map((value) => ({ value, label: tStatus(value) }))}
        value={status}
        onValueChange={(value) => {
          setStatus(value as LibraryCopyStatus);
        }}
        placeholder={t("statusPlaceholder")}
        className="w-44"
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={!status}
        onClick={() => {
          setConfirming(true);
        }}
      >
        {t("apply")}
      </Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("confirmTitle")}
        description={
          status ? t("confirmBody", { count: selectedIds.length, status: tStatus(status) }) : ""
        }
        confirming={bulkSetStatus.isPending}
        onConfirm={async () => {
          if (!status) return;
          try {
            const result = await bulkSetStatus.mutateAsync({
              copy_ids: selectedIds,
              status,
            });
            const skipped = selectedIds.length - result.data.length;
            if (skipped > 0) {
              toast.success(t("appliedWithSkipped", { count: result.data.length, skipped }));
            } else {
              toast.success(t("applied", { count: result.data.length }));
            }
            setConfirming(false);
            setStatus("");
            onDone();
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          }
        }}
      />
    </div>
  );
}

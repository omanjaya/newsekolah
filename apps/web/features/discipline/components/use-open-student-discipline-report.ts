"use client";

import { ApiError } from "@newsekolah/api-client";
import { useToast } from "@newsekolah/ui";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useStudentDisciplineReportMutation } from "../api";

/**
 * Opens one student's printable discipline PDF in a new tab, with a toast
 * on failure. A page header passes it as a secondary action
 * (`{ label, icon: <Printer />, disabled: pending, onSelect: () => open(id) }`),
 * so on a phone it joins the header's menu. Shared by the student profile
 * and the discipline record page.
 */
export function useOpenStudentDisciplineReport(): {
  open: (studentId: string) => void;
  pending: boolean;
} {
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const report = useStudentDisciplineReportMutation();
  return {
    pending: report.isPending,
    open: (studentId) => {
      report.mutate(studentId, {
        onSuccess: (result) => {
          window.open(result.url, "_blank", "noopener,noreferrer");
        },
        onError: (err) => {
          toast.error(
            err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      });
    },
  };
}

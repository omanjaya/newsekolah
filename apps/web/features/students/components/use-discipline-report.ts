"use client";

import { ApiError } from "@newsekolah/api-client";
import { useToast } from "@newsekolah/ui";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useStudentDisciplineReportMutation } from "../../discipline/api";

/**
 * Opens one student's printable discipline PDF in a new tab, for the
 * profile header's overflow action. The discipline record page has the
 * same flow behind its own button.
 */
export function useOpenDisciplineReport(): {
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

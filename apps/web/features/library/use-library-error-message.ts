"use client";

import { ApiError } from "@newsekolah/api-client";
import { useTranslations } from "next-intl";

import { useApiErrorMessage } from "../../lib/i18n/api-error-message";

/**
 * Library-specific API error codes that the shared `errors.*` catalog does
 * not cover; each has a message under `app.library.errors`.
 */
const LIBRARY_ERROR_CODES = [
  "LIBRARY_TITLE_HAS_COPIES",
  "LIBRARY_CONTROL_NUMBER_EXISTS",
  "LIBRARY_COPY_ACCESSION_EXISTS",
  "LIBRARY_COPY_HAS_LOAN_HISTORY",
  "LIBRARY_COPY_STATUS_NOT_MANUAL",
  "LIBRARY_MASTER_DATA_NOT_FOUND",
  "LIBRARY_MASTER_DATA_CODE_EXISTS",
  "LIBRARY_MASTER_DATA_IN_USE",
  "LIBRARY_MODULE_DISABLED",
] as const;

type LibraryErrorCode = (typeof LIBRARY_ERROR_CODES)[number];

function isLibraryErrorCode(code: string): code is LibraryErrorCode {
  return (LIBRARY_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Turns any thrown mutation error into a readable sentence: library codes
 * get their own wording, everything else falls back to the shared catalog.
 */
export function useLibraryErrorMessage(): (error: unknown) => string {
  const t = useTranslations("app.library.errors");
  const apiErrorMessage = useApiErrorMessage();
  return (error: unknown) => {
    if (!(error instanceof ApiError)) return apiErrorMessage("UNKNOWN");
    return isLibraryErrorCode(error.code) ? t(error.code) : apiErrorMessage(error.code);
  };
}

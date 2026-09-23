"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Alert, BarcodeScannerField, Button, PageHeader, domainIcons } from "@newsekolah/ui";
import type { BarcodeScanEvent } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { decodeScanPayload, useScanClassroomEntryMutation } from "../api";

interface ScanResult {
  teacherName: string;
  scannedAt: string;
}

/**
 * The student's web counterpart to the mobile app's classroom-entry scan
 * (apps/mobile/src/app/scan.tsx): point the phone camera at the teacher's
 * QR (displayed from `DutyView`) to record self-attendance for the
 * running session. Reuses `BarcodeScannerField` from packages/ui -- the
 * same scanner the library circulation desk uses -- which already covers
 * a hardware scanner, the browser's `BarcodeDetector` camera, and manual
 * entry, so this screen only needs to wire the classroom-entry mutation.
 */
export function ClassroomEntryScanView(): ReactElement {
  const t = useTranslations("app.permits.classroomEntry");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const apiErrorMessage = useApiErrorMessage();
  const scan = useScanClassroomEntryMutation();

  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(token: string) {
    setError(null);
    scan.mutate(
      { token },
      {
        onSuccess: (data) => {
          setResult({ teacherName: data.teacher_name, scannedAt: data.scanned_at });
        },
        onError: (err) => {
          setError(
            err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  function handleScan(event: BarcodeScanEvent) {
    const { token } = decodeScanPayload(event.code);
    submit(token);
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="max-w-2xl text-[13px] text-fg-muted">{t("intro")}</p>

      {me && me.profile_kind !== "student" ? (
        <Alert variant="info" title={t("studentsOnlyTitle")} className="max-w-xl">
          {t("studentsOnlyBody")}
        </Alert>
      ) : result ? (
        <Alert
          variant="info"
          title={t("successTitle")}
          icon={<domainIcons.qr aria-hidden="true" />}
        >
          <p>
            {t("successBody", {
              teacher: result.teacherName,
              time: formatDateTime(result.scannedAt, { locale, timeZone: me?.tenant.timezone }),
            })}
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setResult(null);
              setError(null);
            }}
          >
            {t("scanAgain")}
          </Button>
        </Alert>
      ) : (
        <div className="flex max-w-xl flex-col gap-4">
          {error && (
            <Alert variant="warning" title={t("errorTitle")}>
              {error}
            </Alert>
          )}
          <BarcodeScannerField
            label={t("scanLabel")}
            placeholder={t("placeholder")}
            submitLabel={t("submit")}
            cameraLabel={t("cameraLabel")}
            onScan={handleScan}
            disabled={scan.isPending}
            stretch
          />
        </div>
      )}
    </div>
  );
}

"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import {
  Button,
  EmptyState,
  Scanner,
  domainIcons,
  type BarcodeScanEvent,
  type ScannerResultValue,
} from "@newsekolah/ui";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { decodeScanPayload, useScanClassroomEntryMutation } from "../../permits/api";

/**
 * The student's classroom entry: point the phone at the QR the teacher
 * shows at the front of the class (from the duty screen) to record their
 * own attendance for the running lesson. The shared Scanner puts the
 * camera first, in a framed viewfinder, says each result large under it
 * (green with the teacher and time, red with the reason), and keeps typing
 * the code under the QR as the fallback.
 */
export function ClassroomEntryView(): ReactElement {
  const t = useTranslations("app.permits.classroomEntry");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const apiErrorMessage = useApiErrorMessage();
  const scan = useScanClassroomEntryMutation();
  const [result, setResult] = useState<ScannerResultValue | null>(null);
  const scans = useRef(0);

  async function handleScan(event: BarcodeScanEvent): Promise<boolean> {
    const { token } = decodeScanPayload(event.code);
    scans.current += 1;
    try {
      const data = await scan.mutateAsync({ token });
      setResult({
        key: scans.current,
        tone: "success",
        title: t("successTitle"),
        description: t("successBody", {
          teacher: data.teacher_name,
          time: formatTime(data.scanned_at, { locale, timeZone: me?.tenant.timezone }),
        }),
      });
      return true;
    } catch (err) {
      setResult({
        key: scans.current,
        tone: "danger",
        title: t("errorTitle"),
        description:
          err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
      });
      return false;
    }
  }

  if (me && me.profile_kind !== "student") {
    return (
      <AppPage variant="narrow">
        <EmptyState
          icon={<domainIcons.qr aria-hidden="true" />}
          title={t("studentsOnlyTitle")}
          description={t("studentsOnlyBody")}
          action={
            <Button asChild variant="secondary">
              <Link href="/dashboard">{t("backHome")}</Link>
            </Button>
          }
        />
      </AppPage>
    );
  }

  return (
    <AppPage variant="narrow" description={t("intro")}>
      <Scanner
        onScan={handleScan}
        result={result}
        disabled={scan.isPending}
        manualLabel={t("scanLabel")}
        manualPlaceholder={t("placeholder")}
        submitLabel={t("submit")}
      >
        {/* The teacher's QR prints no code to type: the field is for a
            hardware scanner, and a student who cannot scan is marked by
            the teacher on the class roster. */}
        <p className="text-body-sm text-fg-muted">{t("cannotScanHint")}</p>
      </Scanner>
    </AppPage>
  );
}

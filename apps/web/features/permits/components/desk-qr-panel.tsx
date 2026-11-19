"use client";

import { ApiError } from "@newsekolah/api-client";
import { QrPanel, QrPanelSkeleton, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type ScanPurpose, encodeScanPayload, useIssueScanTokenMutation } from "../api";
import { type DeskApproval, useDeskApprovals } from "../realtime";

/** The duty desk's QRs: none is bound to one student, so one code serves whoever walks up. */
export type DeskPurpose = Extract<
  ScanPurpose,
  "classroom_entry" | "late_arrival" | "approve_stage"
>;

/**
 * A desk QR for one purpose (docs/07-ui-ux.md section 4, "Guru piket": masuk
 * kelas, terlambat, and izin keluar tahap piket). Each code is a single-use
 * token bound to no student, renewed by itself when it expires. For
 * approve_stage the token is the picket stage's unbound approval: the
 * student's own scan names their permit, and the server only lets it
 * approve an exit permit's any_teacher stage. Because that QR names nobody,
 * the server tells its teacher who scanned it (`exit_permit.desk_approved`):
 * the panel then shows the next student a fresh code at once, instead of a
 * spent one until it expires, and hands the approval to `onApproved` for
 * the desk's log. No code is printed under the QR: the raw token is 43
 * characters and nobody types that; a student without a camera is recorded
 * by hand under "Catat manual".
 */
export function DeskQrPanel({
  purpose,
  label,
  help,
  onApproved,
}: {
  purpose: DeskPurpose;
  label: string;
  help: string;
  /** approve_stage only: a student's scan of this desk's QR approved their stage. */
  onApproved?: (approval: DeskApproval) => void;
}): ReactElement {
  const tQr = useTranslations("app.permits.qr");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const issue = useIssueScanTokenMutation();

  useEffect(() => {
    issue.mutate({ purpose });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mint once per purpose on mount
  }, [purpose]);

  function renew() {
    issue.mutate(
      { purpose },
      {
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  useDeskApprovals(
    purpose === "approve_stage"
      ? (approval) => {
          renew();
          onApproved?.(approval);
        }
      : undefined,
  );

  return (
    <div className="flex flex-col gap-3">
      {issue.data ? (
        <QrPanel
          size="lg"
          autoRenew
          label={label}
          payload={encodeScanPayload(purpose, "", issue.data.token)}
          code=""
          expiresAt={issue.data.expires_at}
          onRenew={renew}
          renewing={issue.isPending}
          expiredLabel={tQr("expired")}
          expiresInLabel={(seconds) => tQr("expiresIn", { seconds })}
          renewLabel={tQr("renew")}
        />
      ) : issue.isError ? (
        <QueryError retry={renew} error={issue.error} />
      ) : (
        <QrPanelSkeleton size="lg" />
      )}
      <p className="text-body-sm text-fg-muted">{help}</p>
    </div>
  );
}

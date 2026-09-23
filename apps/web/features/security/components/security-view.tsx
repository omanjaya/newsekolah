"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Badge, Button, PageHeader, Skeleton, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  useDisableMfaMutation,
  useMfaStatusQuery,
  useRegenerateMfaRecoveryCodesMutation,
  useStartMfaEnrolmentMutation,
} from "../api";

import { EnrollDialog } from "./enroll-dialog";
import { MfaCodeDialog } from "./mfa-code-dialog";
import { PasskeysSection } from "./passkeys-section";
import { RecoveryCodesDialog } from "./recovery-codes-dialog";

const LOW_RECOVERY_CODES_THRESHOLD = 2;

type ActiveDialog = "enroll" | "disable" | "regenerate" | null;

/**
 * Two-factor authentication settings (docs/08-security.md section 2:
 * "TOTP wajib untuk role operator platform dan admin sekolah; opsional
 * guru"). The started-but-not-yet-confirmed enrolment and any freshly
 * issued recovery codes live only in this component's memory: neither is
 * refetchable, and the API returns each exactly once.
 */
export function SecurityView(): ReactElement {
  const t = useTranslations("app.security");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const status = useMfaStatusQuery();
  const startEnrolment = useStartMfaEnrolmentMutation();
  const disableMfa = useDisableMfaMutation();
  const regenerateCodes = useRegenerateMfaRecoveryCodesMutation();

  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [revealedCodes, setRevealedCodes] = useState<string[] | null>(null);

  async function handleEnableClick() {
    try {
      await startEnrolment.mutateAsync();
      setActiveDialog("enroll");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  function handleEnrollConfirmed(recoveryCodes: string[]) {
    setActiveDialog(null);
    toast.success(t("toasts.enabled"));
    setRevealedCodes(recoveryCodes);
  }

  async function handleDisableConfirm(code: string) {
    await disableMfa.mutateAsync(code);
    setActiveDialog(null);
    toast.success(t("toasts.disabled"));
  }

  async function handleRegenerateConfirm(code: string) {
    const result = await regenerateCodes.mutateAsync(code);
    setActiveDialog(null);
    setRevealedCodes(result.recovery_codes);
  }

  if (status.isError && !status.data)
    return <QueryError retry={() => status.refetch()} className="m-4" />;

  if (status.isLoading || !status.data) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
        <p className="text-[13px] text-fg-muted">{t("description")}</p>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const data = status.data;
  const showLowCodesWarning =
    data.confirmed && data.remaining_recovery_codes <= LOW_RECOVERY_CODES_THRESHOLD;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4 md:max-w-2xl">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-medium text-fg">{t("status.title")}</h2>
            <Badge variant={data.confirmed ? "accent" : "neutral"}>
              {data.confirmed ? t("status.enabledBadge") : t("status.disabledBadge")}
            </Badge>
          </div>
          <p className="text-[13px] text-fg-muted">
            {data.confirmed ? t("status.enabledBody") : t("status.disabledBody")}
          </p>
          {data.confirmed && (
            <p className="text-[13px] text-fg-muted">
              {t("status.recoveryCodesRemaining", { count: data.remaining_recovery_codes })}
            </p>
          )}
        </div>

        {showLowCodesWarning && <Alert variant="warning" title={t("status.recoveryCodesLow")} />}

        <div className="flex flex-wrap gap-2">
          {data.confirmed ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setActiveDialog("regenerate");
                }}
              >
                {t("status.regenerateAction")}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setActiveDialog("disable");
                }}
              >
                {t("status.disableAction")}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              loading={startEnrolment.isPending}
              onClick={() => void handleEnableClick()}
            >
              {t("status.enableAction")}
            </Button>
          )}
        </div>
      </section>

      <PasskeysSection />

      {activeDialog === "enroll" && startEnrolment.data && (
        <EnrollDialog
          enrolment={startEnrolment.data}
          onClose={() => {
            setActiveDialog(null);
          }}
          onConfirmed={handleEnrollConfirmed}
        />
      )}

      {activeDialog === "disable" && (
        <MfaCodeDialog
          title={t("disable.dialogTitle")}
          description={t("disable.dialogBody")}
          codeLabel={t("disable.codeLabel")}
          confirmLabel={t("disable.confirm")}
          destructive
          onClose={() => {
            setActiveDialog(null);
          }}
          onConfirm={handleDisableConfirm}
        />
      )}

      {activeDialog === "regenerate" && (
        <MfaCodeDialog
          title={t("regenerate.dialogTitle")}
          description={t("regenerate.dialogBody")}
          codeLabel={t("regenerate.codeLabel")}
          confirmLabel={t("regenerate.confirm")}
          onClose={() => {
            setActiveDialog(null);
          }}
          onConfirm={handleRegenerateConfirm}
        />
      )}

      {revealedCodes && (
        <RecoveryCodesDialog
          codes={revealedCodes}
          onClose={() => {
            setRevealedCodes(null);
          }}
        />
      )}
    </div>
  );
}

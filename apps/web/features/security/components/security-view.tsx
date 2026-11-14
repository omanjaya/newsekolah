"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  IconCircle,
  SkeletonForm,
  useToast,
} from "@newsekolah/ui";
import { ChevronRight, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { SettingsPage } from "../../settings/components/settings-page";
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
const NAV_KEY = "settings-security";

type ActiveDialog = "enroll" | "disable" | "regenerate" | null;

/**
 * The reader's own account security: two-step verification and passkeys,
 * with the password and open sessions one step away on the profile's
 * security tab (docs/08-security.md section 2: "TOTP wajib untuk role
 * operator platform dan admin sekolah; opsional guru"). The
 * started-but-not-yet-confirmed enrolment and any freshly issued recovery
 * codes live only in this component's memory: neither is refetchable, and
 * the API returns each exactly once.
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

  const data = status.data;
  const showLowCodesWarning =
    data?.confirmed === true && data.remaining_recovery_codes <= LOW_RECOVERY_CODES_THRESHOLD;

  return (
    <SettingsPage navKey={NAV_KEY} description={t("pageDescription")}>
      <Card>
        <CardHeader
          action={
            data && (
              <Badge tone={data.confirmed ? "success" : "neutral"}>
                {data.confirmed ? t("status.enabledBadge") : t("status.disabledBadge")}
              </Badge>
            )
          }
        >
          <CardTitle as="h2">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        {status.isError && !data ? (
          <div className="px-5 pb-5">
            <QueryError retry={() => status.refetch()} error={status.error} />
          </div>
        ) : status.isLoading || !data ? (
          <SkeletonForm fields={1} actions={false} className="px-5 pb-5" />
        ) : (
          <>
            <div className="flex flex-col gap-3 px-5">
              <p className="text-body-sm text-fg">
                {data.confirmed ? t("status.enabledBody") : t("status.disabledBody")}
              </p>
              {data.confirmed && (
                <p className="text-body-sm text-fg-muted">
                  {t("status.recoveryCodesRemaining", { count: data.remaining_recovery_codes })}
                </p>
              )}
              {showLowCodesWarning && <Alert tone="warning" title={t("status.recoveryCodesLow")} />}
            </div>
            <CardFooter className="flex-wrap">
              {data.confirmed ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setActiveDialog("regenerate");
                    }}
                  >
                    {t("status.regenerateAction")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-danger"
                    onClick={() => {
                      setActiveDialog("disable");
                    }}
                  >
                    {t("status.disableAction")}
                  </Button>
                </>
              ) : (
                <Button
                  icon={<ShieldCheck />}
                  loading={startEnrolment.isPending}
                  onClick={() => void handleEnableClick()}
                >
                  {t("status.enableAction")}
                </Button>
              )}
            </CardFooter>
          </>
        )}
      </Card>

      <PasskeysSection />

      <Card interactive asChild>
        <Link href="/profile?tab=security" className="flex items-center gap-3 p-5">
          <IconCircle tone="neutral">
            <KeyRound />
          </IconCircle>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-heading text-fg">{t("passwordAndSessions.title")}</span>
            <span className="text-body-sm text-fg-muted">{t("passwordAndSessions.body")}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
        </Link>
      </Card>

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
    </SettingsPage>
  );
}

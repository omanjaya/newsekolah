"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Switch,
  useToast,
} from "@newsekolah/ui";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type PlatformOperatorAlertChatCandidate,
  type PlatformOperatorAlertSettings,
  useDetectOperatorAlertChatMutation,
  useOperatorAlertSettingsQuery,
  useTestOperatorAlertMutation,
  useUpdateOperatorAlertSettingsMutation,
} from "../api";

interface FormState {
  enabled: boolean;
  telegramToken: string;
  telegramTokenClear: boolean;
  telegramChatId: string;
  checkHealth: boolean;
  checkContainers: boolean;
  checkDisk: boolean;
  checkMemory: boolean;
  checkBackup: boolean;
  checkCertificate: boolean;
  checkErrors5xx: boolean;
  diskThresholdPercent: string;
  memoryThresholdMb: string;
  backupMaxAgeHours: string;
  certExpiryDays: string;
  dailySummaryEnabled: boolean;
  dailySummaryHour: string;
}

const CHECK_FIELDS = [
  ["checkHealth", "checks.health"],
  ["checkContainers", "checks.containers"],
  ["checkDisk", "checks.disk"],
  ["checkMemory", "checks.memory"],
  ["checkBackup", "checks.backup"],
  ["checkCertificate", "checks.certificate"],
  ["checkErrors5xx", "checks.errors5xx"],
] as const;

function formFromSettings(settings: PlatformOperatorAlertSettings): FormState {
  return {
    enabled: settings.enabled,
    telegramToken: "",
    telegramTokenClear: false,
    telegramChatId: settings.telegram_chat_id,
    checkHealth: settings.check_health,
    checkContainers: settings.check_containers,
    checkDisk: settings.check_disk,
    checkMemory: settings.check_memory,
    checkBackup: settings.check_backup,
    checkCertificate: settings.check_certificate,
    checkErrors5xx: settings.check_errors_5xx,
    diskThresholdPercent: String(settings.disk_threshold_percent),
    memoryThresholdMb: String(settings.memory_threshold_mb),
    backupMaxAgeHours: String(settings.backup_max_age_hours),
    certExpiryDays: String(settings.cert_expiry_days),
    dailySummaryEnabled: settings.daily_summary_enabled,
    dailySummaryHour: String(settings.daily_summary_hour),
  };
}

function toInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function OperatorAlertsView(): ReactElement {
  const t = useTranslations("app.platform.operatorAlerts");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const query = useOperatorAlertSettingsQuery();
  const save = useUpdateOperatorAlertSettingsMutation();
  const detect = useDetectOperatorAlertChatMutation();
  const test = useTestOperatorAlertMutation();

  const [form, setForm] = useState<FormState | null>(null);
  // Tracks which loaded settings the form was last seeded from, so a fresh
  // GET result (e.g. after a save) re-seeds the form exactly once, set
  // during render rather than in an effect -- same pattern
  // messaging/provider-config-view.tsx uses.
  const [seededFrom, setSeededFrom] = useState<PlatformOperatorAlertSettings | undefined>(
    undefined,
  );
  const [showToken, setShowToken] = useState(false);
  const [candidates, setCandidates] = useState<PlatformOperatorAlertChatCandidate[] | null>(null);

  const settings = query.data;
  if (settings && settings !== seededFrom) {
    setSeededFrom(settings);
    setForm(formFromSettings(settings));
  }

  function onError(error: unknown) {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  async function handleSave() {
    if (!form) return;
    try {
      await save.mutateAsync({
        enabled: form.enabled,
        telegram_token: form.telegramToken || undefined,
        telegram_token_clear: form.telegramTokenClear || undefined,
        telegram_chat_id: form.telegramChatId,
        check_health: form.checkHealth,
        check_containers: form.checkContainers,
        check_disk: form.checkDisk,
        check_memory: form.checkMemory,
        check_backup: form.checkBackup,
        check_certificate: form.checkCertificate,
        check_errors_5xx: form.checkErrors5xx,
        disk_threshold_percent: toInt(form.diskThresholdPercent, 85),
        memory_threshold_mb: toInt(form.memoryThresholdMb, 512),
        backup_max_age_hours: toInt(form.backupMaxAgeHours, 30),
        cert_expiry_days: toInt(form.certExpiryDays, 14),
        daily_summary_enabled: form.dailySummaryEnabled,
        daily_summary_hour: toInt(form.dailySummaryHour, 7),
      });
      toast.success(t("saved"));
    } catch (error) {
      onError(error);
    }
  }

  async function handleDetect() {
    if (!form) return;
    try {
      const result = await detect.mutateAsync(form.telegramToken);
      setCandidates(result.data);
    } catch (error) {
      onError(error);
    }
  }

  async function handleTest() {
    try {
      const result = await test.mutateAsync();
      if (result.success) {
        toast.success(t("test.success"));
      } else {
        toast.error(result.error ?? t("test.failure"));
      }
    } catch (error) {
      onError(error);
    }
  }

  if (query.isError) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
        <Alert variant="warning" title={t("loadError")} />
      </div>
    );
  }

  if (query.isLoading || !form) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("subtitle")}</p>

      <div className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
        <div>
          <h2 className="text-[16px] font-medium text-fg">{t("botSetup.title")}</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-fg-muted">
            <li>{t("botSetup.step1")}</li>
            <li>{t("botSetup.step2")}</li>
            <li>{t("botSetup.step3")}</li>
          </ol>
        </div>

        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("token.label")}</span>
          <div className="relative">
            <Input
              type={showToken ? "text" : "password"}
              className="pr-11"
              value={form.telegramToken}
              onChange={(e) => {
                const value = e.target.value;
                setForm((f) => (f ? { ...f, telegramToken: value, telegramTokenClear: false } : f));
              }}
              placeholder={
                settings?.telegram_token_set && !form.telegramTokenClear
                  ? settings.telegram_token_hint
                    ? `${t("token.placeholderSet")} (${settings.telegram_token_hint})`
                    : t("token.placeholderSet")
                  : t("token.placeholderUnset")
              }
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-fg-muted"
              aria-label={showToken ? t("token.hide") : t("token.show")}
              onClick={() => {
                setShowToken((visible) => !visible);
              }}
            >
              {showToken ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </div>
          {settings?.telegram_token_set ? (
            <button
              type="button"
              className="self-start text-[13px] text-fg-muted underline"
              onClick={() => {
                setForm((f) => (f ? { ...f, telegramToken: "", telegramTokenClear: true } : f));
              }}
            >
              {form.telegramTokenClear ? t("token.removed") : t("token.remove")}
            </button>
          ) : null}
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleDetect()}
            disabled={detect.isPending}
          >
            {detect.isPending ? t("detect.loading") : t("detect.button")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleTest()}
            disabled={test.isPending}
          >
            {t("test.button")}
          </Button>
        </div>

        {candidates ? (
          candidates.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("detect.empty")}</p>
          ) : (
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium text-fg">{t("chatId.picker")}</span>
              <Select
                value={form.telegramChatId}
                onValueChange={(value) => {
                  setForm((f) => (f ? { ...f, telegramChatId: value } : f));
                }}
                options={candidates.map((c) => ({
                  value: String(c.id),
                  label: `${c.title} (${c.type})`,
                }))}
              />
            </label>
          )
        ) : null}

        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("chatId.label")}</span>
          <Input
            value={form.telegramChatId}
            placeholder={t("chatId.placeholder")}
            onChange={(e) => {
              const value = e.target.value;
              setForm((f) => (f ? { ...f, telegramChatId: value } : f));
            }}
          />
        </label>
      </div>

      <div className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
        <label className="flex items-center gap-2 text-[13px]">
          <Switch
            checked={form.enabled}
            onCheckedChange={(checked) => {
              setForm((f) => (f ? { ...f, enabled: checked } : f));
            }}
          />
          <span className="font-medium text-fg">{t("enabled")}</span>
        </label>

        <div>
          <h3 className="text-[14px] font-medium text-fg">{t("checks.title")}</h3>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CHECK_FIELDS.map(([key, labelKey]) => (
              <label key={key} className="flex items-center gap-2 text-[13px]">
                <Switch
                  checked={form[key]}
                  onCheckedChange={(checked) => {
                    setForm((f) => (f ? { ...f, [key]: checked } : f));
                  }}
                />
                <span className="text-fg">{t(labelKey)}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-[14px] font-medium text-fg">{t("thresholds.title")}</h3>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-fg-muted">{t("thresholds.diskPercent")}</span>
              <Input
                type="number"
                min={1}
                max={100}
                value={form.diskThresholdPercent}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((f) => (f ? { ...f, diskThresholdPercent: value } : f));
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-fg-muted">{t("thresholds.memoryMb")}</span>
              <Input
                type="number"
                min={1}
                value={form.memoryThresholdMb}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((f) => (f ? { ...f, memoryThresholdMb: value } : f));
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-fg-muted">{t("thresholds.backupHours")}</span>
              <Input
                type="number"
                min={1}
                value={form.backupMaxAgeHours}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((f) => (f ? { ...f, backupMaxAgeHours: value } : f));
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-fg-muted">{t("thresholds.certDays")}</span>
              <Input
                type="number"
                min={1}
                value={form.certExpiryDays}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((f) => (f ? { ...f, certExpiryDays: value } : f));
                }}
              />
            </label>
          </div>
        </div>

        <div>
          <h3 className="text-[14px] font-medium text-fg">{t("dailySummary.title")}</h3>
          <label className="mt-2 flex items-center gap-2 text-[13px]">
            <Switch
              checked={form.dailySummaryEnabled}
              onCheckedChange={(checked) => {
                setForm((f) => (f ? { ...f, dailySummaryEnabled: checked } : f));
              }}
            />
            <span className="text-fg">{t("dailySummary.enabled")}</span>
          </label>
          <label className="mt-2 flex max-w-40 flex-col gap-1 text-[13px]">
            <span className="text-fg-muted">{t("dailySummary.hour")}</span>
            <Input
              type="number"
              min={0}
              max={23}
              value={form.dailySummaryHour}
              onChange={(e) => {
                const value = e.target.value;
                setForm((f) => (f ? { ...f, dailySummaryHour: value } : f));
              }}
            />
          </label>
        </div>

        <div>
          <Button onClick={() => void handleSave()} disabled={save.isPending}>
            {t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

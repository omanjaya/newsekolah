"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Card,
  Field,
  FormSection,
  Input,
  NumberInput,
  PasswordInput,
  Select,
  SkeletonForm,
  useToast,
} from "@newsekolah/ui";
import { ScanSearch, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { SettingSwitchRow } from "../../settings/components/setting-switch-row";
import { SettingsSaveBar } from "../../settings/components/settings-save-bar";
import {
  type PlatformOperatorAlertChatCandidate,
  type PlatformOperatorAlertSettings,
  useDetectOperatorAlertChatMutation,
  useOperatorAlertSettingsQuery,
  useTestOperatorAlertMutation,
  useUpdateOperatorAlertSettingsMutation,
} from "../api";

import { PlatformNav } from "./platform-nav";

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
  diskThresholdPercent: number | null;
  memoryThresholdMb: number | null;
  backupMaxAgeHours: number | null;
  certExpiryDays: number | null;
  dailySummaryEnabled: boolean;
  dailySummaryHour: number;
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

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

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
    diskThresholdPercent: settings.disk_threshold_percent,
    memoryThresholdMb: settings.memory_threshold_mb,
    backupMaxAgeHours: settings.backup_max_age_hours,
    certExpiryDays: settings.cert_expiry_days,
    dailySummaryEnabled: settings.daily_summary_enabled,
    dailySummaryHour: settings.daily_summary_hour,
  };
}

/**
 * The operator's Telegram alerts for server health: the bot and chat that
 * receive them, which checks run and at what thresholds, and a daily
 * summary. Saves from the shared bar; "Kirim pesan uji" tests what is on
 * screen, saved or not.
 */
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
  const [candidates, setCandidates] = useState<PlatformOperatorAlertChatCandidate[] | null>(null);

  const settings = query.data;
  if (settings && settings !== seededFrom) {
    setSeededFrom(settings);
    setForm(formFromSettings(settings));
  }
  const dirty =
    form !== null &&
    settings !== undefined &&
    JSON.stringify(form) !== JSON.stringify(formFromSettings(settings));

  function patch(next: Partial<FormState>) {
    setForm((current) => (current ? { ...current, ...next } : current));
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
        disk_threshold_percent: form.diskThresholdPercent ?? 85,
        memory_threshold_mb: form.memoryThresholdMb ?? 512,
        backup_max_age_hours: form.backupMaxAgeHours ?? 30,
        cert_expiry_days: form.certExpiryDays ?? 14,
        daily_summary_enabled: form.dailySummaryEnabled,
        daily_summary_hour: form.dailySummaryHour,
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
    if (!form) return;
    // Test what is on screen, saved or not: an unsaved token or chat id is
    // exactly what the admin wants to check before saving.
    const hasToken =
      Boolean(form.telegramToken) ||
      Boolean(settings?.telegram_token_set && !form.telegramTokenClear);
    if (!hasToken) {
      toast.error(t("test.needToken"));
      return;
    }
    if (!form.telegramChatId.trim()) {
      toast.error(t("test.needChat"));
      return;
    }
    try {
      const result = await test.mutateAsync({
        telegramToken: form.telegramToken || undefined,
        telegramChatId: form.telegramChatId.trim(),
      });
      if (result.success) {
        toast.success(t("test.success"));
      } else {
        toast.error(result.error ?? t("test.failure"));
      }
    } catch (error) {
      onError(error);
    }
  }

  const page = (children: ReactElement, floating?: ReactElement) => (
    <AppPage variant="narrow" description={t("subtitle")} nav={<PlatformNav />} floating={floating}>
      {children}
    </AppPage>
  );

  if (query.isError && !settings) {
    return page(<QueryError retry={() => query.refetch()} error={query.error} />);
  }

  if (query.isLoading || !form) {
    return page(<SkeletonForm fields={6} actions={false} />);
  }

  const tokenStored = Boolean(settings?.telegram_token_set) && !form.telegramTokenClear;

  return page(
    <>
      <FormSection
        variant="card"
        columns={1}
        title={t("bot.title")}
        description={t("bot.description")}
      >
        <Card tone="sunken" padding="sm">
          <p className="text-label text-fg">{t("botSetup.title")}</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-body-sm text-fg-muted">
            <li>{t("botSetup.step1")}</li>
            <li>{t("botSetup.step2")}</li>
            <li>{t("botSetup.step3")}</li>
          </ol>
        </Card>
        <Field
          label={t("token.label")}
          hint={form.telegramTokenClear ? t("token.removed") : undefined}
          labelAside={
            settings?.telegram_token_set ? (
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  patch({ telegramToken: "", telegramTokenClear: !form.telegramTokenClear });
                }}
              >
                {form.telegramTokenClear ? t("token.keep") : t("token.remove")}
              </Button>
            ) : undefined
          }
        >
          <PasswordInput
            value={form.telegramToken}
            autoComplete="off"
            onChange={(e) => {
              patch({ telegramToken: e.target.value, telegramTokenClear: false });
            }}
            placeholder={
              tokenStored
                ? settings?.telegram_token_hint
                  ? `${t("token.placeholderSet")} (${settings.telegram_token_hint})`
                  : t("token.placeholderSet")
                : t("token.placeholderUnset")
            }
          />
        </Field>
        <Field label={t("chatId.label")} hint={t("chatId.hint")}>
          <Input
            value={form.telegramChatId}
            placeholder={t("chatId.placeholder")}
            inputMode="numeric"
            onChange={(e) => {
              patch({ telegramChatId: e.target.value });
            }}
          />
        </Field>
        {candidates &&
          (candidates.length === 0 ? (
            <p className="text-body-sm text-fg-muted">{t("detect.empty")}</p>
          ) : (
            <Field label={t("chatId.picker")}>
              <Select
                value={form.telegramChatId}
                onValueChange={(value) => {
                  patch({ telegramChatId: value });
                }}
                options={candidates.map((c) => ({
                  value: String(c.id),
                  label: `${c.title} (${c.type})`,
                }))}
              />
            </Field>
          ))}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={<ScanSearch />}
            loading={detect.isPending}
            onClick={() => void handleDetect()}
          >
            {t("detect.button")}
          </Button>
          <Button
            variant="secondary"
            icon={<Send />}
            loading={test.isPending}
            onClick={() => void handleTest()}
          >
            {t("test.button")}
          </Button>
        </div>
      </FormSection>

      <FormSection variant="card" columns={1} title={t("checks.title")}>
        <SettingSwitchRow
          label={t("enabled")}
          hint={t("enabledHint")}
          checked={form.enabled}
          onCheckedChange={(enabled) => {
            patch({ enabled });
          }}
        />
        <div className="grid gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-2">
          {CHECK_FIELDS.map(([key, labelKey]) => (
            <SettingSwitchRow
              key={key}
              label={t(labelKey)}
              checked={form[key]}
              disabled={!form.enabled}
              onCheckedChange={(checked) => {
                patch({ [key]: checked });
              }}
            />
          ))}
        </div>
      </FormSection>

      <FormSection
        variant="card"
        title={t("thresholds.title")}
        description={t("thresholds.description")}
      >
        <Field label={t("thresholds.disk")}>
          <NumberInput
            min={1}
            max={100}
            suffix="%"
            value={form.diskThresholdPercent}
            onChange={(value) => {
              patch({ diskThresholdPercent: value });
            }}
          />
        </Field>
        <Field label={t("thresholds.memory")}>
          <NumberInput
            min={1}
            suffix="MB"
            value={form.memoryThresholdMb}
            onChange={(value) => {
              patch({ memoryThresholdMb: value });
            }}
          />
        </Field>
        <Field label={t("thresholds.backup")}>
          <NumberInput
            min={1}
            suffix={t("thresholds.hours")}
            value={form.backupMaxAgeHours}
            onChange={(value) => {
              patch({ backupMaxAgeHours: value });
            }}
          />
        </Field>
        <Field label={t("thresholds.cert")}>
          <NumberInput
            min={1}
            suffix={t("thresholds.days")}
            value={form.certExpiryDays}
            onChange={(value) => {
              patch({ certExpiryDays: value });
            }}
          />
        </Field>
      </FormSection>

      <FormSection variant="card" columns={1} title={t("dailySummary.title")}>
        <SettingSwitchRow
          label={t("dailySummary.enabled")}
          hint={t("dailySummary.enabledHint")}
          checked={form.dailySummaryEnabled}
          onCheckedChange={(dailySummaryEnabled) => {
            patch({ dailySummaryEnabled });
          }}
        />
        <Field
          label={t("dailySummary.hour")}
          hint={t("dailySummary.hourHint")}
          disabled={!form.dailySummaryEnabled}
          className="sm:max-w-xs"
        >
          <Select
            value={String(form.dailySummaryHour)}
            onValueChange={(value) => {
              patch({ dailySummaryHour: Number(value) });
            }}
            options={HOURS.map((hour) => ({
              value: String(hour),
              label: `${String(hour).padStart(2, "0")}.00`,
            }))}
          />
        </Field>
      </FormSection>
    </>,
    <SettingsSaveBar
      dirty={dirty}
      saving={save.isPending}
      onSave={() => void handleSave()}
      onDiscard={() => {
        if (settings) setForm(formFromSettings(settings));
      }}
    />,
  );
}

"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Card,
  Field,
  FormError,
  FormSection,
  IconButton,
  Input,
  RadioGroup,
  RadioGroupItem,
  SkeletonForm,
  useToast,
} from "@newsekolah/ui";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useTenant } from "../../../lib/tenant/tenant-provider";
import {
  useReportHeaderQuery,
  useUpdateReportHeaderMutation,
  type ReportHeaderSettings,
  type ReportHeaderSigner,
} from "../api";

import { PreviewSheet } from "./preview-sheet";
import { ReportHeaderPreview, type ReportHeaderDraft } from "./report-header-preview";
import { SettingSwitchRow } from "./setting-switch-row";
import { SettingsPage } from "./settings-page";
import { SettingsSaveBar } from "./settings-save-bar";

const MAX_LINES = 5;
const EMPTY_SIGNER: ReportHeaderSigner = { role_label: "", name: "", id_label: "", id_number: "" };
const NAV_KEY = "settings-report-header";
const AUTO = "auto";

/**
 * Tenant-wide "kop laporan" (report header): whether to print the
 * branding logo, up to 5 header lines, the place used in the signature
 * block ("Denpasar, ..."), and default signers (e.g. Kepala Sekolah +
 * NIP). Every report export that shows its letterhead through
 * apps/api/internal/platform/reportdoc reads this setting.
 */
export function ReportHeaderView(): ReactElement {
  const { data, isLoading, isError, error, refetch } = useReportHeaderQuery();

  if (isError && !data) {
    return (
      <SettingsPage navKey={NAV_KEY}>
        <QueryError retry={() => refetch()} error={error} />
      </SettingsPage>
    );
  }

  if (isLoading || !data) {
    return (
      <SettingsPage navKey={NAV_KEY} variant="default">
        <div aria-busy="true" className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <SkeletonForm fields={5} actions={false} />
          <SkeletonForm fields={2} actions={false} className="hidden lg:flex" />
        </div>
      </SettingsPage>
    );
  }

  return <ReportHeaderForm initial={data} />;
}

function draftOf(settings: ReportHeaderSettings): ReportHeaderDraft {
  return {
    showLogo: settings.show_logo,
    // The editor always shows at least one (possibly empty) line; compare
    // against that same shape so an untouched form is not reported dirty.
    lines: settings.lines.length > 0 ? settings.lines : [""],
    // undefined means "automatic" (reportdoc/school domain's EmphasisAuto):
    // the server picks the line matching the tenant name, else the
    // second-to-last line.
    emphasis: settings.emphasis,
    place: settings.place,
    signers: settings.signers.map((signer) => ({
      role_label: signer.role_label,
      name: signer.name,
      id_label: signer.id_label ?? "",
      id_number: signer.id_number ?? "",
    })),
  };
}

/**
 * Two panes: the letterhead form on the left, and on the right a sheet
 * drawn live from the unsaved values (or the server's PDF of the saved
 * settings), kept in view on a desktop.
 */
function ReportHeaderForm({ initial }: { initial: ReportHeaderSettings }): ReactElement {
  const t = useTranslations("app.settings.reportHeader");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const update = useUpdateReportHeaderMutation();
  const { branding } = useTenant();

  const saved = draftOf(initial);
  const [draft, setDraft] = useState<ReportHeaderDraft>(saved);
  const [savedVersion, setSavedVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { lines, signers, emphasis } = draft;
  const filledLines = lines.filter((line) => line.trim() !== "").length;

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function patch(next: Partial<ReportHeaderDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function updateLine(index: number, value: string) {
    patch({ lines: lines.map((line, i) => (i === index ? value : line)) });
  }

  function removeLine(index: number) {
    if (lines.length <= 1) return;
    // Keep the emphasis selection pointing at the same logical line: drop
    // it back to automatic if the removed line was the chosen one, shift
    // it down if a line before it was removed, leave it alone otherwise.
    const nextEmphasis =
      emphasis === undefined || emphasis === index
        ? undefined
        : emphasis > index
          ? emphasis - 1
          : emphasis;
    patch({ lines: lines.filter((_, i) => i !== index), emphasis: nextEmphasis });
  }

  function updateSigner(index: number, value: Partial<ReportHeaderSigner>) {
    patch({ signers: signers.map((s, i) => (i === index ? { ...s, ...value } : s)) });
  }

  function save() {
    setError(null);
    const cleanLines = lines.map((l) => l.trim()).filter((l) => l !== "");
    if (cleanLines.length === 0) {
      setError(t("linesRequiredError"));
      return;
    }
    // A trimmed-out blank line shifts every later index, so an
    // in-range emphasis is remapped against the original (untrimmed)
    // lines array rather than sent as-is.
    const emphasisLine = emphasis !== undefined ? lines[emphasis]?.trim() : undefined;
    const emphasisValue = emphasisLine ? cleanLines.indexOf(emphasisLine) : undefined;
    const body: ReportHeaderSettings = {
      show_logo: draft.showLogo,
      lines: cleanLines,
      ...(emphasisValue !== undefined && emphasisValue >= 0 ? { emphasis: emphasisValue } : {}),
      place: draft.place.trim(),
      signers: signers
        .map((s) => ({
          role_label: s.role_label.trim(),
          name: s.name.trim(),
          id_label: (s.id_label ?? "").trim(),
          id_number: (s.id_number ?? "").trim(),
        }))
        .filter((s) => s.role_label !== "" || s.name !== ""),
    };
    update.mutate(body, {
      onSuccess: (data) => {
        setDraft(draftOf(data));
        setSavedVersion((version) => version + 1);
        toast.success(t("saved"));
      },
      onError: (err) => {
        setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
      },
    });
  }

  return (
    <SettingsPage
      navKey={NAV_KEY}
      variant="default"
      description={t("description")}
      floating={
        <SettingsSaveBar
          container="default"
          dirty={dirty}
          saving={update.isPending}
          onSave={save}
          onDiscard={() => {
            setDraft(saved);
            setError(null);
          }}
        />
      }
    >
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {error && <FormError>{error}</FormError>}

          <PreviewSheet label={t("preview.title")}>
            <ReportHeaderPreview
              draft={draft}
              logoUrl={branding?.logo_url}
              savedVersion={savedVersion}
              bare
            />
          </PreviewSheet>

          <FormSection variant="card" columns={1} title={t("headerTitle")}>
            <SettingSwitchRow
              label={t("showLogoLabel")}
              hint={t("showLogoHint")}
              checked={draft.showLogo}
              onCheckedChange={(showLogo) => {
                patch({ showLogo });
              }}
            />
            <Field label={t("linesLabel")} hint={t("linesHint", { max: MAX_LINES })}>
              {(control) => (
                <div
                  role="group"
                  aria-labelledby={control.labelId}
                  aria-describedby={control["aria-describedby"]}
                  className="flex flex-col gap-2"
                >
                  {lines.map((line, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        id={index === 0 ? control.id : undefined}
                        value={line}
                        onChange={(e) => {
                          updateLine(index, e.target.value);
                        }}
                        placeholder={index === 0 ? t("firstLinePlaceholder") : t("linePlaceholder")}
                        aria-label={t("lineLabel", { index: index + 1 })}
                        maxLength={160}
                        className="flex-1"
                      />
                      <IconButton
                        variant="ghost"
                        icon={<Trash2 />}
                        aria-label={t("removeLine", { index: index + 1 })}
                        disabled={lines.length <= 1}
                        onClick={() => {
                          removeLine(index);
                        }}
                      />
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    icon={<Plus />}
                    // Pulled out by its leading padding, so the icon lines
                    // up with the edge of the fields above it.
                    className="-ml-3.5 self-start"
                    disabled={lines.length >= MAX_LINES}
                    onClick={() => {
                      patch({ lines: [...lines, ""] });
                    }}
                  >
                    {t("addLine")}
                  </Button>
                </div>
              )}
            </Field>
            {/* A choice only once there are two filled lines to choose
                between: with one, "automatic" is the only answer. */}
            {filledLines >= 2 && (
              <Field label={t("emphasisLabel")} hint={t("emphasisHint")}>
                {(control) => (
                  <RadioGroup
                    aria-labelledby={control.labelId}
                    aria-describedby={control["aria-describedby"]}
                    value={emphasis === undefined ? AUTO : String(emphasis)}
                    onValueChange={(value) => {
                      patch({ emphasis: value === AUTO ? undefined : Number(value) });
                    }}
                  >
                    <RadioGroupItem value={AUTO} label={t("emphasisAuto")} />
                    {lines.map((line, index) =>
                      line.trim() === "" ? null : (
                        <RadioGroupItem
                          key={index}
                          value={String(index)}
                          label={t("emphasisLineOption", { index: index + 1, text: line })}
                        />
                      ),
                    )}
                  </RadioGroup>
                )}
              </Field>
            )}
          </FormSection>

          <FormSection variant="card" columns={1} title={t("placeTitle")}>
            <Field label={t("placeLabel")} hint={t("placeHint")}>
              <Input
                value={draft.place}
                onChange={(e) => {
                  patch({ place: e.target.value });
                }}
                placeholder={t("placePlaceholder")}
                maxLength={80}
                className="sm:max-w-xs"
              />
            </Field>
          </FormSection>

          <FormSection
            variant="card"
            columns={1}
            title={t("signersLabel")}
            description={t("signersHint")}
          >
            {signers.map((signer, index) => (
              <Card key={index} tone="sunken" padding="sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-label text-fg">{t("signerTitle", { index: index + 1 })}</p>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 />}
                    aria-label={t("removeSigner", { index: index + 1 })}
                    onClick={() => {
                      patch({ signers: signers.filter((_, i) => i !== index) });
                    }}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t("signerRoleLabel")}>
                    <Input
                      value={signer.role_label}
                      onChange={(e) => {
                        updateSigner(index, { role_label: e.target.value });
                      }}
                      placeholder={t("signerRolePlaceholder")}
                      maxLength={80}
                    />
                  </Field>
                  <Field label={t("signerNameLabel")}>
                    <Input
                      value={signer.name}
                      onChange={(e) => {
                        updateSigner(index, { name: e.target.value });
                      }}
                      maxLength={120}
                    />
                  </Field>
                  <Field label={t("signerIdLabel")} hint={t("signerIdHint")}>
                    <Input
                      value={signer.id_label}
                      onChange={(e) => {
                        updateSigner(index, { id_label: e.target.value });
                      }}
                      maxLength={40}
                    />
                  </Field>
                  <Field label={t("signerIdNumberLabel")}>
                    <Input
                      value={signer.id_number}
                      onChange={(e) => {
                        updateSigner(index, { id_number: e.target.value });
                      }}
                      inputMode="numeric"
                      maxLength={60}
                    />
                  </Field>
                </div>
              </Card>
            ))}
            <Button
              variant="secondary"
              icon={<Plus />}
              className="justify-self-start"
              onClick={() => {
                patch({ signers: [...signers, { ...EMPTY_SIGNER }] });
              }}
            >
              {t("addSigner")}
            </Button>
          </FormSection>
        </div>

        <div className="max-lg:hidden lg:sticky lg:top-[calc(var(--shell-header-height,3.5rem)+1.5rem)]">
          <ReportHeaderPreview
            draft={draft}
            logoUrl={branding?.logo_url}
            savedVersion={savedVersion}
          />
        </div>
      </div>
    </SettingsPage>
  );
}

"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Input,
  PageHeader,
  Skeleton,
  Switch,
  useMediaQuery,
  useToast,
} from "@newsekolah/ui";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  fetchReportHeaderPreviewURL,
  useReportHeaderQuery,
  useUpdateReportHeaderMutation,
  type ReportHeaderSettings,
  type ReportHeaderSigner,
} from "../api";

const MAX_LINES = 5;
const EMPTY_SIGNER: ReportHeaderSigner = { role_label: "", name: "", id_label: "", id_number: "" };

/**
 * Tenant-wide "kop laporan" (report header): whether to print the
 * branding logo, up to 5 header lines, the place used in the signature
 * block ("Denpasar, ..."), and default signers (e.g. Kepala Sekolah +
 * NIP). Every report export that shows its letterhead through
 * apps/api/internal/platform/reportdoc reads this setting; the preview
 * pane renders a sample document with the current, unsaved form values
 * are NOT reflected until saved -- the preview always shows the last
 * saved settings, same as branding's logo/favicon preview.
 */
export function ReportHeaderView(): ReactElement {
  const t = useTranslations("app.settings.reportHeader");
  const { data, isLoading, isError, refetch } = useReportHeaderQuery();

  if (isError && !data) return <QueryError retry={() => refetch()} className="m-4" />;

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return <ReportHeaderForm initial={data} />;
}

function ReportHeaderForm({ initial }: { initial: ReportHeaderSettings }): ReactElement {
  const t = useTranslations("app.settings.reportHeader");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const update = useUpdateReportHeaderMutation();

  const [showLogo, setShowLogo] = useState(initial.show_logo);
  const [lines, setLines] = useState<string[]>(initial.lines.length > 0 ? initial.lines : [""]);
  // undefined means "automatic" (reportdoc/school domain's EmphasisAuto):
  // the server picks the line matching the tenant name, else the
  // second-to-last line.
  const [emphasis, setEmphasis] = useState<number | undefined>(initial.emphasis);
  const [place, setPlace] = useState(initial.place);
  const [signers, setSigners] = useState<ReportHeaderSigner[]>(initial.signers);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    showLogo !== initial.show_logo ||
    JSON.stringify(lines) !== JSON.stringify(initial.lines) ||
    emphasis !== initial.emphasis ||
    place !== initial.place ||
    JSON.stringify(signers) !== JSON.stringify(initial.signers);

  function updateLine(index: number, value: string) {
    setLines((current) => current.map((line, i) => (i === index ? value : line)));
  }

  function addLine() {
    setLines((current) => (current.length >= MAX_LINES ? current : [...current, ""]));
  }

  function removeLine(index: number) {
    setLines((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
    // Keep the emphasis selection pointing at the same logical line: drop
    // it back to automatic if the removed line was the chosen one, shift
    // it down if a line before it was removed, leave it alone otherwise.
    setEmphasis((current) => {
      if (current === undefined) return current;
      if (current === index) return undefined;
      if (current > index) return current - 1;
      return current;
    });
  }

  function updateSigner(index: number, patch: Partial<ReportHeaderSigner>) {
    setSigners((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSigner() {
    setSigners((current) => [...current, { ...EMPTY_SIGNER }]);
  }

  function removeSigner(index: number) {
    setSigners((current) => current.filter((_, i) => i !== index));
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
      show_logo: showLogo,
      lines: cleanLines,
      ...(emphasisValue !== undefined && emphasisValue >= 0 ? { emphasis: emphasisValue } : {}),
      place: place.trim(),
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
      onSuccess: () => {
        toast.success(t("saved"));
      },
      onError: (err) => {
        setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
      },
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
        {error && (
          <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-fg">{t("showLogoLabel")}</span>
            <span className="text-fg-muted">{t("showLogoHint")}</span>
          </span>
          <Switch
            checked={showLogo}
            onCheckedChange={setShowLogo}
            aria-label={t("showLogoLabel")}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-fg">{t("linesLabel")}</span>
          {lines.map((line, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={line}
                onChange={(e) => {
                  updateLine(index, e.target.value);
                }}
                placeholder={index === 0 ? t("firstLinePlaceholder") : t("linePlaceholder")}
                aria-label={t("lineLabel", { index: index + 1 })}
                maxLength={160}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  removeLine(index);
                }}
                disabled={lines.length <= 1}
                aria-label={t("removeLine", { index: index + 1 })}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={addLine}
            disabled={lines.length >= MAX_LINES}
            className="self-start"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("addLine")}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-fg">{t("emphasisLabel")}</span>
            <span className="text-[13px] text-fg-muted">{t("emphasisHint")}</span>
          </span>
          <div role="radiogroup" aria-label={t("emphasisLabel")} className="flex flex-col gap-1">
            <label className="flex min-h-11 items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="report-header-emphasis"
                checked={emphasis === undefined}
                onChange={() => {
                  setEmphasis(undefined);
                }}
                className="size-4"
              />
              {t("emphasisAuto")}
            </label>
            {lines.map((line, index) =>
              line.trim() === "" ? null : (
                <label key={index} className="flex min-h-11 items-center gap-2 text-[13px]">
                  <input
                    type="radio"
                    name="report-header-emphasis"
                    checked={emphasis === index}
                    onChange={() => {
                      setEmphasis(index);
                    }}
                    className="size-4"
                  />
                  {t("emphasisLineOption", { index: index + 1, text: line })}
                </label>
              ),
            )}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("placeLabel")}</span>
          <Input
            value={place}
            onChange={(e) => {
              setPlace(e.target.value);
            }}
            placeholder={t("placePlaceholder")}
            maxLength={80}
            className="max-w-xs"
          />
        </label>

        <div className="flex flex-col gap-3">
          <span className="text-[13px] font-medium text-fg">{t("signersLabel")}</span>
          {signers.map((signer, index) => (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-sm border border-border p-3 sm:flex-row sm:flex-wrap sm:items-end"
            >
              <label className="flex flex-1 flex-col gap-1 text-[13px]">
                <span className="text-fg-muted">{t("signerRoleLabel")}</span>
                <Input
                  value={signer.role_label}
                  onChange={(e) => {
                    updateSigner(index, { role_label: e.target.value });
                  }}
                  maxLength={80}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-[13px]">
                <span className="text-fg-muted">{t("signerNameLabel")}</span>
                <Input
                  value={signer.name}
                  onChange={(e) => {
                    updateSigner(index, { name: e.target.value });
                  }}
                  maxLength={120}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-[13px]">
                <span className="text-fg-muted">{t("signerIdLabel")}</span>
                <Input
                  value={signer.id_label}
                  onChange={(e) => {
                    updateSigner(index, { id_label: e.target.value });
                  }}
                  placeholder="NIP"
                  maxLength={40}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-[13px]">
                <span className="text-fg-muted">{t("signerIdNumberLabel")}</span>
                <Input
                  value={signer.id_number}
                  onChange={(e) => {
                    updateSigner(index, { id_number: e.target.value });
                  }}
                  maxLength={60}
                />
              </label>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  removeSigner(index);
                }}
                aria-label={t("removeSigner", { index: index + 1 })}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={addSigner}
            className="self-start"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("addSigner")}
          </Button>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button disabled={!dirty} loading={update.isPending} onClick={save}>
            {t("save")}
          </Button>
        </div>
      </section>

      <ReportHeaderPreview />
    </div>
  );
}

const PREVIEW_KEY = ["settings", "report-header", "preview"] as const;

function ReportHeaderPreview(): ReactElement {
  const t = useTranslations("app.settings.reportHeader");
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const {
    data: previewUrl,
    isLoading,
    isError,
  } = useQuery({
    queryKey: PREVIEW_KEY,
    queryFn: () => fetchReportHeaderPreviewURL("pdf"),
    // A blob object URL is only valid for this tab's lifetime and is
    // revoked below on cleanup, so it is never worth serving from cache
    // across mounts.
    gcTime: 0,
  });

  // Cleanup only -- releasing the object URL when it is replaced or this
  // component unmounts is not a state sync, so it stays a plain effect
  // return rather than a `setState` call inside the effect body.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <h2 className="text-[16px] font-medium text-fg">{t("previewTitle")}</h2>
      {isLoading && <Skeleton className="h-40 w-full" />}
      {!isLoading && isError && <p className="text-[13px] text-fg-muted">{t("previewError")}</p>}
      {!isLoading && !isError && previewUrl && isDesktop && (
        <iframe
          src={previewUrl}
          title={t("previewTitle")}
          className="h-[420px] w-full rounded-xs border border-border"
        />
      )}
      {!isLoading && !isError && previewUrl && !isDesktop && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => {
            window.open(previewUrl, "_blank", "noopener,noreferrer");
          }}
        >
          {t("previewOpen")}
        </Button>
      )}
    </section>
  );
}

"use client";

import { formatDate, type Locale } from "@newsekolah/i18n";
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  SegmentedControl,
  Skeleton,
  cn,
  useMediaQuery,
} from "@newsekolah/ui";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useSession } from "../../../lib/session/session-provider";
import { fetchReportHeaderPreviewURL, type ReportHeaderSigner } from "../api";

export interface ReportHeaderDraft {
  showLogo: boolean;
  lines: string[];
  /** Index into `lines`; undefined is automatic (the server's choice). */
  emphasis: number | undefined;
  place: string;
  signers: ReportHeaderSigner[];
}

const PREVIEW_KEY = ["settings", "report-header", "preview"] as const;

/**
 * The automatic emphasis as reportdoc chooses it: the line that matches
 * the school's name, else the second to last line (the last is usually an
 * address or a contact line).
 */
function automaticEmphasis(lines: string[], schoolName: string | undefined): number {
  const match = schoolName
    ? lines.findIndex((line) => line.trim().toLowerCase() === schoolName.trim().toLowerCase())
    : -1;
  if (match >= 0) return match;
  return Math.max(0, lines.length - 2);
}

/**
 * A sheet of paper with the letterhead and the signature block drawn from the unsaved form.
 * White paper and dark ink in both themes (the `paper` tokens): what prints
 * is always white.
 */
function LivePaper({
  draft,
  logoUrl,
}: {
  draft: ReportHeaderDraft;
  logoUrl?: string;
}): ReactElement {
  const t = useTranslations("app.settings.reportHeader.preview");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const lines = draft.lines.map((line) => line.trim()).filter(Boolean);
  const emphasis =
    draft.emphasis !== undefined && draft.lines[draft.emphasis]?.trim()
      ? lines.indexOf(draft.lines[draft.emphasis]?.trim() ?? "")
      : automaticEmphasis(lines, me?.tenant.name);
  const signers = draft.signers.filter((s) => s.role_label.trim() || s.name.trim());
  const today = formatDate(new Date(), { locale, timeZone: me?.tenant.timezone });

  return (
    <div className="rounded-md bg-surface-sunken p-3 sm:p-4">
      <div className="flex aspect-[1/1.2] flex-col gap-3 overflow-hidden rounded-xs bg-paper p-4 text-paper-fg shadow-1">
        <div className="flex items-center gap-3 border-b-2 border-paper-fg pb-2">
          {draft.showLogo &&
            (logoUrl ? (
              <img src={logoUrl} alt="" className="size-9 shrink-0 object-contain" />
            ) : (
              <span
                aria-hidden="true"
                className="size-9 shrink-0 rounded-full border border-dashed border-paper-fg-muted"
              />
            ))}
          <div className="flex min-w-0 flex-1 flex-col items-center text-center">
            {lines.length === 0 ? (
              <span className="text-caption text-paper-fg-muted">{t("noLines")}</span>
            ) : (
              lines.map((line, index) => (
                <span
                  key={`${index}-${line}`}
                  className={cn(
                    "max-w-full truncate",
                    index === emphasis
                      ? "text-label font-heading font-bold text-paper-fg"
                      : "text-caption text-paper-fg-muted",
                  )}
                >
                  {line}
                </span>
              ))
            )}
          </div>
          {draft.showLogo && <span aria-hidden="true" className="size-9 shrink-0" />}
        </div>
        <div aria-hidden="true" className="flex flex-col gap-1.5 pt-1">
          <span className="mx-auto mb-1 h-2 w-2/5 rounded-full bg-paper-line" />
          {["w-full", "w-11/12", "w-full", "w-2/3", "w-5/6", "w-3/5"].map((width, index) => (
            <span key={index} className={cn("h-1.5 rounded-full bg-paper-line", width)} />
          ))}
        </div>
        <div className="mt-auto flex justify-end gap-6">
          {signers.length === 0 ? (
            <span className="text-caption text-paper-fg-muted">{t("noSigners")}</span>
          ) : (
            signers.slice(0, 2).map((signer, index) => (
              <div key={index} className="flex min-w-0 flex-col text-caption text-paper-fg">
                {index === signers.length - 1 || signers.length === 1 ? (
                  <span className="text-paper-fg-muted">
                    {draft.place.trim() ? `${draft.place.trim()}, ${today}` : today}
                  </span>
                ) : (
                  <span>&nbsp;</span>
                )}
                <span className="truncate">{signer.role_label || t("rolePlaceholder")}</span>
                <span className="h-6" />
                <span className="truncate font-semibold underline">
                  {signer.name || t("namePlaceholder")}
                </span>
                {Boolean(signer.id_label) || Boolean(signer.id_number) ? (
                  <span className="truncate text-paper-fg-muted">
                    {[signer.id_label, signer.id_number].filter(Boolean).join(" ")}
                  </span>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** The PDF the server renders from the saved settings (reportdoc), the way exports print it. */
function SavedPdf(): ReactElement {
  const t = useTranslations("app.settings.reportHeader");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const preview = useQuery({
    queryKey: PREVIEW_KEY,
    queryFn: () => fetchReportHeaderPreviewURL("pdf"),
    // A blob object URL is only valid for this tab's lifetime and is
    // revoked below on cleanup, so it is never worth serving from cache
    // across mounts.
    gcTime: 0,
  });
  const previewUrl = preview.data;

  // Cleanup only: releasing the object URL when it is replaced or this
  // component unmounts is not a state sync.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (preview.isLoading) return <Skeleton className="aspect-[1/1.2] w-full rounded-md" />;
  if (preview.isError || !previewUrl) {
    return <QueryError retry={() => preview.refetch()} error={preview.error} />;
  }
  return (
    <div className="flex flex-col gap-3">
      {isDesktop && (
        <iframe
          src={previewUrl}
          title={t("previewTitle")}
          className="aspect-[1/1.2] w-full rounded-md border border-border bg-surface"
        />
      )}
      <Button
        variant="secondary"
        icon={<ExternalLink />}
        className="self-start"
        onClick={() => {
          window.open(previewUrl, "_blank", "noopener,noreferrer");
        }}
      >
        {t("previewOpen")}
      </Button>
    </div>
  );
}

type Mode = "live" | "pdf";

/**
 * The right pane of the report header editor: a live sheet drawn from the
 * unsaved form, or the PDF the server renders from the saved settings.
 */
export function ReportHeaderPreview({
  draft,
  logoUrl,
  savedVersion,
  bare = false,
}: {
  draft: ReportHeaderDraft;
  logoUrl?: string;
  /** Changes after each save, so the PDF is rendered again from the new settings. */
  savedVersion: number;
  /**
   * Without the card and its title, for a container that already names the
   * preview (the phone's PreviewSheet), so the title is not shown twice.
   */
  bare?: boolean;
}): ReactElement {
  const t = useTranslations("app.settings.reportHeader.preview");
  const [mode, setMode] = useState<Mode>("live");
  const hint = mode === "live" ? t("liveHint") : t("pdfHint");

  const body = (
    <>
      <div className={cn(!bare && "px-5 pb-4")}>
        <SegmentedControl<Mode>
          aria-label={t("modeLabel")}
          size="sm"
          fullWidth
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "live", label: t("live") },
            { value: "pdf", label: t("pdf") },
          ]}
        />
      </div>
      <div className={cn(!bare && "px-5 pb-5")}>
        {mode === "live" ? (
          <LivePaper draft={draft} logoUrl={logoUrl} />
        ) : (
          <SavedPdf key={savedVersion} />
        )}
      </div>
    </>
  );

  if (bare) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-fg-muted">{hint}</p>
        {body}
      </div>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      {body}
    </Card>
  );
}

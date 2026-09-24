"use client";

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  IconButton,
  Input,
  Switch,
  useToast,
} from "@newsekolah/ui";
import { ChevronDown, ChevronUp, FileSpreadsheet, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useId, useState } from "react";

/**
 * Shared "download report" dialog: format (Excel/PDF), title, whether to
 * print the school letterhead (kop laporan), and which columns to include,
 * in what order and under what label. This is the client-side half of the
 * reportdoc contract (apps/api/internal/platform/reportdoc) -- see
 * docs/05-shared-components.md "Laporan dan ekspor" for the query params a
 * report export endpoint decodes these options into and the migration
 * checklist for wiring a new report kind to this dialog.
 *
 * The dialog never calls the network itself: `onExport` receives the
 * chosen options and does the download (usually a URL-builder over the
 * existing authenticated fetch-to-blob helper, see
 * apps/web/features/reports/api.ts `downloadReportExport`). The dialog
 * only owns its own open/loading/error state and localStorage recall of
 * the last choice per `reportKey`.
 */

export type ReportExportFormat = "xlsx" | "pdf";

export interface ReportExportColumn {
  key: string;
  /** Default label; shown until the user renames it in the dialog. */
  label: string;
}

export interface ReportExportColumnChoice {
  key: string;
  /** Present only when the user renamed the column away from its default. */
  label?: string;
}

export interface ReportExportOptions {
  format: ReportExportFormat;
  title: string;
  showLetterhead: boolean;
  /** Chosen columns, in the chosen order. Never empty -- the dialog requires at least one. */
  columns: ReportExportColumnChoice[];
}

export interface ReportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Stable id namespacing localStorage recall, e.g. "attendance.daily". */
  reportKey: string;
  /** Prefilled into the title field and used by "Restore defaults". */
  defaultTitle: string;
  /** Every column the report can show, in its natural/default order. */
  availableColumns: ReportExportColumn[];
  /** Optional slot rendered above the format control (class/grade-level pickers, date, ...). */
  scopeSlot?: ReactNode;
  /** Runs the export; the dialog shows its own loading state around the returned promise. */
  onExport: (options: ReportExportOptions) => Promise<void>;
}

interface ColumnState {
  key: string;
  defaultLabel: string;
  label: string;
  included: boolean;
}

interface StoredChoice {
  format: ReportExportFormat;
  showLetterhead: boolean;
  columns: { key: string; label: string; included: boolean }[];
}

function storageKey(reportKey: string): string {
  return `newsekolah:report-export:${reportKey}`;
}

function readStoredChoice(reportKey: string): StoredChoice | null {
  try {
    const raw = window.localStorage.getItem(storageKey(reportKey));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.columns)) return null;

    const columns: StoredChoice["columns"] = [];
    for (const entry of record.columns as unknown[]) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      if (typeof item.key !== "string") continue;
      columns.push({
        key: item.key,
        label: typeof item.label === "string" ? item.label : "",
        included: item.included !== false,
      });
    }
    return {
      format: record.format === "pdf" ? "pdf" : "xlsx",
      showLetterhead: record.showLetterhead !== false,
      columns,
    };
  } catch {
    return null;
  }
}

function writeStoredChoice(reportKey: string, choice: StoredChoice): void {
  try {
    window.localStorage.setItem(storageKey(reportKey), JSON.stringify(choice));
  } catch {
    // Best-effort only: private browsing, quota, or a disabled store all
    // just mean the next dialog open falls back to the report's defaults.
  }
}

/** Merges saved column order/labels/inclusion onto the report's current
 * column set, so a report gaining or losing a column never breaks recall:
 * unknown saved keys are dropped, new columns are appended and included. */
function buildInitialColumns(
  available: ReportExportColumn[],
  stored: StoredChoice | null,
): ColumnState[] {
  if (!stored) return defaultColumns(available);
  const byKey = new Map(available.map((c) => [c.key, c]));
  const ordered: ColumnState[] = [];
  const seen = new Set<string>();
  for (const saved of stored.columns) {
    const column = byKey.get(saved.key);
    if (!column) continue;
    ordered.push({
      key: column.key,
      defaultLabel: column.label,
      label: saved.label || column.label,
      included: saved.included,
    });
    seen.add(column.key);
  }
  for (const column of available) {
    if (seen.has(column.key)) continue;
    ordered.push({
      key: column.key,
      defaultLabel: column.label,
      label: column.label,
      included: true,
    });
  }
  return ordered;
}

function defaultColumns(available: ReportExportColumn[]): ColumnState[] {
  return available.map((c) => ({
    key: c.key,
    defaultLabel: c.label,
    label: c.label,
    included: true,
  }));
}

/**
 * Thin wrapper that only decides *when* the form should reset to a fresh
 * copy of the last saved (or default) choice: every time the dialog
 * transitions from closed to open. Remounting {@link ReportExportForm}
 * with a fresh `key` does that reset through ordinary `useState`
 * initializers instead of a `useEffect` + a batch of `setState` calls,
 * per docs/04-clean-code.md ("data fetching/state sync bukan lewat
 * useEffect + useState") -- this bumps the key during render itself
 * (React's documented "adjusting state when a prop changes" pattern), not
 * in an effect.
 */
export function ReportExportDialog(props: ReportExportDialogProps): ReactElement {
  const [wasOpen, setWasOpen] = useState(props.open);
  const [formInstance, setFormInstance] = useState(0);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setFormInstance((n) => n + 1);
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <ReportExportForm key={formInstance} {...props} />
    </Dialog>
  );
}

function ReportExportForm({
  onOpenChange,
  reportKey,
  defaultTitle,
  availableColumns,
  scopeSlot,
  onExport,
}: ReportExportDialogProps): ReactElement {
  const t = useTranslations("app.reportExport");
  const toast = useToast();
  const titleFieldId = useId();

  const [stored] = useState(() => readStoredChoice(reportKey));
  const [format, setFormat] = useState<ReportExportFormat>(stored?.format ?? "xlsx");
  const [title, setTitle] = useState(defaultTitle);
  const [showLetterhead, setShowLetterhead] = useState(stored?.showLetterhead ?? true);
  const [columns, setColumns] = useState<ColumnState[]>(() =>
    buildInitialColumns(availableColumns, stored),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const includedCount = columns.filter((c) => c.included).length;
  const canExport = title.trim() !== "" && includedCount > 0 && !submitting;

  function move(index: number, delta: number) {
    setColumns((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = current.slice();
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(target, 0, item);
      return next;
    });
  }

  function toggle(key: string, included: boolean) {
    setColumns((current) => current.map((c) => (c.key === key ? { ...c, included } : c)));
  }

  function rename(key: string, label: string) {
    setColumns((current) => current.map((c) => (c.key === key ? { ...c, label } : c)));
  }

  function restoreDefaults() {
    setFormat("xlsx");
    setTitle(defaultTitle);
    setShowLetterhead(true);
    setColumns(defaultColumns(availableColumns));
    setError(null);
  }

  async function handleExport() {
    if (!canExport) return;
    setSubmitting(true);
    setError(null);
    const chosen = columns.filter((c) => c.included);
    const options: ReportExportOptions = {
      format,
      title: title.trim(),
      showLetterhead,
      columns: chosen.map((c) => ({
        key: c.key,
        ...(c.label.trim() !== c.defaultLabel && c.label.trim() !== ""
          ? { label: c.label.trim() }
          : {}),
      })),
    };
    try {
      await onExport(options);
      writeStoredChoice(reportKey, {
        format,
        showLetterhead,
        columns: columns.map((c) => ({ key: c.key, label: c.label, included: c.included })),
      });
      onOpenChange(false);
    } catch {
      setError(t("error"));
      toast.error(t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent
      title={t("title")}
      description={t("description")}
      className="max-w-lg"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" size="sm" onClick={restoreDefaults} type="button">
            {t("restoreDefaults")}
          </Button>
          <Button onClick={() => void handleExport()} loading={submitting} disabled={!canExport}>
            {t("export")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {scopeSlot}

        {error && (
          <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-fg">{t("formatLabel")}</span>
          <div role="radiogroup" aria-label={t("formatLabel")} className="flex gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={format === "xlsx"}
              onClick={() => {
                setFormat("xlsx");
              }}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm border px-3 text-[13px] font-medium transition-colors ${
                format === "xlsx"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-fg-muted hover:bg-bg"
              }`}
            >
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              {t("formatExcel")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={format === "pdf"}
              onClick={() => {
                setFormat("pdf");
              }}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm border px-3 text-[13px] font-medium transition-colors ${
                format === "pdf"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-fg-muted hover:bg-bg"
              }`}
            >
              <FileText className="size-4" aria-hidden="true" />
              {t("formatPdf")}
            </button>
          </div>
        </div>

        <label htmlFor={titleFieldId} className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("titleLabel")}</span>
          <Input
            id={titleFieldId}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
            maxLength={160}
            required
          />
        </label>

        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="font-medium text-fg">{t("showLetterheadLabel")}</span>
          <Switch
            checked={showLetterhead}
            onCheckedChange={setShowLetterhead}
            aria-label={t("showLetterheadLabel")}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-fg">
            {t("columnsLabel", { count: includedCount })}
          </span>
          <ul className="flex flex-col gap-1">
            {columns.map((column, index) => (
              <li
                key={column.key}
                className="flex items-center gap-2 rounded-sm border border-border bg-surface px-2 py-1.5"
              >
                <Checkbox
                  checked={column.included}
                  onCheckedChange={(checked) => {
                    toggle(column.key, checked === true);
                  }}
                  aria-label={t("includeColumn", { column: column.defaultLabel })}
                />
                <Input
                  value={column.label}
                  onChange={(e) => {
                    rename(column.key, e.target.value);
                  }}
                  aria-label={t("columnLabel", { column: column.defaultLabel })}
                  maxLength={60}
                  className="h-9 flex-1"
                  disabled={!column.included}
                />
                <div className="flex shrink-0 gap-0.5">
                  <IconButton
                    icon={<ChevronUp aria-hidden="true" />}
                    aria-label={t("moveUp", { column: column.defaultLabel })}
                    onClick={() => {
                      move(index, -1);
                    }}
                    disabled={index === 0}
                  />
                  <IconButton
                    icon={<ChevronDown aria-hidden="true" />}
                    aria-label={t("moveDown", { column: column.defaultLabel })}
                    onClick={() => {
                      move(index, 1);
                    }}
                    disabled={index === columns.length - 1}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </DialogContent>
  );
}

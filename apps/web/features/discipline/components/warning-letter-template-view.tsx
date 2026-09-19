"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Skeleton, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type WarningLetterTemplatePolicy,
  useUpdateWarningLetterTemplateMutation,
  useWarningLetterTemplateQuery,
} from "../api";
import {
  defaultPreviewSample,
  hasSeqPlaceholder,
  previewWarningLetterNumber,
} from "../lib/warning-letter-number";

const MIN_SEQ_PAD = 0;
const MAX_SEQ_PAD = 10;

export function WarningLetterTemplateView(): ReactElement {
  const t = useTranslations("app.discipline.warningLetters.template");
  const policy = useWarningLetterTemplateQuery();

  if (policy.isError && !policy.data)
    return <QueryError retry={() => policy.refetch()} className="m-4" />;

  if (policy.isLoading || !policy.data) {
    return <Skeleton className="h-64 w-full" aria-busy="true" />;
  }

  return <WarningLetterTemplateEditor t={t} initial={policy.data} />;
}

function WarningLetterTemplateEditor({
  t,
  initial,
}: {
  t: ReturnType<typeof useTranslations>;
  initial: WarningLetterTemplatePolicy;
}): ReactElement {
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canEdit = useCan("manage_settings");
  const update = useUpdateWarningLetterTemplateMutation();

  const [saved, setSaved] = useState(initial);
  const [pattern, setPattern] = useState(initial.number_pattern);
  const [seqPad, setSeqPad] = useState(String(initial.seq_pad));
  const [openingText, setOpeningText] = useState(initial.opening_text);
  const [closingText, setClosingText] = useState(initial.closing_text);
  const [error, setError] = useState<string | null>(null);

  const seqPadNumber = Number(seqPad);
  const preview = useMemo(
    () =>
      previewWarningLetterNumber(
        pattern,
        Number.isInteger(seqPadNumber) ? seqPadNumber : 0,
        defaultPreviewSample(),
      ),
    [pattern, seqPadNumber],
  );

  const dirty =
    pattern !== saved.number_pattern ||
    seqPad !== String(saved.seq_pad) ||
    openingText !== saved.opening_text ||
    closingText !== saved.closing_text;

  function save() {
    setError(null);
    if (!hasSeqPlaceholder(pattern)) {
      setError(t("missingSeqError"));
      return;
    }
    if (
      !Number.isInteger(seqPadNumber) ||
      seqPadNumber < MIN_SEQ_PAD ||
      seqPadNumber > MAX_SEQ_PAD
    ) {
      setError(t("seqPadRangeError", { min: MIN_SEQ_PAD, max: MAX_SEQ_PAD }));
      return;
    }
    update.mutate(
      {
        number_pattern: pattern,
        seq_pad: seqPadNumber,
        opening_text: openingText,
        closing_text: closingText,
      },
      {
        onSuccess: (result) => {
          setSaved(result);
          toast.success(t("saved"));
        },
        onError: (err) => {
          setError(
            err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
        {error && (
          <p
            role="alert"
            className="rounded-xs border border-status-absent/40 px-3 py-2 text-[13px]"
          >
            {error}
          </p>
        )}

        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("patternLabel")}</span>
          <Input
            value={pattern}
            disabled={!canEdit}
            onChange={(e) => {
              setPattern(e.target.value);
            }}
            onBlur={() => {
              setError(hasSeqPlaceholder(pattern) ? null : t("missingSeqError"));
            }}
            invalid={error === t("missingSeqError")}
          />
          <span className="text-fg-muted">{t("patternHint")}</span>
        </label>

        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("seqPadLabel")}</span>
          <Input
            type="number"
            min={MIN_SEQ_PAD}
            max={MAX_SEQ_PAD}
            value={seqPad}
            disabled={!canEdit}
            onChange={(e) => {
              setSeqPad(e.target.value);
            }}
            className="w-24"
          />
          <span className="text-fg-muted">{t("seqPadHint")}</span>
        </label>

        <div className="flex flex-col gap-1 rounded-xs border border-border bg-bg px-3 py-2 text-[13px]">
          <span className="font-medium text-fg-muted">{t("previewLabel")}</span>
          <span className="font-medium tabular-nums text-fg">{preview}</span>
        </div>

        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("openingLabel")}</span>
          <Textarea
            rows={3}
            value={openingText}
            disabled={!canEdit}
            onChange={(e) => {
              setOpeningText(e.target.value);
            }}
          />
        </label>

        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("closingLabel")}</span>
          <Textarea
            rows={3}
            value={closingText}
            disabled={!canEdit}
            onChange={(e) => {
              setClosingText(e.target.value);
            }}
          />
        </label>

        {canEdit && (
          <div className="flex justify-end border-t border-border pt-4">
            <Button disabled={!dirty} loading={update.isPending} onClick={save}>
              {t("save")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Card,
  Field,
  FormActions,
  FormError,
  Input,
  NumberInput,
  SkeletonForm,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useRef, useState } from "react";

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

/** The values a letter number can carry, in the order an admin usually writes them. */
const NUMBER_TOKENS = ["seq", "sp_level_number", "month_roman", "year"] as const;

export function WarningLetterTemplateView(): ReactElement {
  const t = useTranslations("app.discipline.warningLetters.template");
  const policy = useWarningLetterTemplateQuery();

  if (policy.isError && !policy.data)
    return <QueryError retry={() => policy.refetch()} className="m-4" />;

  if (policy.isLoading || !policy.data) {
    return <SkeletonForm fields={4} />;
  }

  return (
    <div className="md:h-full md:min-h-0">
      <WarningLetterTemplateEditor t={t} initial={policy.data} />
    </div>
  );
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
  const patternRef = useRef<HTMLInputElement>(null);

  /** Puts `{{name}}` where the cursor is (or at the end) and keeps typing after it. */
  function insertToken(name: (typeof NUMBER_TOKENS)[number]) {
    const token = `{{${name}}}`;
    const field = patternRef.current;
    const start = field?.selectionStart ?? pattern.length;
    const end = field?.selectionEnd ?? pattern.length;
    const next = pattern.slice(0, start) + token + pattern.slice(end);
    setPattern(next);
    if (error === t("missingSeqError") && hasSeqPlaceholder(next)) setError(null);
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + token.length, start + token.length);
    });
  }

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
    <div className="flex flex-col gap-4 md:h-full md:min-h-0 md:flex-1 md:overflow-y-auto">
      <p className="text-body-sm text-fg-muted">{t("description")}</p>

      <Card padding="md" className="max-w-2xl">
        {error && <FormError>{error}</FormError>}

        <Field label={t("patternLabel")} hint={t("patternHint")}>
          <Input
            ref={patternRef}
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
        </Field>
        {canEdit && (
          <div className="flex flex-col gap-2">
            <p className="text-label text-fg">{t("insertLabel")}</p>
            <div className="flex flex-wrap gap-2">
              {NUMBER_TOKENS.map((name) => (
                <Button
                  key={name}
                  variant="secondary"
                  size="sm"
                  icon={<Plus />}
                  title={`{{${name}}}`}
                  onClick={() => {
                    insertToken(name);
                  }}
                >
                  {t(`tokens.${name}`)}
                </Button>
              ))}
            </div>
          </div>
        )}

        <Field label={t("seqPadLabel")} hint={t("seqPadHint")}>
          <NumberInput
            min={MIN_SEQ_PAD}
            max={MAX_SEQ_PAD}
            value={seqPad === "" ? null : Number(seqPad)}
            disabled={!canEdit}
            onChange={(next) => {
              setSeqPad(next === null ? "" : String(next));
            }}
            className="w-32"
          />
        </Field>

        <Card tone="sunken" padding="sm" className="gap-1">
          <span className="text-caption text-fg-muted">{t("previewLabel")}</span>
          <span className="text-label tabular-nums text-fg">{preview}</span>
        </Card>

        <Field label={t("openingLabel")}>
          <Textarea
            rows={3}
            value={openingText}
            disabled={!canEdit}
            onChange={(e) => {
              setOpeningText(e.target.value);
            }}
          />
        </Field>

        <Field label={t("closingLabel")}>
          <Textarea
            rows={3}
            value={closingText}
            disabled={!canEdit}
            onChange={(e) => {
              setClosingText(e.target.value);
            }}
          />
        </Field>

        {canEdit && (
          <FormActions>
            <Button disabled={!dirty} loading={update.isPending} onClick={save}>
              {t("save")}
            </Button>
          </FormActions>
        )}
      </Card>
    </div>
  );
}

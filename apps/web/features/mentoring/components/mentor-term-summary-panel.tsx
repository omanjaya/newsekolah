"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Select, Skeleton, Textarea, useToast } from "@newsekolah/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiClient } from "../../../lib/api/client";
import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useMentorTermSummaryQuery, useWriteMentorTermSummaryMutation } from "../api";

/**
 * The mentor's own written term appraisal of one student, separate from
 * meeting notes. Both read and write need `manage_mentoring`, so this is
 * only rendered for a mentor (or counselor/leadership holding that grant).
 */
export function MentorTermSummaryPanel({
  groupId,
  studentId,
}: {
  groupId: string;
  studentId: string;
}): ReactElement {
  const t = useTranslations("app.mentoring.termSummary");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canWrite = useCan("manage_mentoring");
  const year = useActiveYear();
  const client = useApiClient();

  const terms = useQuery({
    queryKey: ["mentoring", "terms", year.id],
    queryFn: () =>
      client.GET("/v1/academic/years/{yearId}/terms", { params: { path: { yearId: year.id } } }),
    enabled: year.id !== "",
  });

  // `undefined` defers to the active term until the reader picks one.
  const [selectedTermId, setSelectedTermId] = useState<string | undefined>(undefined);
  const activeTermId = terms.data?.data.find((term) => term.is_active)?.id;
  const termId = selectedTermId ?? activeTermId ?? "";

  const summary = useMentorTermSummaryQuery(groupId, termId, studentId, termId !== "");
  const write = useWriteMentorTermSummaryMutation(groupId, termId, studentId);
  const notFound = summary.error instanceof ApiError && summary.error.status === 404;

  // `undefined` shows the saved summary; once the reader edits it, this
  // takes over until the term changes and the field resets to it again.
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const text = draft ?? summary.data?.summary ?? "";

  const termOptions = (terms.data?.data ?? []).map((term) => ({
    value: term.id,
    label: term.name,
  }));

  return (
    <div className="flex flex-col gap-4">
      <label className="flex max-w-xs flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("term")}</span>
        <Select
          options={termOptions}
          value={termId}
          onValueChange={(next) => {
            setSelectedTermId(next);
            setDraft(undefined);
          }}
          placeholder={t("termPlaceholder")}
        />
      </label>

      {termId === "" ? (
        <p className="text-[13px] text-fg-muted">{t("selectTermFirst")}</p>
      ) : summary.isLoading ? (
        <Skeleton className="h-32 w-full" aria-busy="true" />
      ) : (
        <div className="flex flex-col gap-3">
          {notFound && !canWrite && <p className="text-[13px] text-fg-muted">{t("empty")}</p>}
          <Textarea
            rows={6}
            value={text}
            disabled={!canWrite}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            placeholder={canWrite ? t("placeholder") : undefined}
          />
          {canWrite && (
            <div>
              <Button
                size="sm"
                loading={write.isPending}
                disabled={text.trim() === "" || text === (summary.data?.summary ?? "")}
                onClick={() => {
                  write.mutate(text.trim(), {
                    onSuccess: () => {
                      toast.success(t("saved"));
                    },
                    onError: (error) => {
                      toast.error(
                        error instanceof ApiError
                          ? apiErrorMessage(error.code)
                          : apiErrorMessage("UNKNOWN"),
                      );
                    },
                  });
                }}
              >
                {t("submit")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

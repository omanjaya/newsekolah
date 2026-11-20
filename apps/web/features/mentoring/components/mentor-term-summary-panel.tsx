"use client";

import { ApiError } from "@newsekolah/api-client";
import { Field, Button, Select, Skeleton, Textarea, useToast } from "@newsekolah/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiClient } from "../../../lib/api/client";
import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useMentorTermSummaryQuery, useWriteMentorTermSummaryMutation } from "../api";

/**
 * The mentor's own written term appraisal of one student, separate from
 * meeting notes. Anyone who may open the group reads it; only the group's
 * guru wali or a group manager (`manage_mentor_groups`) writes it, the same
 * rule as the API (`domain.Viewer.CanWrite`). A counselor or leadership
 * duty holder reads it without the field to edit, even though their
 * teacher role carries `manage_mentoring`.
 */
export function MentorTermSummaryPanel({
  groupId,
  studentId,
  mentorUserId,
}: {
  groupId: string;
  studentId: string;
  /** The group's guru wali; `undefined` while the group is still loading. */
  mentorUserId: string | undefined;
}): ReactElement {
  const t = useTranslations("app.mentoring.termSummary");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const managesGroups = useCan("manage_mentor_groups");
  const { me } = useSession();
  const canWrite = managesGroups || (me?.id !== undefined && me.id === mentorUserId);
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
    // A line of prose is easier to write and read at a measure, not the
    // full width of a desktop card.
    <div className="flex max-w-prose flex-col gap-4">
      <Field label={t("term")}>
        <Select
          options={termOptions}
          value={termId}
          onValueChange={(next) => {
            setSelectedTermId(next);
            setDraft(undefined);
          }}
          placeholder={t("termPlaceholder")}
        />
      </Field>

      {termId === "" ? (
        <p className="text-body-sm text-fg-muted">{t("selectTermFirst")}</p>
      ) : summary.isLoading ? (
        <Skeleton className="h-32 w-full" aria-busy="true" />
      ) : (
        <>
          <Field label={t("summaryLabel")} hint={notFound && !canWrite ? t("empty") : undefined}>
            <Textarea
              rows={6}
              value={text}
              disabled={!canWrite}
              onChange={(e) => {
                setDraft(e.target.value);
              }}
              placeholder={canWrite ? t("placeholder") : undefined}
            />
          </Field>
          {canWrite && (
            <div className="flex justify-end">
              <Button
                className="max-sm:w-full"
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
        </>
      )}
    </div>
  );
}

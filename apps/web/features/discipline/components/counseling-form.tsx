"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import { Alert, Button, Input, Select, Textarea, useToast } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useDirectoryQuery } from "../../reference/api";
import {
  type Counseling,
  type CounselingKind,
  type CounselingTopic,
  type CounselingVisibility,
  useCreateCounselingMutation,
  useUpdateCounselingMutation,
} from "../api";
import {
  clearCounselingDraft,
  loadCounselingDraft,
  saveCounselingDraft,
} from "../lib/counseling-draft";

const KINDS: CounselingKind[] = ["individual", "group", "parent", "referral"];
const TOPICS: CounselingTopic[] = ["career", "problem", "personal", "learning", "social", "other"];
const VISIBILITIES: CounselingVisibility[] = ["counselor", "bk_team", "leadership"];

function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CounselingForm({
  initial,
  onDone,
}: {
  initial?: Counseling;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.discipline.counseling.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const students = useDirectoryQuery("student");
  const create = useCreateCounselingMutation();
  const update = useUpdateCounselingMutation();

  const draftId = initial?.id ?? "new";

  const [studentId, setStudentId] = useState(initial?.student_user_id ?? "");
  const [sessionAt, setSessionAt] = useState(
    toLocalInput(initial?.session_at ?? new Date().toISOString()),
  );
  const [kind, setKind] = useState<CounselingKind>(initial?.kind ?? "individual");
  const [topic, setTopic] = useState<CounselingTopic>(initial?.topic ?? "problem");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [followUpPlan, setFollowUpPlan] = useState(initial?.follow_up_plan ?? "");
  const [careerGoals, setCareerGoals] = useState(initial?.career_goals ?? "");
  const [problemDescription, setProblemDescription] = useState(initial?.problem_description ?? "");
  const [visibility, setVisibility] = useState<CounselingVisibility>(
    initial?.visibility ?? "counselor",
  );
  const [draftOffer, setDraftOffer] = useState<{ savedAt: string } | null>(null);

  // Offer to restore an in-progress draft the browser still has from
  // before a reload or an accidental tab close, once per mount -- see
  // `lib/counseling-draft.ts`. Reads `window.localStorage`, so this cannot
  // move into a lazy `useState` initializer the way a server-safe value
  // could.
  useEffect(() => {
    const draft = loadCounselingDraft(draftId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the comment above.
    if (draft) setDraftOffer({ savedAt: draft.savedAt });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- check once per mount, keyed by the stable draftId
  }, []);

  const isDirty =
    title.trim() !== (initial?.title ?? "") ||
    content.trim() !== (initial?.content ?? "") ||
    followUpPlan.trim() !== (initial?.follow_up_plan ?? "") ||
    careerGoals.trim() !== (initial?.career_goals ?? "") ||
    problemDescription.trim() !== (initial?.problem_description ?? "");

  // Mirrors every edit to localStorage (try/catch inside the helper) so a
  // dropped connection or an accidental reload does not throw away a
  // counselor's notes; cleared the moment a save succeeds.
  useEffect(() => {
    if (!isDirty) return;
    saveCounselingDraft(draftId, { title, content, followUpPlan, careerGoals, problemDescription });
  }, [draftId, title, content, followUpPlan, careerGoals, problemDescription, isDirty]);

  function restoreDraft() {
    const draft = loadCounselingDraft(draftId);
    if (!draft) return;
    setTitle(draft.title);
    setContent(draft.content);
    setFollowUpPlan(draft.followUpPlan);
    setCareerGoals(draft.careerGoals);
    setProblemDescription(draft.problemDescription);
    setDraftOffer(null);
  }

  function dismissDraft() {
    clearCounselingDraft(draftId);
    setDraftOffer(null);
  }

  const studentOptions = (students.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }));
  const pending = create.isPending || update.isPending;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!studentId || !sessionAt) return;
        const body = {
          student_user_id: studentId,
          session_at: new Date(sessionAt).toISOString(),
          kind,
          topic,
          title: title.trim(),
          content: content.trim(),
          follow_up_plan: followUpPlan.trim() || undefined,
          career_goals: topic === "career" ? careerGoals.trim() || undefined : undefined,
          problem_description:
            topic === "problem" ? problemDescription.trim() || undefined : undefined,
          visibility,
        };
        const onSuccess = () => {
          toast.success(t("saved"));
          clearCounselingDraft(draftId);
          onDone();
        };
        const onError = (error: unknown) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        };
        if (initial) {
          update.mutate({ id: initial.id, ...body }, { onSuccess, onError });
        } else {
          create.mutate(body, { onSuccess, onError });
        }
      }}
    >
      {draftOffer && (
        <Alert variant="warning" title={t("draftFoundTitle")}>
          <p>
            {t("draftFoundBody", {
              time: formatTime(draftOffer.savedAt, { locale, timeZone: me?.tenant.timezone }),
            })}
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={restoreDraft}>
              {t("draftRestore")}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={dismissDraft}>
              {t("draftDismiss")}
            </Button>
          </div>
        </Alert>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("student")}</span>
        <Select
          options={studentOptions}
          value={studentId}
          onValueChange={setStudentId}
          placeholder={t("studentPlaceholder")}
          disabled={initial !== undefined}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("sessionAt")}</span>
        <Input
          type="datetime-local"
          value={sessionAt}
          onChange={(e) => {
            setSessionAt(e.target.value);
          }}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("kind")}</span>
        <Select
          options={KINDS.map((k) => ({ value: k, label: t(`kindOptions.${k}`) }))}
          value={kind}
          onValueChange={(v) => {
            setKind(v as CounselingKind);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("topic")}</span>
        <Select
          options={TOPICS.map((topicOption) => ({
            value: topicOption,
            label: t(`topicOptions.${topicOption}`),
          }))}
          value={topic}
          onValueChange={(v) => {
            setTopic(v as CounselingTopic);
          }}
        />
      </label>
      {topic === "career" && (
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("careerGoals")}</span>
          <Textarea
            rows={2}
            value={careerGoals}
            onChange={(e) => {
              setCareerGoals(e.target.value);
            }}
            placeholder={t("careerGoalsPlaceholder")}
            maxLength={5000}
          />
        </label>
      )}
      {topic === "problem" && (
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("problemDescription")}</span>
          <Textarea
            rows={2}
            value={problemDescription}
            onChange={(e) => {
              setProblemDescription(e.target.value);
            }}
            placeholder={t("problemDescriptionPlaceholder")}
            maxLength={5000}
          />
        </label>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("title")}</span>
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          placeholder={t("titlePlaceholder")}
          required
          maxLength={200}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("content")}</span>
        <Textarea
          rows={5}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
          }}
          placeholder={t("contentPlaceholder")}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("followUpPlan")}</span>
        <Textarea
          rows={2}
          value={followUpPlan}
          onChange={(e) => {
            setFollowUpPlan(e.target.value);
          }}
          placeholder={t("followUpPlanPlaceholder")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("visibility")}</span>
        <Select
          options={VISIBILITIES.map((v) => ({ value: v, label: t(`visibilityOptions.${v}`) }))}
          value={visibility}
          onValueChange={(v) => {
            setVisibility(v as CounselingVisibility);
          }}
        />
        <span className="text-[12px] text-fg-muted">{t(`visibilityHint.${visibility}`)}</span>
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending} disabled={!studentId}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

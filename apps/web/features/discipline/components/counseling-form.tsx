"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import {
  DateTimeField,
  DialogFooter,
  Field,
  Alert,
  Button,
  Input,
  Select,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { useDraftOwner } from "../../../lib/drafts/draft-owner";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { isoToZonedLocal, zonedLocalToIso } from "../../../lib/tenant-date";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import {
  type Counseling,
  type CounselingKind,
  type CounselingTopic,
  type CounselingVisibility,
} from "../api";
import { useCreateCounselingMutation, useUpdateCounselingMutation } from "../api-counseling-extras";
import {
  clearCounselingDraft,
  loadCounselingDraft,
  saveCounselingDraft,
} from "../lib/counseling-draft";

const KINDS: CounselingKind[] = ["individual", "group", "parent", "referral"];
const TOPICS: CounselingTopic[] = ["career", "problem", "personal", "learning", "social", "other"];
const VISIBILITIES: CounselingVisibility[] = ["counselor", "bk_team", "leadership"];

export function CounselingForm({
  initial,
  initialStudentId,
  onDone,
}: {
  initial?: Counseling;
  initialStudentId?: string;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.discipline.counseling.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const draftOwner = useDraftOwner();
  const studentLabels = useDirectoryPickerLabels(t("studentPlaceholder"));
  const create = useCreateCounselingMutation();
  const update = useUpdateCounselingMutation();

  const draftId = initial?.id ?? (initialStudentId ? `new:${initialStudentId}` : "new");

  const [studentId, setStudentId] = useState(initial?.student_user_id ?? initialStudentId ?? "");
  const [sessionAt, setSessionAt] = useState(
    isoToZonedLocal(initial?.session_at ?? businessNow(), me?.tenant.timezone),
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
  // before a reload or an accidental tab close -- see
  // `lib/counseling-draft.ts`. Checked again when the owner becomes known
  // (a draft is only ever offered to the account that wrote it) and
  // withdrawn when there is none; `draftId` is fixed for the form's life.
  // Reads `window.localStorage`, so this cannot move into a lazy
  // `useState` initializer the way a server-safe value could.
  useEffect(() => {
    const draft = loadCounselingDraft(draftOwner, draftId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the comment above.
    setDraftOffer(draft ? { savedAt: draft.savedAt } : null);
  }, [draftOwner, draftId]);

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
    saveCounselingDraft(draftOwner, draftId, {
      title,
      content,
      followUpPlan,
      careerGoals,
      problemDescription,
    });
  }, [draftOwner, draftId, title, content, followUpPlan, careerGoals, problemDescription, isDirty]);

  function restoreDraft() {
    const draft = loadCounselingDraft(draftOwner, draftId);
    if (!draft) return;
    setTitle(draft.title);
    setContent(draft.content);
    setFollowUpPlan(draft.followUpPlan);
    setCareerGoals(draft.careerGoals);
    setProblemDescription(draft.problemDescription);
    setDraftOffer(null);
  }

  function dismissDraft() {
    clearCounselingDraft(draftOwner, draftId);
    setDraftOffer(null);
  }

  const pending = create.isPending || update.isPending;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const sessionAtIso = zonedLocalToIso(sessionAt, me?.tenant.timezone);
        if (!studentId || !sessionAtIso) return;
        const body = {
          student_user_id: studentId,
          session_at: sessionAtIso,
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
          clearCounselingDraft(draftOwner, draftId);
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
      <Field label={t("student")} required>
        <DirectoryPicker
          profileKind="student"
          value={studentId}
          onValueChange={setStudentId}
          labels={studentLabels}
          disabled={initial !== undefined}
        />
      </Field>
      <DateTimeField
        value={sessionAt}
        onChange={setSessionAt}
        dateLabel={t("sessionDate")}
        timeLabel={t("sessionTime")}
        required
      />
      <Field label={t("kind")}>
        <Select
          options={KINDS.map((k) => ({ value: k, label: t(`kindOptions.${k}`) }))}
          value={kind}
          onValueChange={(v) => {
            setKind(v as CounselingKind);
          }}
        />
      </Field>
      <Field label={t("topic")}>
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
      </Field>
      {topic === "career" && (
        <Field label={t("careerGoals")}>
          <Textarea
            rows={2}
            value={careerGoals}
            onChange={(e) => {
              setCareerGoals(e.target.value);
            }}
            placeholder={t("careerGoalsPlaceholder")}
            maxLength={5000}
          />
        </Field>
      )}
      {topic === "problem" && (
        <Field label={t("problemDescription")}>
          <Textarea
            rows={2}
            value={problemDescription}
            onChange={(e) => {
              setProblemDescription(e.target.value);
            }}
            placeholder={t("problemDescriptionPlaceholder")}
            maxLength={5000}
          />
        </Field>
      )}
      <Field label={t("title")} required>
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          placeholder={t("titlePlaceholder")}
          required
          maxLength={200}
        />
      </Field>
      <Field label={t("content")} required>
        <Textarea
          rows={5}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
          }}
          placeholder={t("contentPlaceholder")}
          required
        />
      </Field>
      <Field label={t("followUpPlan")}>
        <Textarea
          rows={2}
          value={followUpPlan}
          onChange={(e) => {
            setFollowUpPlan(e.target.value);
          }}
          placeholder={t("followUpPlanPlaceholder")}
        />
      </Field>
      <Field label={t("visibility")} hint={t(`visibilityHint.${visibility}`)}>
        <Select
          options={VISIBILITIES.map((v) => ({ value: v, label: t(`visibilityOptions.${v}`) }))}
          value={visibility}
          onValueChange={(v) => {
            setVisibility(v as CounselingVisibility);
          }}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending} disabled={!studentId}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

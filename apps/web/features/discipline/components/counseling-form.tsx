"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery } from "../../reference/api";
import {
  type Counseling,
  type CounselingKind,
  type CounselingVisibility,
  useCreateCounselingMutation,
  useUpdateCounselingMutation,
} from "../api";

const KINDS: CounselingKind[] = ["individual", "group", "parent", "referral"];
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
  const students = useDirectoryQuery("student");
  const create = useCreateCounselingMutation();
  const update = useUpdateCounselingMutation();

  const [studentId, setStudentId] = useState(initial?.student_user_id ?? "");
  const [sessionAt, setSessionAt] = useState(
    toLocalInput(initial?.session_at ?? new Date().toISOString()),
  );
  const [kind, setKind] = useState<CounselingKind>(initial?.kind ?? "individual");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [followUpPlan, setFollowUpPlan] = useState(initial?.follow_up_plan ?? "");
  const [visibility, setVisibility] = useState<CounselingVisibility>(
    initial?.visibility ?? "counselor",
  );

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
          title: title.trim(),
          content: content.trim(),
          follow_up_plan: followUpPlan.trim() || undefined,
          visibility,
        };
        const onSuccess = () => {
          toast.success(t("saved"));
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

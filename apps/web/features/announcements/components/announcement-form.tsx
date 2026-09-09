"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Checkbox, Input, Select, Switch, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useClassesQuery } from "../../reference/api";
import {
  type Announcement,
  type AnnouncementCreate,
  useCreateAnnouncementMutation,
  useUpdateAnnouncementMutation,
} from "../api";

const ROLE_SLUGS = ["student", "teacher", "parent", "staff"] as const;
type AudienceType = "all" | "roles" | "classes";

/** Plain text from the editor becomes one paragraph per blank-line block. */
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p>${block
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AnnouncementForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Announcement;
  onSaved: (saved: Announcement) => void;
  onCancel: () => void;
}): ReactElement {
  const t = useTranslations("app.announcements.form");
  const tRoles = useTranslations("app.announcements.roles");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const classes = useClassesQuery();
  const create = useCreateAnnouncementMutation();
  const update = useUpdateAnnouncementMutation();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body_text ?? "");
  const [audienceType, setAudienceType] = useState<AudienceType>(
    (initial?.audience.type as AudienceType | undefined) ?? "all",
  );
  const [roleSlugs, setRoleSlugs] = useState<string[]>(initial?.audience.role_slugs ?? []);
  const [classIds, setClassIds] = useState<string[]>(initial?.audience.class_ids ?? []);
  const [pinned, setPinned] = useState(initial?.is_pinned ?? false);
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.ends_at));
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;

  function toggle(list: string[], value: string, set: (next: string[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function submit() {
    setError(null);
    if (!title.trim() || !body.trim()) {
      setError(t("requiredError"));
      return;
    }
    if (audienceType === "roles" && roleSlugs.length === 0) {
      setError(t("audienceError"));
      return;
    }
    if (audienceType === "classes" && classIds.length === 0) {
      setError(t("audienceError"));
      return;
    }
    const payload: AnnouncementCreate = {
      title: title.trim(),
      body_html: textToHtml(body),
      audience: {
        type: audienceType,
        ...(audienceType === "roles" ? { role_slugs: roleSlugs } : {}),
        ...(audienceType === "classes" ? { class_ids: classIds } : {}),
      },
      is_pinned: pinned,
      ...(startsAt ? { starts_at: new Date(startsAt).toISOString() } : {}),
      ...(endsAt ? { ends_at: new Date(endsAt).toISOString() } : {}),
    };
    try {
      const saved = initial
        ? await update.mutateAsync({ id: initial.id, body: payload })
        : await create.mutateAsync(payload);
      toast.success(initial ? t("updated") : t("created"));
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  const audienceOptions = [
    { value: "all", label: t("audienceAll") },
    { value: "roles", label: t("audienceRoles") },
    { value: "classes", label: t("audienceClasses") },
  ];

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error && (
        <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("title")}</span>
        <Input
          value={title}
          maxLength={180}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("body")}</span>
        <Textarea
          value={body}
          rows={8}
          onChange={(e) => {
            setBody(e.target.value);
          }}
          required
        />
        <span className="text-fg-muted">{t("bodyHint")}</span>
      </label>
      <div className="flex flex-col gap-2 text-[13px]">
        <span className="font-medium">{t("audience")}</span>
        <Select
          options={audienceOptions}
          value={audienceType}
          onValueChange={(value) => {
            setAudienceType(value as AudienceType);
          }}
          className="w-full md:w-64"
        />
        {audienceType === "roles" && (
          <div className="flex flex-wrap gap-4">
            {ROLE_SLUGS.map((slug) => (
              <label key={slug} className="flex items-center gap-2">
                <Checkbox
                  checked={roleSlugs.includes(slug)}
                  onCheckedChange={() => {
                    toggle(roleSlugs, slug, setRoleSlugs);
                  }}
                />
                {tRoles(slug)}
              </label>
            ))}
          </div>
        )}
        {audienceType === "classes" && (
          <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-xs border border-border p-3 md:grid-cols-3">
            {(classes.data?.data ?? []).map((cls) => (
              <label key={cls.id} className="flex items-center gap-2">
                <Checkbox
                  checked={classIds.includes(cls.id)}
                  onCheckedChange={() => {
                    toggle(classIds, cls.id, setClassIds);
                  }}
                />
                {cls.name}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("startsAt")}</span>
          <Input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => {
              setStartsAt(e.target.value);
            }}
          />
          <span className="text-fg-muted">{t("startsAtHint")}</span>
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("endsAt")}</span>
          <Input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => {
              setEndsAt(e.target.value);
            }}
          />
        </label>
      </div>
      <label className="flex items-center gap-3 text-[13px]">
        <Switch checked={pinned} onCheckedChange={setPinned} />
        <span>{t("pinned")}</span>
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {initial ? t("saveChanges") : t("saveDraft")}
        </Button>
      </div>
    </form>
  );
}

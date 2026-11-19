"use client";

import { ApiError } from "@newsekolah/api-client";
import { type Locale, formatDateTime } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DatePicker,
  DialogFooter,
  Field,
  FormError,
  FormSection,
  Input,
  SafeHtml,
  Select,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  TimePicker,
  useToast,
} from "@newsekolah/ui";
import { Pin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { isoToZonedLocal, zonedLocalToIso } from "../../../lib/tenant-date";
import { useClassesQuery } from "../../reference/api";
import {
  type Announcement,
  type AnnouncementCreate,
  useCreateAnnouncementMutation,
  useUpdateAnnouncementMutation,
} from "../api";
import { describeAudience } from "../lib/describe-audience";

const ROLE_SLUGS = ["student", "teacher", "staff"] as const;
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
  const tRoot = useTranslations("app.announcements");
  const tRoles = useTranslations("app.announcements.roles");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  // The schedule pickers read and write the school's wall clock, whatever
  // zone the device is set to (docs/07-ui-ux.md section 5).
  const timeZone = me?.tenant.timezone;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const classes = useClassesQuery();
  const create = useCreateAnnouncementMutation();
  const update = useUpdateAnnouncementMutation();

  const [activeTab, setActiveTab] = useState<"compose" | "preview">("compose");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body_text ?? "");
  const [audienceType, setAudienceType] = useState<AudienceType>(
    (initial?.audience.type as AudienceType | undefined) ?? "all",
  );
  const [roleSlugs, setRoleSlugs] = useState<string[]>(initial?.audience.role_slugs ?? []);
  const [classIds, setClassIds] = useState<string[]>(initial?.audience.class_ids ?? []);
  const [pinned, setPinned] = useState(initial?.is_pinned ?? false);
  const [startsAt, setStartsAt] = useState(
    initial?.starts_at ? isoToZonedLocal(initial.starts_at, timeZone) : "",
  );
  const [endsAt, setEndsAt] = useState(
    initial?.ends_at ? isoToZonedLocal(initial.ends_at, timeZone) : "",
  );
  const startsAtIso = zonedLocalToIso(startsAt, timeZone);
  const endsAtIso = zonedLocalToIso(endsAt, timeZone);
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;

  function toggle(list: string[], value: string, set: (next: string[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function submit() {
    setError(null);
    if (!title.trim() || !body.trim()) {
      setError(t("requiredError"));
      setActiveTab("compose");
      return;
    }
    if (audienceType === "roles" && roleSlugs.length === 0) {
      setError(t("audienceError"));
      setActiveTab("compose");
      return;
    }
    if (audienceType === "classes" && classIds.length === 0) {
      setError(t("audienceError"));
      setActiveTab("compose");
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
      ...(startsAtIso ? { starts_at: startsAtIso } : {}),
      ...(endsAtIso ? { ends_at: endsAtIso } : {}),
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
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error && <FormError>{error}</FormError>}

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as "compose" | "preview");
        }}
        className="flex flex-col gap-5"
      >
        <TabsList variant="underline">
          <TabsTrigger value="compose">{t("tabCompose")}</TabsTrigger>
          <TabsTrigger value="preview">{t("tabPreview")}</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="flex flex-col gap-6">
          <FormSection title={t("sectionContent")} columns={1}>
            <Field label={t("title")} required>
              <Input
                value={title}
                maxLength={180}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
              />
            </Field>
            <Field label={t("body")} hint={t("bodyHint")} required>
              <Textarea
                value={body}
                rows={8}
                onChange={(e) => {
                  setBody(e.target.value);
                }}
              />
            </Field>
          </FormSection>

          <FormSection title={t("sectionAudience")} columns={1}>
            <Field label={t("audienceLabel")}>
              <Select
                options={audienceOptions}
                value={audienceType}
                onValueChange={(value) => {
                  setAudienceType(value as AudienceType);
                }}
              />
            </Field>
            {audienceType === "roles" && (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-2 text-label text-fg">{t("audienceRoles")}</legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {ROLE_SLUGS.map((slug) => (
                    <Checkbox
                      key={slug}
                      label={tRoles(slug)}
                      checked={roleSlugs.includes(slug)}
                      onCheckedChange={() => {
                        toggle(roleSlugs, slug, setRoleSlugs);
                      }}
                    />
                  ))}
                </div>
              </fieldset>
            )}
            {audienceType === "classes" && (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-2 text-label text-fg">{t("audienceClasses")}</legend>
                <div className="grid max-h-48 grid-cols-2 gap-3 overflow-y-auto rounded-md bg-surface-sunken p-3 sm:grid-cols-3">
                  {(classes.data?.data ?? []).map((cls) => (
                    <Checkbox
                      key={cls.id}
                      label={cls.name}
                      checked={classIds.includes(cls.id)}
                      onCheckedChange={() => {
                        toggle(classIds, cls.id, setClassIds);
                      }}
                    />
                  ))}
                </div>
              </fieldset>
            )}
          </FormSection>

          <FormSection title={t("sectionSchedule")}>
            <DateTimeField
              label={t("startsAt")}
              hint={t("startsAtHint")}
              value={startsAt}
              onChange={setStartsAt}
            />
            <DateTimeField label={t("endsAt")} value={endsAt} onChange={setEndsAt} />
            <Field label={t("pinned")} orientation="horizontal" className="col-span-full">
              <Switch checked={pinned} onCheckedChange={setPinned} />
            </Field>
          </FormSection>
        </TabsContent>

        <TabsContent value="preview" className="flex flex-col gap-3">
          <p className="text-body-sm text-fg-muted">{t("previewHint")}</p>
          <Card>
            <div className="flex flex-col gap-1 p-5">
              <span className="flex items-center gap-2">
                {pinned && <Pin className="size-4 shrink-0 text-accent" aria-hidden="true" />}
                <span className="flex-1 text-heading text-fg">
                  {title.trim() || t("previewUntitled")}
                </span>
                {pinned && <Badge tone="accent">{t("pinned")}</Badge>}
              </span>
              <span className="text-caption text-fg-muted">
                {startsAtIso
                  ? t("previewScheduleAt", {
                      date: formatDateTime(startsAtIso, { locale, timeZone }),
                    })
                  : t("previewScheduleImmediate")}
              </span>
              <span className="text-caption text-fg-muted">
                {t("previewAudienceLabel")}:{" "}
                {describeAudience(
                  {
                    type: audienceType,
                    role_slugs: roleSlugs,
                    class_ids: classIds,
                  },
                  tRoot,
                )}
              </span>
            </div>
            {body.trim() ? (
              <SafeHtml
                html={textToHtml(body)}
                className="prose-announcement border-t border-line px-5 py-4 text-body text-fg"
              />
            ) : (
              <p className="border-t border-line px-5 py-4 text-body-sm text-fg-muted">
                {t("previewEmptyBody")}
              </p>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {initial ? t("saveChanges") : t("saveDraft")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * A date and a time picked side by side, kept as the "YYYY-MM-DDTHH:mm"
 * local string the form already works with. A date without a time starts
 * at the beginning of the day; clearing the date clears both.
 */
function DateTimeField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  const [date = "", time = ""] = value.split("T");
  return (
    <Field label={label} hint={hint}>
      {(control) => (
        <div
          className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2"
          role="group"
          aria-labelledby={control.labelId}
          aria-describedby={control["aria-describedby"]}
        >
          <DatePicker
            value={date === "" ? null : date}
            onChange={(next) => {
              onChange(next ? `${next}T${time || "00:00"}` : "");
            }}
          />
          <TimePicker
            value={time === "" ? null : time}
            disabled={date === ""}
            onChange={(next) => {
              if (date) onChange(`${date}T${next}`);
            }}
          />
        </div>
      )}
    </Field>
  );
}

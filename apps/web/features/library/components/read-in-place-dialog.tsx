"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  SectionHeader,
  Field,
  Button,
  Dialog,
  DialogContent,
  Input,
  Skeleton,
  useToast,
  Badge,
  List,
  ListRow,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import { useTenantTimeZone } from "../use-tenant-timezone";
import { useLibraryReadInPlaceQuery, useStartLibraryReadInPlaceMutation } from "../visits-api";

/** Per-copy log of "read at a library table" sessions, plus starting a new one. */
export function ReadInPlaceDialog({
  copyId,
  onOpenChange,
}: {
  copyId: string | null;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.library.readInPlace");
  const locale = useLocale() as Locale;
  const timeZone = useTenantTimeZone();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const log = useLibraryReadInPlaceQuery(copyId ?? "");
  const start = useStartLibraryReadInPlaceMutation(copyId ?? "");
  const memberLabels = useDirectoryPickerLabels(t("memberPlaceholder"));

  const [memberUserId, setMemberUserId] = useState("");
  const [visitorName, setVisitorName] = useState("");

  function reset() {
    setMemberUserId("");
    setVisitorName("");
  }

  return (
    <Dialog
      open={copyId !== null}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <DialogContent title={t("title")}>
        <div className="flex flex-col gap-4">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start.mutate(
                {
                  member_user_id: memberUserId || undefined,
                  visitor_name: memberUserId ? undefined : visitorName.trim() || undefined,
                },
                {
                  onSuccess: () => {
                    toast.success(t("started"));
                    reset();
                  },
                  onError: (err) => {
                    toast.error(
                      err instanceof ApiError
                        ? apiErrorMessage(err.code)
                        : apiErrorMessage("UNKNOWN"),
                    );
                  },
                },
              );
            }}
          >
            <Field label={t("member")} optional className="flex-1">
              <DirectoryPicker
                value={memberUserId}
                onValueChange={setMemberUserId}
                labels={memberLabels}
                showUsername
              />
            </Field>
            <Field label={t("visitorName")} optional className="flex-1">
              <Input
                value={visitorName}
                onChange={(e) => {
                  setVisitorName(e.target.value);
                }}
                disabled={Boolean(memberUserId)}
                maxLength={150}
              />
            </Field>
            <Button type="submit" loading={start.isPending}>
              {t("start")}
            </Button>
          </form>

          <div className="flex flex-col gap-1">
            <SectionHeader as="h3" title={t("logHeading")} />
            {log.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (log.data?.data.length ?? 0) === 0 ? (
              <p className="text-body-sm text-fg-muted">{t("emptyLog")}</p>
            ) : (
              <List framed dense aria-label={t("logHeading")} className="max-h-60 overflow-y-auto">
                {log.data?.data.map((entry) => (
                  <ListRow
                    key={entry.id}
                    title={formatDateTime(entry.started_at, { locale, timeZone })}
                    meta={entry.visitor_name}
                    trailing={
                      entry.ended_at ? undefined : (
                        <Badge tone="info" dot>
                          {t("ongoing")}
                        </Badge>
                      )
                    }
                  />
                ))}
              </List>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate, formatDateTime, formatTime } from "@newsekolah/i18n";
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
import {
  type LibraryReadInPlace,
  useEndLibraryReadInPlaceMutation,
  useLibraryReadInPlaceQuery,
  useStartLibraryReadInPlaceMutation,
} from "../visits-api";

/**
 * Per-copy log of "read at a library table" sessions, plus starting a new
 * one. Each entry names its reader (the member, else the visitor name), an
 * open session can be ended here, and an ended one says when. Starting the
 * next session ends the one still open, since a copy is at one table.
 */
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
  const end = useEndLibraryReadInPlaceMutation(copyId ?? "");
  const memberLabels = useDirectoryPickerLabels(t("memberPlaceholder"));

  const [memberUserId, setMemberUserId] = useState("");
  const [visitorName, setVisitorName] = useState("");

  function reset() {
    setMemberUserId("");
    setVisitorName("");
  }

  function readerOf(entry: LibraryReadInPlace): string {
    return entry.member_name ?? entry.visitor_name ?? t("unnamedReader");
  }

  /** The end time, with its date only when the session ran past its own day. */
  function endedLabel(entry: LibraryReadInPlace & { ended_at: string }): string {
    const sameDay =
      formatDate(entry.ended_at, { locale, timeZone }) ===
      formatDate(entry.started_at, { locale, timeZone });
    return t("endedAt", {
      time: sameDay
        ? formatTime(entry.ended_at, { locale, timeZone })
        : formatDateTime(entry.ended_at, { locale, timeZone }),
    });
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
          {/* Stacked: side by side in the dialog's column, "Nama pengunjung
              (opsional)" wrapped to two lines beside a one-line "Anggota"
              label and squeezed its input against the button. */}
          <form
            className="flex flex-col gap-3"
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
            <Field label={t("member")} optional>
              <DirectoryPicker
                value={memberUserId}
                onValueChange={setMemberUserId}
                labels={memberLabels}
                showUsername
              />
            </Field>
            <Field label={t("visitorName")} optional>
              <Input
                value={visitorName}
                onChange={(e) => {
                  setVisitorName(e.target.value);
                }}
                disabled={Boolean(memberUserId)}
                maxLength={150}
              />
            </Field>
            <Button type="submit" loading={start.isPending} className="self-end">
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
                    title={readerOf(entry)}
                    meta={formatDateTime(entry.started_at, { locale, timeZone })}
                    trailing={
                      entry.ended_at ? (
                        <span className="text-body-sm text-fg-muted">
                          {endedLabel({ ...entry, ended_at: entry.ended_at })}
                        </span>
                      ) : (
                        <Badge tone="info" dot>
                          {t("ongoing")}
                        </Badge>
                      )
                    }
                    action={
                      entry.ended_at ? undefined : (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={end.isPending && end.variables === entry.id}
                          onClick={() => {
                            end.mutate(entry.id, {
                              onSuccess: () => {
                                toast.success(t("ended"));
                              },
                              onError: (err) => {
                                toast.error(
                                  err instanceof ApiError
                                    ? apiErrorMessage(err.code)
                                    : apiErrorMessage("UNKNOWN"),
                                );
                              },
                            });
                          }}
                        >
                          {t("end")}
                        </Button>
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

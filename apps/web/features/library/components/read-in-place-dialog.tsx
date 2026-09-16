"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Button, Dialog, DialogContent, Input, Select, Skeleton, useToast } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery } from "../../reference/api";
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
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const directory = useDirectoryQuery();
  const log = useLibraryReadInPlaceQuery(copyId ?? "");
  const start = useStartLibraryReadInPlaceMutation(copyId ?? "");

  const [memberUserId, setMemberUserId] = useState("");
  const [visitorName, setVisitorName] = useState("");

  const memberOptions = (directory.data?.data ?? []).map((u) => ({
    value: u.id,
    label: `${u.name} (${u.username})`,
  }));

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
            <label className="flex flex-1 flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("member")}</span>
              <Select
                options={memberOptions}
                value={memberUserId}
                onValueChange={setMemberUserId}
                placeholder={t("memberPlaceholder")}
                disabled={directory.isLoading}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("visitorName")}</span>
              <Input
                value={visitorName}
                onChange={(e) => {
                  setVisitorName(e.target.value);
                }}
                disabled={Boolean(memberUserId)}
                maxLength={150}
              />
            </label>
            <Button type="submit" size="sm" loading={start.isPending}>
              {t("start")}
            </Button>
          </form>

          <div className="flex flex-col gap-1">
            <h3 className="text-[13px] font-medium text-fg">{t("logHeading")}</h3>
            {log.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (log.data?.data.length ?? 0) === 0 ? (
              <p className="text-[13px] text-fg-muted">{t("emptyLog")}</p>
            ) : (
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-[13px]">
                {log.data?.data.map((entry) => (
                  <li key={entry.id} className="rounded-sm border border-border bg-surface p-2">
                    <span className="text-fg">{formatDateTime(entry.started_at, { locale })}</span>
                    {entry.visitor_name && (
                      <span className="text-fg-muted"> - {entry.visitor_name}</span>
                    )}
                    {!entry.ended_at && (
                      <span className="ml-2 text-fg-muted">({t("ongoing")})</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

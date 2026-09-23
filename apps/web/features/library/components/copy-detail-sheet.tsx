"use client";

import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  ConfirmDialog,
  Select,
  Sheet,
  SheetContent,
  Skeleton,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import {
  type LibraryCopy,
  type LibraryCopyStatus,
  useDeleteLibraryCopyMutation,
  useLibraryCopyEventsQuery,
  useSetLibraryCopyStatusMutation,
} from "../api";
import { useLibraryErrorMessage } from "../use-library-error-message";

const MANUAL_STATUSES: LibraryCopyStatus[] = [
  "available",
  "damaged",
  "lost",
  "in_repair",
  "processing",
  "donated",
  "reserve_stack",
  "unknown",
];

/**
 * Per-copy detail: manual status change, delete (refused while ever
 * borrowed or currently on loan), and the audit trail of events.
 */
export function CopyDetailSheet({
  copy,
  canManage,
  onOpenChange,
  onDeleted,
}: {
  copy: LibraryCopy | null;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}): ReactElement {
  const t = useTranslations("app.library.copies.detail");
  const tCondition = useTranslations("app.library.copies.condition");
  const tStatus = useTranslations("app.library.copiesBrowser.status");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const libraryErrorMessage = useLibraryErrorMessage();

  const events = useLibraryCopyEventsQuery(copy?.id ?? "", copy !== null);
  const setStatus = useSetLibraryCopyStatusMutation();
  const deleteCopy = useDeleteLibraryCopyMutation();

  const [nextStatus, setNextStatus] = useState<LibraryCopyStatus | "">("");
  const [note, setNote] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const statusLabel = (value: string | undefined) =>
    value && tStatus.has(value as LibraryCopyStatus) ? tStatus(value as LibraryCopyStatus) : "-";

  function reset() {
    setNextStatus("");
    setNote("");
    setConfirmingDelete(false);
  }

  return (
    <>
      <Sheet
        open={copy !== null}
        onOpenChange={(open) => {
          if (!open) reset();
          onOpenChange(open);
        }}
      >
        <SheetContent
          title={copy?.barcode ?? ""}
          description={
            copy?.accession_number && copy.accession_number !== copy.barcode
              ? copy.accession_number
              : undefined
          }
          className="md:mx-auto md:max-w-2xl md:rounded-t-md md:border-x"
        >
          {copy && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={copy.status === "available" ? "accent" : "neutral"}>
                  {tStatus(copy.status)}
                </Badge>
                <span className="text-[13px] text-fg-muted">
                  {t("condition", { condition: tCondition(copy.condition) })}
                </span>
              </div>

              {canManage && copy.status === "on_loan" && (
                <p className="rounded-sm border border-border bg-surface p-3 text-[13px] text-fg-muted">
                  {t("statusBlockedByLoan")}
                </p>
              )}

              {canManage && copy.status !== "on_loan" && (
                <form
                  className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!nextStatus) return;
                    setStatus.mutate(
                      { copyId: copy.id, status: nextStatus, note: note.trim() || undefined },
                      {
                        onSuccess: () => {
                          toast.success(t("statusChanged"));
                          setNextStatus("");
                          setNote("");
                        },
                        onError: (error) => {
                          toast.error(libraryErrorMessage(error));
                          setConfirmingDelete(false);
                        },
                      },
                    );
                  }}
                >
                  <h3 className="text-[13px] font-medium text-fg">{t("changeStatus")}</h3>
                  <label className="flex flex-col gap-1 text-[13px]">
                    <span className="font-medium">{t("newStatus")}</span>
                    <Select
                      options={MANUAL_STATUSES.filter((value) => value !== copy.status).map(
                        (value) => ({ value, label: tStatus(value) }),
                      )}
                      value={nextStatus}
                      onValueChange={(value) => {
                        setNextStatus(value as LibraryCopyStatus);
                      }}
                      placeholder={t("newStatusPlaceholder")}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[13px]">
                    <span className="font-medium">{t("note")}</span>
                    <Textarea
                      value={note}
                      onChange={(e) => {
                        setNote(e.target.value);
                      }}
                      maxLength={500}
                      rows={2}
                    />
                  </label>
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    className="self-start"
                    disabled={!nextStatus}
                    loading={setStatus.isPending}
                  >
                    {t("applyStatus")}
                  </Button>
                </form>
              )}

              <div className="flex flex-col gap-2">
                <h3 className="text-[13px] font-medium text-fg">{t("eventsHeading")}</h3>
                {events.isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : (events.data?.data.length ?? 0) === 0 ? (
                  <p className="text-[13px] text-fg-muted">{t("noEvents")}</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-[13px]">
                    {events.data?.data.map((event) => (
                      <li key={event.id} className="rounded-sm border border-border bg-surface p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-fg">
                            {t(`eventType.${event.event_type}`)}
                          </span>
                          <span className="text-[12px] text-fg-muted">
                            {formatDateTime(event.created_at, { locale })}
                          </span>
                        </div>
                        {(Boolean(event.from_status) || Boolean(event.to_status)) && (
                          <p className="text-[12px] text-fg-muted">
                            {event.from_status
                              ? t("statusTransition", {
                                  from: statusLabel(event.from_status),
                                  to: statusLabel(event.to_status),
                                })
                              : statusLabel(event.to_status)}
                          </p>
                        )}
                        {event.note && <p className="text-[12px] text-fg-muted">{event.note}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {canManage && (
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    icon={<Trash2 />}
                    className="self-start"
                    onClick={() => {
                      setConfirmingDelete(true);
                    }}
                  >
                    {t("deleteCopy")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t("deleteCopy")}
        description={copy ? t("deleteBody", { barcode: copy.barcode }) : ""}
        confirmLabel={t("deleteConfirm")}
        destructive
        confirming={deleteCopy.isPending}
        onConfirm={async () => {
          if (!copy) return;
          try {
            await deleteCopy.mutateAsync(copy.id);
            toast.success(t("deleted"));
            setConfirmingDelete(false);
            onDeleted();
          } catch (error) {
            toast.error(libraryErrorMessage(error));
            setConfirmingDelete(false);
          }
        }}
      />
    </>
  );
}

"use client";

import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  FormSection,
  List,
  ListRow,
  Select,
  Sheet,
  SheetContent,
  SkeletonList,
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
import { COPY_STATUS_TONE, toneOf } from "../lib/status-tones";
import { useLibraryErrorMessage } from "../use-library-error-message";
import { useTenantTimeZone } from "../use-tenant-timezone";

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
 * One copy in a drawer (a bottom sheet on a phone): its status and
 * condition, a manual status change, the history of what happened to it,
 * and deleting it (refused while it was ever borrowed or is on loan),
 * which asks first.
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
  const timeZone = useTenantTimeZone();
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
          side="right"
          size="md"
          footer={
            canManage && copy ? (
              <Button
                variant="danger"
                icon={<Trash2 />}
                onClick={() => {
                  setConfirmingDelete(true);
                }}
              >
                {t("deleteCopy")}
              </Button>
            ) : undefined
          }
        >
          {copy && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={toneOf(COPY_STATUS_TONE, copy.status)}>{tStatus(copy.status)}</Badge>
                <span className="text-body-sm text-fg-muted">
                  {t("condition", { condition: tCondition(copy.condition) })}
                </span>
              </div>

              {canManage && copy.status === "on_loan" && <Alert title={t("statusBlockedByLoan")} />}

              {canManage && copy.status !== "on_loan" && (
                <Card asChild padding="md">
                  <form
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
                    <FormSection title={t("changeStatus")} columns={1}>
                      <Field label={t("newStatus")}>
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
                      </Field>
                      <Field label={t("note")}>
                        <Textarea
                          value={note}
                          onChange={(e) => {
                            setNote(e.target.value);
                          }}
                          maxLength={500}
                          rows={2}
                        />
                      </Field>
                    </FormSection>
                    <Button
                      type="submit"
                      variant="secondary"
                      className="self-start"
                      disabled={!nextStatus}
                      loading={setStatus.isPending}
                    >
                      {t("applyStatus")}
                    </Button>
                  </form>
                </Card>
              )}

              <section className="flex flex-col gap-2">
                <h3 className="text-heading text-fg">{t("eventsHeading")}</h3>
                {events.isLoading ? (
                  <SkeletonList rows={3} />
                ) : (events.data?.data.length ?? 0) === 0 ? (
                  <p className="text-body-sm text-fg-muted">{t("noEvents")}</p>
                ) : (
                  <List framed dense aria-label={t("eventsHeading")}>
                    {events.data?.data.map((event) => (
                      <ListRow
                        key={event.id}
                        title={t(`eventType.${event.event_type}`)}
                        meta={[
                          event.from_status || event.to_status
                            ? event.from_status
                              ? t("statusTransition", {
                                  from: statusLabel(event.from_status),
                                  to: statusLabel(event.to_status),
                                })
                              : statusLabel(event.to_status)
                            : undefined,
                          event.note,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        trailing={
                          <span className="text-caption text-fg-muted">
                            {formatDateTime(event.created_at, { locale, timeZone })}
                          </span>
                        }
                      />
                    ))}
                  </List>
                )}
              </section>
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
        tone="danger"
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

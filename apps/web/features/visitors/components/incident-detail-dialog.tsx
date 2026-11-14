"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataList,
  DataListItem,
  Dialog,
  DialogContent,
  SemanticStatusBadge,
  SkeletonDetail,
  useToast,
} from "@newsekolah/ui";
import { Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useCloseIncidentMutation, useIncidentQuery } from "../api";
import { SEVERITY_VARIANT } from "../lib/incident-severity";

import { IncidentForm } from "./incident-form";

/**
 * One incident: its status and severity, when it happened, the account,
 * who was involved and what was done. While it is open, a manager can edit
 * it or close it (after a confirmation, since a closed incident is final).
 */
export function IncidentDetailDialog({
  incidentId,
  onOpenChange,
}: {
  incidentId: string | null;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.visitors.incidents.detail");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_visitor_incidents");
  const close = useCloseIncidentMutation();
  const { me } = useSession();
  const [editing, setEditing] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const {
    data: incident,
    isLoading,
    isError,
    error,
    refetch,
  } = useIncidentQuery(incidentId ?? "", incidentId !== null);
  const canChange = canManage && incident !== undefined && !incident.is_closed && !editing;

  return (
    <Dialog
      open={incidentId !== null}
      onOpenChange={(open) => {
        if (!open) setEditing(false);
        onOpenChange(open);
      }}
    >
      <DialogContent
        title={editing ? t("editTitle") : t("title")}
        size="lg"
        footer={
          canChange ? (
            <>
              <Button
                variant="secondary"
                icon={<Pencil />}
                onClick={() => {
                  setEditing(true);
                }}
              >
                {t("edit")}
              </Button>
              <Button
                loading={close.isPending}
                onClick={() => {
                  setConfirmingClose(true);
                }}
              >
                {t("close")}
              </Button>
            </>
          ) : undefined
        }
      >
        {isLoading && <SkeletonDetail />}
        {isError && !incident && <QueryError retry={() => refetch()} error={error} />}
        {incident && !editing && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <SemanticStatusBadge
                status={incident.is_closed ? "closed" : "open"}
                label={t(incident.is_closed ? "status.closed" : "status.open")}
              />
              <Badge tone={SEVERITY_VARIANT[incident.severity]} dot>
                {t(`severities.${incident.severity}`)}
              </Badge>
            </div>
            <DataList>
              <DataListItem label={t("occurredAt")}>
                {formatDateTime(incident.occurred_at, { locale, timeZone: me?.tenant.timezone })}
              </DataListItem>
              <DataListItem label={t("description")}>
                <span className="whitespace-pre-wrap">{incident.description}</span>
              </DataListItem>
              <DataListItem label={t("personsInvolved")}>
                {incident.persons_involved && (
                  <span className="whitespace-pre-wrap">{incident.persons_involved}</span>
                )}
              </DataListItem>
              <DataListItem label={t("actionTaken")}>
                {incident.action_taken && (
                  <span className="whitespace-pre-wrap">{incident.action_taken}</span>
                )}
              </DataListItem>
            </DataList>
          </div>
        )}
        {incident && editing && (
          <IncidentForm
            incident={incident}
            onDone={() => {
              setEditing(false);
            }}
          />
        )}
        {incident && (
          <ConfirmDialog
            open={confirmingClose}
            onOpenChange={setConfirmingClose}
            title={t("closeDialog.title")}
            description={t("closeDialog.body")}
            confirmLabel={t("close")}
            confirming={close.isPending}
            onConfirm={() => {
              close.mutate(incident.id, {
                onSuccess: () => {
                  toast.success(t("closed"));
                },
                onError: (closeError) => {
                  toast.error(
                    closeError instanceof ApiError
                      ? apiErrorMessage(closeError.code)
                      : apiErrorMessage("UNKNOWN"),
                  );
                },
                onSettled: () => {
                  setConfirmingClose(false);
                },
              });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

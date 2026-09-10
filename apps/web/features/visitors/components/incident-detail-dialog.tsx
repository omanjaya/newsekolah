"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Badge, Button, Dialog, DialogContent, useToast } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useCloseIncidentMutation, useIncidentQuery } from "../api";

import { IncidentForm } from "./incident-form";

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
  const [editing, setEditing] = useState(false);

  const { data: incident, isLoading } = useIncidentQuery(incidentId ?? "", incidentId !== null);

  return (
    <Dialog open={incidentId !== null} onOpenChange={onOpenChange}>
      <DialogContent title={t("title")}>
        {isLoading && <p className="text-[13px] text-fg-muted">{t("loading")}</p>}
        {incident && !editing && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={incident.is_closed ? "neutral" : "accent"}>
                {t(incident.is_closed ? "status.closed" : "status.open")}
              </Badge>
              <span className="text-[13px] text-fg-muted">
                {formatDateTime(incident.occurred_at, { locale })}
              </span>
            </div>
            <dl className="flex flex-col gap-2 text-[13px]">
              <div>
                <dt className="font-medium text-fg-muted">{t("severity")}</dt>
                <dd>{t(`severities.${incident.severity}`)}</dd>
              </div>
              <div>
                <dt className="font-medium text-fg-muted">{t("description")}</dt>
                <dd className="whitespace-pre-wrap">{incident.description}</dd>
              </div>
              {incident.persons_involved && (
                <div>
                  <dt className="font-medium text-fg-muted">{t("personsInvolved")}</dt>
                  <dd className="whitespace-pre-wrap">{incident.persons_involved}</dd>
                </div>
              )}
              {incident.action_taken && (
                <div>
                  <dt className="font-medium text-fg-muted">{t("actionTaken")}</dt>
                  <dd className="whitespace-pre-wrap">{incident.action_taken}</dd>
                </div>
              )}
            </dl>
            {canManage && !incident.is_closed && (
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing(true);
                  }}
                >
                  {t("edit")}
                </Button>
                <Button
                  loading={close.isPending}
                  onClick={() => {
                    close.mutate(incident.id, {
                      onSuccess: () => {
                        toast.success(t("closed"));
                      },
                      onError: (error) => {
                        toast.error(
                          error instanceof ApiError
                            ? apiErrorMessage(error.code)
                            : apiErrorMessage("UNKNOWN"),
                        );
                      },
                    });
                  }}
                >
                  {t("close")}
                </Button>
              </div>
            )}
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
      </DialogContent>
    </Dialog>
  );
}

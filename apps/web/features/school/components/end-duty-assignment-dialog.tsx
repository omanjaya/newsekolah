"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Dialog, DialogContent, Input, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../attendance/api";
import { type DutyAssignment } from "../api";
import { useUpdateDutyAssignmentMutation } from "../duties-api";

/**
 * Ends a duty assignment on a chosen date (`PUT /v1/duty-assignments/{id}`
 * with `is_active: false`), keeping the row so it can be reactivated later.
 */
export function EndDutyAssignmentDialog({
  assignment,
  onClose,
}: {
  assignment: DutyAssignment | null;
  onClose: () => void;
}): ReactElement {
  return (
    <Dialog
      open={assignment !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {assignment && <EndForm key={assignment.id} assignment={assignment} onClose={onClose} />}
    </Dialog>
  );
}

function EndForm({
  assignment,
  onClose,
}: {
  assignment: DutyAssignment;
  onClose: () => void;
}): ReactElement {
  const t = useTranslations("app.school.duties");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();
  const update = useUpdateDutyAssignmentMutation();
  const [endsOn, setEndsOn] = useState(() => todayInZone(me?.tenant.timezone));

  return (
    <DialogContent title={t("end")}>
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-fg-muted">{t("endBody", { duty: assignment.duty_name })}</p>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("endsOn")}</span>
          <Input
            type="date"
            value={endsOn}
            min={assignment.starts_on}
            onChange={(e) => {
              setEndsOn(e.target.value);
            }}
          />
        </label>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            loading={update.isPending}
            disabled={!endsOn}
            onClick={() => {
              update.mutate(
                { id: assignment.id, body: { is_active: false, ends_on: endsOn } },
                {
                  onSuccess: () => {
                    toast.success(t("ended"));
                    onClose();
                  },
                  onError: (error) => {
                    toast.error(
                      error instanceof ApiError
                        ? apiErrorMessage(error.code)
                        : apiErrorMessage("UNKNOWN"),
                    );
                  },
                },
              );
            }}
          >
            {t("end")}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

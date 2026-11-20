"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  useToast,
} from "@newsekolah/ui";
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
  // Today, but never before the assignment's own start: the picker refuses
  // earlier days and the API answers them with VALIDATION_FAILED, so a
  // default of today on a row that starts later could not be submitted.
  const [endsOn, setEndsOn] = useState(() => {
    const today = todayInZone(me?.tenant.timezone);
    return assignment.starts_on > today ? assignment.starts_on : today;
  });

  return (
    <DialogContent title={t("end")}>
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-fg-muted">{t("endBody", { duty: assignment.duty_name })}</p>
        <Field label={t("endsOn")}>
          <DatePicker value={endsOn} min={assignment.starts_on} onChange={setEndsOn} />
        </Field>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            loading={update.isPending}
            disabled={!endsOn || endsOn < assignment.starts_on}
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
        </DialogFooter>
      </div>
    </DialogContent>
  );
}

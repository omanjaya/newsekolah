"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  DialogFooter,
  NumberInput,
  FormError,
  Field,
  Button,
  Dialog,
  DialogContent,
  Select,
  Textarea,
  useSubmitValidation,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import {
  type LibraryPenalty,
  type LibraryViolationKind,
  useCreateLibraryViolationMutation,
} from "../violations-api";

const KINDS: LibraryViolationKind[] = ["late", "lost", "damaged", "other"];
const PENALTIES: LibraryPenalty[] = ["fine", "suspend", "warning", "replace_book"];

/** Records a violation not tied to an automatic return (damage found, other issue). */
export function ViolationRecordDialog({
  open,
  onOpenChange,
  onRecorded,
  initialMemberUserId = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
  initialMemberUserId?: string;
}): ReactElement {
  const t = useTranslations("app.library.violations.form");
  const tViolations = useTranslations("app.library.violations");
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateLibraryViolationMutation();
  const memberLabels = useDirectoryPickerLabels(t("memberPlaceholder"));

  const [memberUserId, setMemberUserId] = useState(initialMemberUserId);
  const [kind, setKind] = useState<LibraryViolationKind>("damaged");
  const [penalty, setPenalty] = useState<LibraryPenalty>("fine");
  const [amount, setAmount] = useState("0");
  const [suspendDays, setSuspendDays] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const { ref: formRef, attempted, check, reset: resetValidation } = useSubmitValidation();
  const tValidation = useTranslations("validation");

  function reset() {
    setMemberUserId(initialMemberUserId);
    setKind("damaged");
    setPenalty("fine");
    setAmount("0");
    setSuspendDays("0");
    setNotes("");
    setError("");
    resetValidation();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent title={t("title")} size="md">
        <form
          ref={formRef}
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            if (!check(Boolean(memberUserId))) return;
            create.mutate(
              {
                member_user_id: memberUserId,
                kind,
                penalty,
                amount: Number(amount) || 0,
                suspend_days: Number(suspendDays) || 0,
                notes: notes.trim() || undefined,
              },
              {
                onSuccess: () => {
                  reset();
                  onRecorded();
                },
                onError: (err) => {
                  setError(
                    err instanceof ApiError
                      ? apiErrorMessage(err.code)
                      : apiErrorMessage("UNKNOWN"),
                  );
                },
              },
            );
          }}
        >
          <Field
            label={t("member")}
            required
            error={attempted && !memberUserId ? tValidation("required") : undefined}
          >
            <DirectoryPicker
              value={memberUserId}
              onValueChange={setMemberUserId}
              labels={memberLabels}
              showUsername
            />
          </Field>
          <Field label={t("kind")}>
            <Select
              options={KINDS.map((k) => ({ value: k, label: tViolations(`kinds.${k}`) }))}
              value={kind}
              onValueChange={(v) => {
                setKind(v as LibraryViolationKind);
              }}
            />
          </Field>
          <Field label={t("penalty")}>
            <Select
              options={PENALTIES.map((p) => ({ value: p, label: tViolations(`penalties.${p}`) }))}
              value={penalty}
              onValueChange={(v) => {
                setPenalty(v as LibraryPenalty);
              }}
            />
          </Field>
          {penalty === "fine" && (
            <Field label={t("amount")}>
              <NumberInput
                min={0}
                value={amount === "" ? null : Number(amount)}
                onChange={(next) => {
                  setAmount(next === null ? "" : String(next));
                }}
              />
            </Field>
          )}
          {penalty === "suspend" && (
            <Field label={t("suspendDays")}>
              <NumberInput
                min={0}
                value={suspendDays === "" ? null : Number(suspendDays)}
                onChange={(next) => {
                  setSuspendDays(next === null ? "" : String(next));
                }}
              />
            </Field>
          )}
          <Field label={t("notes")}>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              maxLength={500}
            />
          </Field>
          {error && <FormError>{error}</FormError>}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                // Cancel resets like Escape does: the dialog stays mounted.
                reset();
                onOpenChange(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" loading={create.isPending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

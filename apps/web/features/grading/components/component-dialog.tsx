"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  NumberInput,
  Select,
  useSingleFlight,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useId, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type AssessmentComponent,
  type AssessmentComponentKind,
  useCreateComponentMutation,
  useDeleteComponentMutation,
  useUpdateComponentMutation,
} from "../api";
import { fromText, toText } from "../lib/number-text";

const KINDS: AssessmentComponentKind[] = [
  "formative",
  "summative",
  "project",
  "practical",
  "attitude",
  "other",
];

export interface ComponentDialogProps {
  onOpenChange: (open: boolean) => void;
  classId: string;
  subjectId: string;
  termId?: string;
  nextSequence: number;
  /** "new" adds a component; an existing component opens it for edit or delete. */
  target: AssessmentComponent | "new";
  /**
   * The edited component's column still holds a score. The API refuses to
   * delete such a component (ASSESSMENT_COMPONENT_HAS_GRADES), so Delete is
   * disabled with a hint to clear the column first.
   */
  hasScores?: boolean;
}

/**
 * Create, edit, or delete one assessment component (a gradebook column).
 * Delete is confirmed separately and only offered once the column holds no
 * score: the API never deletes a component together with its grades. The
 * caller mounts this only while a dialog
 * target is set, so each open starts from a fresh component instance and
 * its form state never needs resetting from an effect.
 */
export function ComponentDialog({
  onOpenChange,
  classId,
  subjectId,
  termId,
  nextSequence,
  target,
  hasScores = false,
}: ComponentDialogProps): ReactElement {
  const t = useTranslations("app.grading.componentDialog");
  const tKind = useTranslations("app.grading.kind");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateComponentMutation();
  const update = useUpdateComponentMutation();
  const remove = useDeleteComponentMutation();
  const editing = target === "new" ? null : target;
  const deleteBlockedId = useId();
  const deleteBlocked = editing !== null && hasScores;

  const [code, setCode] = useState(editing?.code ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [kind, setKind] = useState<AssessmentComponentKind>(editing?.kind ?? "formative");
  const [weight, setWeight] = useState(String(editing?.weight ?? 1));
  const [kktp, setKktp] = useState(editing?.kktp !== undefined ? String(editing.kktp) : "");
  const [sequence, setSequence] = useState(String(editing?.sequence ?? nextSequence));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function fail(error: unknown) {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  // Guarded so a double click on Simpan sends one request: the button's
  // `loading` only takes effect after a re-render, and a second create
  // would come back as a confusing "code already used" error.
  const save = useSingleFlight(async () => {
    const weightValue = Number(weight);
    const sequenceValue = Number(sequence);
    if (!code.trim() || !Number.isFinite(weightValue) || weightValue <= 0) return;
    const body = {
      class_id: classId,
      subject_id: subjectId,
      ...(termId ? { term_id: termId } : {}),
      code: code.trim(),
      // Always sent, so an untouched edit keeps the stored text and an
      // emptied field clears it on purpose.
      description: description.trim(),
      kind,
      weight: weightValue,
      sequence: Number.isFinite(sequenceValue) ? sequenceValue : nextSequence,
      ...(kktp.trim() ? { kktp: Number(kktp) } : {}),
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, body });
      } else {
        await create.mutateAsync(body);
      }
      toast.success(t("saved"));
      onOpenChange(false);
    } catch (error) {
      fail(error);
    }
  });

  const confirmDelete = useSingleFlight(async () => {
    if (!editing) return;
    try {
      await remove.mutateAsync(editing.id);
      toast.success(t("deleted"));
      setConfirmingDelete(false);
      onOpenChange(false);
    } catch (error) {
      fail(error);
    }
  });

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent title={editing ? t("editTitle") : t("addTitle")}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field label={t("code")}>
              <Input
                value={code}
                maxLength={32}
                onChange={(e) => {
                  setCode(e.target.value);
                }}
                required
              />
            </Field>
            <Field label={t("description")} hint={t("descriptionHint")}>
              <Input
                value={description}
                maxLength={500}
                placeholder={t("descriptionPlaceholder")}
                onChange={(e) => {
                  setDescription(e.target.value);
                }}
              />
            </Field>
            <Field label={t("kind")}>
              <Select
                options={KINDS.map((value) => ({ value, label: tKind(value) }))}
                value={kind}
                onValueChange={(value) => {
                  setKind(value as AssessmentComponentKind);
                }}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("weight")}>
                <NumberInput
                  min={0}
                  step={0.1}
                  value={fromText(weight)}
                  onChange={(value) => {
                    setWeight(toText(value));
                  }}
                  required
                />
              </Field>
              <Field label={t("sequence")}>
                <NumberInput
                  min={1}
                  step={1}
                  value={fromText(sequence)}
                  onChange={(value) => {
                    setSequence(toText(value));
                  }}
                />
              </Field>
            </div>
            <Field label={t("kktp")}>
              <NumberInput
                min={0}
                step={1}
                value={fromText(kktp)}
                placeholder={t("kktpPlaceholder")}
                onChange={(value) => {
                  setKktp(toText(value));
                }}
              />
            </Field>
            {deleteBlocked && (
              <p id={deleteBlockedId} className="text-body-sm text-fg-muted">
                {t("deleteBlocked")}
              </p>
            )}
            <DialogFooter className="sm:justify-between">
              {editing ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-danger"
                  disabled={hasScores}
                  // The reason it is disabled, read with the button.
                  aria-describedby={deleteBlocked ? deleteBlockedId : undefined}
                  onClick={() => {
                    setConfirmingDelete(true);
                  }}
                >
                  {t("delete")}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2 max-sm:contents">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    onOpenChange(false);
                  }}
                >
                  {t("cancel")}
                </Button>
                <Button type="submit" loading={create.isPending || update.isPending}>
                  {t("save")}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t("deleteTitle")}
        description={editing ? t("deleteBody", { code: editing.code }) : ""}
        confirmLabel={t("delete")}
        tone="danger"
        confirming={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  );
}

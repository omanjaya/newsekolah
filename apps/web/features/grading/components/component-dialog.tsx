"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Input,
  Select,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type AssessmentComponent,
  type AssessmentComponentKind,
  useCreateComponentMutation,
  useDeleteComponentMutation,
  useUpdateComponentMutation,
} from "../api";

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
}

/**
 * Create, edit, or delete one assessment component (a gradebook column).
 * Delete is confirmed separately since it also removes every score already
 * entered for that column. The caller mounts this only while a dialog
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
}: ComponentDialogProps): ReactElement {
  const t = useTranslations("app.grading.componentDialog");
  const tKind = useTranslations("app.grading.kind");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateComponentMutation();
  const update = useUpdateComponentMutation();
  const remove = useDeleteComponentMutation();
  const editing = target === "new" ? null : target;

  const [code, setCode] = useState(editing?.code ?? "");
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

  async function save() {
    const weightValue = Number(weight);
    const sequenceValue = Number(sequence);
    if (!code.trim() || !Number.isFinite(weightValue) || weightValue <= 0) return;
    const body = {
      class_id: classId,
      subject_id: subjectId,
      ...(termId ? { term_id: termId } : {}),
      code: code.trim(),
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
  }

  async function confirmDelete() {
    if (!editing) return;
    try {
      await remove.mutateAsync(editing.id);
      toast.success(t("deleted"));
      setConfirmingDelete(false);
      onOpenChange(false);
    } catch (error) {
      fail(error);
    }
  }

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
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("code")}</span>
              <Input
                value={code}
                maxLength={32}
                onChange={(e) => {
                  setCode(e.target.value);
                }}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("kind")}</span>
              <Select
                options={KINDS.map((value) => ({ value, label: tKind(value) }))}
                value={kind}
                onValueChange={(value) => {
                  setKind(value as AssessmentComponentKind);
                }}
              />
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium">{t("weight")}</span>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={weight}
                  onChange={(e) => {
                    setWeight(e.target.value);
                  }}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium">{t("sequence")}</span>
                <Input
                  type="number"
                  min={1}
                  step="1"
                  value={sequence}
                  onChange={(e) => {
                    setSequence(e.target.value);
                  }}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("kktp")}</span>
              <Input
                type="number"
                min={0}
                step="1"
                value={kktp}
                placeholder={t("kktpPlaceholder")}
                onChange={(e) => {
                  setKktp(e.target.value);
                }}
              />
            </label>
            <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
              {editing ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setConfirmingDelete(true);
                  }}
                >
                  {t("delete")}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
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
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t("deleteTitle")}
        description={editing ? t("deleteBody", { code: editing.code }) : ""}
        confirmLabel={t("delete")}
        destructive
        confirming={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  );
}

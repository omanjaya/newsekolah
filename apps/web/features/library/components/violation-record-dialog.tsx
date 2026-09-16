"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Dialog, DialogContent, Input, Select, Textarea } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery } from "../../reference/api";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
}): ReactElement {
  const t = useTranslations("app.library.violations.form");
  const apiErrorMessage = useApiErrorMessage();
  const directory = useDirectoryQuery();
  const create = useCreateLibraryViolationMutation();

  const [memberUserId, setMemberUserId] = useState("");
  const [kind, setKind] = useState<LibraryViolationKind>("damaged");
  const [penalty, setPenalty] = useState<LibraryPenalty>("fine");
  const [amount, setAmount] = useState("0");
  const [suspendDays, setSuspendDays] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const memberOptions = (directory.data?.data ?? []).map((u) => ({
    value: u.id,
    label: `${u.name} (${u.username})`,
  }));

  function reset() {
    setMemberUserId("");
    setKind("damaged");
    setPenalty("fine");
    setAmount("0");
    setSuspendDays("0");
    setNotes("");
    setError("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent title={t("title")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            if (!memberUserId) return;
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
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("member")}</span>
            <Select
              options={memberOptions}
              value={memberUserId}
              onValueChange={setMemberUserId}
              placeholder={directory.isLoading ? t("loadingMembers") : t("memberPlaceholder")}
              disabled={directory.isLoading}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("kind")}</span>
            <Select
              options={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
              value={kind}
              onValueChange={(v) => {
                setKind(v as LibraryViolationKind);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("penalty")}</span>
            <Select
              options={PENALTIES.map((p) => ({ value: p, label: t(`penalties.${p}`) }))}
              value={penalty}
              onValueChange={(v) => {
                setPenalty(v as LibraryPenalty);
              }}
            />
          </label>
          {penalty === "fine" && (
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("amount")}</span>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                }}
              />
            </label>
          )}
          {penalty === "suspend" && (
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("suspendDays")}</span>
              <Input
                type="number"
                min={0}
                value={suspendDays}
                onChange={(e) => {
                  setSuspendDays(e.target.value);
                }}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("notes")}</span>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              maxLength={500}
            />
          </label>
          {error && <p className="text-[13px] text-status-absent">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!memberUserId}>
              {t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

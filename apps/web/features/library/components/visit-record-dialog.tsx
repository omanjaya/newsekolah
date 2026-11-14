"use client";

import { ApiError } from "@newsekolah/api-client";
import { FormError, Field, Button, Dialog, DialogContent, Input, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import { type LibraryVisitKind, useRecordLibraryVisitMutation } from "../visits-api";

const KINDS: LibraryVisitKind[] = ["member", "non_member", "group"];

export function VisitRecordDialog({
  open,
  onOpenChange,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
}): ReactElement {
  const t = useTranslations("app.library.visits.form");
  // The visitor-kind labels are shared with the visits table, so they live
  // one level up rather than being duplicated inside the form namespace.
  const tKind = useTranslations("app.library.visits.kinds");
  const apiErrorMessage = useApiErrorMessage();
  const record = useRecordLibraryVisitMutation();
  const memberLabels = useDirectoryPickerLabels(t("memberPlaceholder"));

  const [kind, setKind] = useState<LibraryVisitKind>("member");
  const [memberUserId, setMemberUserId] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [groupSize, setGroupSize] = useState("1");
  const [error, setError] = useState("");

  function reset() {
    setKind("member");
    setMemberUserId("");
    setVisitorName("");
    setPurpose("");
    setGroupSize("1");
    setError("");
  }

  const canSubmit = kind === "member" ? Boolean(memberUserId) : visitorName.trim() !== "";

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
            if (!canSubmit) return;
            record.mutate(
              {
                kind,
                member_user_id: kind === "member" ? memberUserId : undefined,
                visitor_name: kind === "member" ? undefined : visitorName.trim(),
                purpose: purpose.trim() || undefined,
                group_size: kind === "group" ? Number(groupSize) || 1 : 1,
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
          <Field label={t("kind")}>
            <Select
              options={KINDS.map((k) => ({ value: k, label: tKind(k) }))}
              value={kind}
              onValueChange={(v) => {
                setKind(v as LibraryVisitKind);
              }}
            />
          </Field>
          {kind === "member" ? (
            <Field label={t("member")}>
              <DirectoryPicker
                value={memberUserId}
                onValueChange={setMemberUserId}
                labels={memberLabels}
                showUsername
              />
            </Field>
          ) : (
            <label className="flex flex-col gap-1 text-body-sm">
              <span className="font-medium">
                {kind === "group" ? t("groupName") : t("visitorName")}
              </span>
              <Input
                value={visitorName}
                onChange={(e) => {
                  setVisitorName(e.target.value);
                }}
                maxLength={150}
                required
              />
            </label>
          )}
          {kind === "group" && (
            <Field label={t("groupSize")}>
              <Input
                type="number"
                min={1}
                value={groupSize}
                onChange={(e) => {
                  setGroupSize(e.target.value);
                }}
              />
            </Field>
          )}
          <Field label={t("purpose")}>
            <Input
              value={purpose}
              onChange={(e) => {
                setPurpose(e.target.value);
              }}
              maxLength={200}
              placeholder={t("purposePlaceholder")}
            />
          </Field>
          {error && <FormError>{error}</FormError>}
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
            <Button type="submit" loading={record.isPending} disabled={!canSubmit}>
              {t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

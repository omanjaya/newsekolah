"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Dialog, DialogContent, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useClassesQuery } from "../../reference/api";
import {
  type LibraryBulkRegisterResult,
  useBulkRegisterLibraryMembersMutation,
  useLibraryMemberTypesQuery,
} from "../members-api";

const ROLES = ["student", "teacher", "staff", "parent"] as const;
type Role = (typeof ROLES)[number];

/** Registers every user of one role (optionally one class) not already a member. */
export function MemberBulkRegisterDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.library.members.bulkRegister");
  const tRole = useTranslations("app.library.members.roles");
  const apiErrorMessage = useApiErrorMessage();
  const memberTypes = useLibraryMemberTypesQuery();
  const classes = useClassesQuery();
  const bulkRegister = useBulkRegisterLibraryMembersMutation();

  const [role, setRole] = useState<Role>("student");
  const [classId, setClassId] = useState("");
  const [memberTypeId, setMemberTypeId] = useState("");
  const [result, setResult] = useState<LibraryBulkRegisterResult | null>(null);
  const [error, setError] = useState("");

  const typeOptions = (memberTypes.data?.data ?? []).map((mt) => ({
    value: mt.id,
    label: mt.name,
  }));
  const classOptions = (classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  function reset() {
    setResult(null);
    setError("");
    setClassId("");
    setMemberTypeId("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent title={t("title")} description={t("description")}>
        {result ? (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-fg">
              {t("resultSummary", {
                registered: result.registered.length,
                failed: result.failed.length,
              })}
            </p>
            {result.failed.length > 0 && (
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-sm border border-border p-2 text-[13px]">
                {result.failed.map((f) => (
                  <li key={f.user_id} className="text-fg-muted">
                    {f.user_id}: {f.reason}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end border-t border-border pt-4">
              <Button
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                {t("close")}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              if (!memberTypeId) return;
              bulkRegister.mutate(
                {
                  member_type_id: memberTypeId,
                  role,
                  class_id: role === "student" && classId ? classId : undefined,
                },
                {
                  onSuccess: (data) => {
                    setResult(data);
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
              <span className="font-medium">{t("role")}</span>
              <Select
                options={ROLES.map((r) => ({ value: r, label: tRole(r) }))}
                value={role}
                onValueChange={(value) => {
                  setRole(value as Role);
                  setClassId("");
                }}
              />
            </label>
            {role === "student" && (
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium">{t("classOptional")}</span>
                <Select
                  options={classOptions}
                  value={classId}
                  onValueChange={setClassId}
                  placeholder={t("classAll")}
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("memberType")}</span>
              <Select
                options={typeOptions}
                value={memberTypeId}
                onValueChange={setMemberTypeId}
                placeholder={t("memberTypePlaceholder")}
                disabled={memberTypes.isLoading}
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
              <Button type="submit" loading={bulkRegister.isPending} disabled={!memberTypeId}>
                {t("submit")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

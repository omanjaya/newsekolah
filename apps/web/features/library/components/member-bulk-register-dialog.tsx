"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  DialogFooter,
  FormError,
  Field,
  Button,
  Dialog,
  DialogContent,
  Select,
  useSubmitValidation,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useClassesQuery } from "../../reference/api";
import {
  type LibraryBulkRegisterResult,
  useBulkRegisterLibraryMembersMutation,
} from "../members-api";
import { MEMBER_ROLES, type MemberRole, useMemberTypeChoice } from "../use-member-type-choice";

import { RejectedReasonList } from "./rejected-reason-list";

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
  const tValidation = useTranslations("validation");
  const apiErrorMessage = useApiErrorMessage();
  // Narrowing bulk registration to one class is a convenience, not a
  // requirement (the role alone is enough to register everyone) -- so a
  // role without view_academic_data (e.g. the librarian) just registers
  // by role instead of firing a request the API will 403 on.
  const canViewClasses = useCan("view_academic_data");
  const classes = useClassesQuery(canViewClasses);
  const bulkRegister = useBulkRegisterLibraryMembersMutation();

  const [role, setRole] = useState<MemberRole>("student");
  const [classId, setClassId] = useState("");
  const memberType = useMemberTypeChoice(role);
  const memberTypeId = memberType.value;
  const [result, setResult] = useState<LibraryBulkRegisterResult | null>(null);
  const [error, setError] = useState("");
  const { ref: formRef, attempted, check, reset: resetValidation } = useSubmitValidation();

  const classOptions = (classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  function reset() {
    setResult(null);
    setError("");
    setClassId("");
    memberType.reset();
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
      <DialogContent title={t("title")} description={t("description")} size="md">
        {result ? (
          <div className="flex flex-col gap-4">
            <Alert
              tone={result.failed.length > 0 ? "warning" : "success"}
              title={t("resultSummary", {
                registered: result.registered.length,
                failed: result.failed.length,
              })}
            >
              {result.failed.length > 0 && (
                <RejectedReasonList
                  className="flex max-h-48 flex-col gap-1 overflow-y-auto"
                  items={result.failed.map((f) => ({
                    key: f.user_id,
                    label: f.user_name,
                    code: f.code,
                    reason: f.reason,
                  }))}
                />
              )}
            </Alert>
            <DialogFooter>
              <Button
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                {t("close")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            ref={formRef}
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              if (!check(Boolean(memberTypeId))) return;
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
            <Field label={t("role")}>
              <Select
                options={MEMBER_ROLES.map((r) => ({ value: r, label: tRole(r) }))}
                value={role}
                onValueChange={(value) => {
                  setRole(value as MemberRole);
                  setClassId("");
                }}
              />
            </Field>
            {role === "student" && canViewClasses && (
              <Field label={t("class")} optional>
                <Select
                  options={classOptions}
                  value={classId}
                  onValueChange={setClassId}
                  placeholder={t("classAll")}
                />
              </Field>
            )}
            <Field
              label={t("memberType")}
              required
              error={attempted && !memberTypeId ? tValidation("required") : undefined}
            >
              <Select
                options={memberType.options}
                value={memberTypeId}
                onValueChange={memberType.onValueChange}
                placeholder={t("memberTypePlaceholder")}
                disabled={memberType.isLoading}
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
              <Button type="submit" loading={bulkRegister.isPending}>
                {t("submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

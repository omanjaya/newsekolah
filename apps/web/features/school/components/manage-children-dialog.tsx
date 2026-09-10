"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Input,
  Select,
  Skeleton,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useUsersQuery } from "../api";
import {
  type ParentRelation,
  useLinkChildMutation,
  useUnlinkChildMutation,
  useUserChildrenQuery,
} from "../guardians-api";

const RELATIONS: ParentRelation[] = ["father", "mother", "guardian"];

/**
 * Lets an administrator see and change which students a parent account is
 * linked to: unlink an existing child with confirmation, or link a new one
 * by searching the student directory and picking the relation.
 */
export function ManageChildrenDialog({
  open,
  onOpenChange,
  parentUserId,
  parentName,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentUserId: string;
  parentName: string;
  canEdit: boolean;
}): ReactElement {
  const t = useTranslations("app.family.guardianLinks.manageChildren");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const children = useUserChildrenQuery(parentUserId, open);
  const link = useLinkChildMutation(parentUserId);
  const unlink = useUnlinkChildMutation(parentUserId);

  const [search, setSearch] = useState("");
  const students = useUsersQuery({
    q: search || undefined,
    profile_kind: "student",
  });
  const [pickedStudentId, setPickedStudentId] = useState("");
  const [relation, setRelation] = useState<ParentRelation>("father");
  const [canApproveLeave, setCanApproveLeave] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<{ id: string; name: string } | null>(null);

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  const rows = children.data?.data ?? [];
  const linkedIds = new Set(rows.map((r) => r.student_user_id));
  const candidates = (students.data?.data ?? []).filter((s) => !linkedIds.has(s.id));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent title={t("title", { name: parentName })} className="max-w-lg">
          <div className="flex flex-col gap-4">
            {children.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : rows.length === 0 ? (
              <p className="text-[13px] text-fg-muted">{t("empty")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {rows.map((child) => (
                  <li
                    key={child.student_user_id}
                    className="flex items-center justify-between gap-2 rounded-xs border border-border px-3 py-2 text-[13px]"
                  >
                    <span className="flex flex-col">
                      <span className="text-fg">{child.student_name}</span>
                      <span className="text-[12px] text-fg-muted">
                        {t(`relation.${child.relation}`)}
                        {child.class_name ? ` · ${child.class_name}` : ""}
                      </span>
                    </span>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setUnlinkTarget({ id: child.student_user_id, name: child.student_name });
                        }}
                      >
                        {t("unlink")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canEdit && (
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <span className="text-[13px] font-medium text-fg">{t("linkNew")}</span>
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPickedStudentId("");
                  }}
                  placeholder={t("searchStudent")}
                />
                {search.trim() !== "" && (
                  <div className="max-h-40 overflow-y-auto rounded-xs border border-border">
                    {candidates.length === 0 ? (
                      <p className="p-3 text-[13px] text-fg-muted">{t("noMatch")}</p>
                    ) : (
                      candidates.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setPickedStudentId(s.id);
                          }}
                          className={`flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-[13px] last:border-b-0 hover:bg-bg ${
                            pickedStudentId === s.id ? "bg-bg" : ""
                          }`}
                        >
                          <span className="text-fg">{s.name}</span>
                          <span className="text-[12px] text-fg-muted">{s.username}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {pickedStudentId && (
                  <div className="flex flex-col gap-3 rounded-xs border border-border p-3">
                    <label className="flex flex-col gap-1 text-[13px]">
                      <span className="font-medium">{t("relationLabel")}</span>
                      <Select
                        options={RELATIONS.map((r) => ({ value: r, label: t(`relation.${r}`) }))}
                        value={relation}
                        onValueChange={(v) => {
                          setRelation(v as ParentRelation);
                        }}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[13px]">
                      <Checkbox
                        checked={canApproveLeave}
                        onCheckedChange={() => {
                          setCanApproveLeave((v) => !v);
                        }}
                      />
                      {t("canApproveLeave")}
                    </label>
                    <Button
                      size="sm"
                      loading={link.isPending}
                      onClick={() => {
                        link.mutate(
                          {
                            student_user_id: pickedStudentId,
                            relation,
                            can_approve_leave: canApproveLeave,
                          },
                          {
                            onSuccess: () => {
                              toast.success(t("linked"));
                              setSearch("");
                              setPickedStudentId("");
                              setCanApproveLeave(false);
                            },
                            onError: fail,
                          },
                        );
                      }}
                    >
                      {t("link")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={unlinkTarget !== null}
        onOpenChange={(o) => {
          if (!o) setUnlinkTarget(null);
        }}
        title={t("unlinkConfirmTitle")}
        description={
          unlinkTarget
            ? t("unlinkConfirmBody", { student: unlinkTarget.name, parent: parentName })
            : undefined
        }
        confirmLabel={t("unlink")}
        destructive
        confirming={unlink.isPending}
        onConfirm={async () => {
          if (!unlinkTarget) return;
          try {
            await unlink.mutateAsync(unlinkTarget.id);
            toast.success(t("unlinked"));
            setUnlinkTarget(null);
          } catch (err) {
            fail(err);
          }
        }}
      />
    </>
  );
}

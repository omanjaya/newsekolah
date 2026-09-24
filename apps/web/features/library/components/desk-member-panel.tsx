"use client";

import { Avatar, Badge, Button } from "@newsekolah/ui";
import { UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { LibraryMemberStatus } from "../members-api";

import { LibraryLookupField } from "./library-lookup-field";

export interface DeskSelectedMember {
  userId: string;
  name: string;
  memberNo?: string;
  nis?: string;
  username?: string;
}

/**
 * The desk session's first step: pick a borrower by scanning their member
 * card (the same continuous scan input handles this -- see loan-desk-view's
 * `handleScan`) or by typing their name, then keep them visible and easy
 * to swap or clear while books get scanned in whatever mode is active.
 */
export function DeskMemberPanel({
  member,
  memberStatus,
  onSelectMember,
  onClear,
}: {
  member: DeskSelectedMember | null;
  memberStatus: LibraryMemberStatus | null;
  onSelectMember: (member: DeskSelectedMember) => void;
  onClear: () => void;
}): ReactElement {
  const t = useTranslations("app.library.desk.member");
  const tStatus = useTranslations("app.library.members.status");

  if (!member) {
    return (
      <div className="flex flex-col gap-2">
        <LibraryLookupField
          onSelectMember={(selected) => {
            onSelectMember({
              userId: selected.user_id,
              name: selected.user_name,
              memberNo: selected.member_no,
              nis: selected.nis,
              username: selected.username,
            });
          }}
          placeholder={t("searchPlaceholder")}
        />
        <p className="text-[12px] text-fg-muted">{t("scanHint")}</p>
      </div>
    );
  }

  const attentionStatus: LibraryMemberStatus[] = ["suspended", "inactive", "pending", "cleared"];
  const needsAttention = memberStatus !== null && attentionStatus.includes(memberStatus);

  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={member.name} size="sm" />
        <div className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-fg">
            <span className="truncate">{member.name}</span>
            {memberStatus && (
              <Badge variant={needsAttention ? "neutral" : "accent"}>
                {needsAttention && <UserX className="size-3" aria-hidden="true" />}
                {tStatus(memberStatus)}
              </Badge>
            )}
          </span>
          <span className="truncate text-[12px] text-fg-muted">
            {[member.memberNo, member.nis, member.username].filter(Boolean).join(" - ")}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="secondary" size="sm" onClick={onClear}>
          {t("endSession")}
        </Button>
      </div>
    </div>
  );
}

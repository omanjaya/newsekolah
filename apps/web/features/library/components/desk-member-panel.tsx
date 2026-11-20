"use client";

import { Avatar, Badge, Button, TextLink } from "@newsekolah/ui";
import { CircleAlert, ReceiptText, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { StudentLink } from "../../students/components/student-link";
import type { LibraryMemberBorrowingStatus, LibraryMemberStatus } from "../members-api";

export interface DeskSelectedMember {
  userId: string;
  name: string;
  memberNo?: string;
  nis?: string;
  username?: string;
}

/** Statuses that should stop the librarian before lending. */
const ATTENTION_STATUSES: readonly LibraryMemberStatus[] = [
  "suspended",
  "inactive",
  "pending",
  "cleared",
];

export function memberNeedsAttention(status: LibraryMemberStatus | null): boolean {
  return status !== null && ATTENTION_STATUSES.includes(status);
}

/**
 * Who the desk is serving: avatar, name (to their profile), codes,
 * membership status, an unpaid fine and the loan quota in use (from the
 * server's own borrowing rules, so the librarian knows before Confirm why a
 * loan would be refused), with the session's own actions beside them: their
 * fines in a new tab, the running receipt, and ending the session.
 */
export function DeskMemberPanel({
  member,
  memberStatus,
  borrowing,
  onOpenReceipt,
  onClear,
}: {
  member: DeskSelectedMember;
  memberStatus: LibraryMemberStatus | null;
  borrowing: LibraryMemberBorrowingStatus | null;
  onOpenReceipt: () => void;
  onClear: () => void;
}): ReactElement {
  const t = useTranslations("app.library.desk");
  const tStatus = useTranslations("app.library.members.status");
  const attention = memberNeedsAttention(memberStatus);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={member.name} size={48} decorative />
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-heading text-fg">
              <StudentLink studentId={member.userId} tab="library" isStudent={Boolean(member.nis)}>
                {member.name}
              </StudentLink>
            </span>
            {memberStatus && (
              <Badge tone={attention ? "warning" : "success"} size="sm">
                {attention && <UserX aria-hidden="true" />}
                {tStatus(memberStatus)}
              </Badge>
            )}
            {borrowing?.has_unpaid_fine && (
              <Badge tone={borrowing.unpaid_fine_blocks_loans ? "danger" : "warning"} size="sm">
                <CircleAlert aria-hidden="true" />
                {t(
                  borrowing.unpaid_fine_blocks_loans
                    ? "member.unpaidFineBlocks"
                    : "member.unpaidFine",
                )}
              </Badge>
            )}
          </div>
          <span className="truncate text-body-sm text-fg-muted">
            {[member.memberNo, member.nis, member.username].filter(Boolean).join(" · ")}
          </span>
          {borrowing && (
            <span className="text-body-sm text-fg-muted">
              {t("member.quota", {
                count: borrowing.active_loan_count,
                max: borrowing.max_loan_items,
              })}
            </span>
          )}
          <TextLink
            href={`/library/violations?member=${encodeURIComponent(member.userId)}`}
            external
            className="w-fit text-body-sm"
          >
            {t("member.sanctions")}
          </TextLink>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" icon={<ReceiptText />} onClick={onOpenReceipt}>
          {t("receipt.open")}
        </Button>
        <Button variant="secondary" onClick={onClear}>
          {t("member.endSession")}
        </Button>
      </div>
    </div>
  );
}

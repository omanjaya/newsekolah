"use client";

import type { Locale } from "@newsekolah/i18n";
import { Avatar, Badge, Button, TextLink } from "@newsekolah/ui";
import { CircleAlert, ReceiptText, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { StudentLink } from "../../students/components/student-link";
import type { MemberBorrowBlock } from "../lib/member-borrowing";
import { formatShortDay } from "../lib/short-date";
import type { LibraryMemberBorrowingStatus, LibraryMemberStatus } from "../members-api";

export interface DeskSelectedMember {
  userId: string;
  name: string;
  memberNo?: string;
  nis?: string;
  username?: string;
}

/** The served member's membership as the desk reads it today. */
export interface DeskMembership {
  /** The status to show (shownMemberStatus: a finished suspension reads active). */
  status: LibraryMemberStatus;
  /**
   * Why the membership itself would be refused a loan today
   * (memberBorrowBlock, the server's EligibleToBorrow), or null when it
   * would lend. A block is what stops the librarian.
   */
  block: MemberBorrowBlock | null;
}

/**
 * The desk's words for a membership: the badge beside the member's name
 * and the scan result's line when a loan would be refused. A running
 * suspension names its last day and an ended membership its end date, so
 * the librarian knows until when, not only that something is wrong.
 */
export function useDeskMembershipText(today: string): {
  badge: (membership: DeskMembership) => string;
  attention: (membership: DeskMembership) => string;
} {
  const t = useTranslations("app.library.desk");
  const tStatus = useTranslations("app.library.members.status");
  const locale = useLocale() as Locale;
  const day = (date: string) => formatShortDay(date, locale, { today });
  return {
    badge: ({ status, block }) => {
      if (block?.kind === "suspended" && block.until) {
        return t("member.suspendedUntil", { date: day(block.until) });
      }
      if (block?.kind === "expired") return t("member.expiredOn", { date: day(block.until) });
      return tStatus(status);
    },
    attention: ({ status, block }) => {
      if (block?.kind === "suspended" && block.until) {
        return t("result.memberSuspendedUntil", { date: day(block.until) });
      }
      if (block?.kind === "expired") return t("result.memberExpired", { date: day(block.until) });
      return t("result.memberAttention", { status: tStatus(status) });
    },
  };
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
  membership,
  today,
  borrowing,
  onOpenReceipt,
  onClear,
}: {
  member: DeskSelectedMember;
  /** Null until the member's record loads. */
  membership: DeskMembership | null;
  /** The school's calendar day, "YYYY-MM-DD". */
  today: string;
  borrowing: LibraryMemberBorrowingStatus | null;
  onOpenReceipt: () => void;
  onClear: () => void;
}): ReactElement {
  const t = useTranslations("app.library.desk");
  const membershipText = useDeskMembershipText(today);
  const attention = Boolean(membership?.block);

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
            {membership && (
              <Badge tone={attention ? "warning" : "success"} size="sm">
                {attention && <UserX aria-hidden="true" />}
                {membershipText.badge(membership)}
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

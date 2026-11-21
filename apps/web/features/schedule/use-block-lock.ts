"use client";

import { useFormatter, useTranslations } from "next-intl";

import { formatCalendarDate } from "../../lib/format-calendar-date";

import type { ScheduleBlock } from "./api";
import { blockLockedReasonKey, lockingHold } from "./block-policy";
import { type HoldPage, holdKey, holdLink } from "./schedule-hold";
import { CAPTION_DATE } from "./use-effective-caption";

/** Why a lesson's edit and delete are unavailable, and where to look. */
export interface BlockLock {
  /**
   * The whole reason, naming the record that holds the lesson when one
   * does ("semua pertemuan tersisa sudah punya riwayat, ditahan oleh
   * permintaan guru pengganti untuk Kam, 26 Nov ..."): the tooltip of the
   * grid's disabled actions.
   */
  reason: string;
  /** The reason without the record, short enough for a menu item's label. */
  shortReason: string;
  /**
   * The record's own page, named with its date: a request on the
   * school-wide list (where a schedule manager cancels it) or that day's
   * attendance. The same place the "Berlaku mulai" hint links to.
   */
  link?: { href: string; label: string; page: HoldPage };
}

/**
 * The lock on a lesson the editor cannot change (see
 * `blockLockedReasonKey`), said where its disabled actions are. When every
 * remaining lesson has history and one record holds the lesson there, the
 * reason names it with its date and a link goes to it, so a lesson held by
 * a pending or accepted request says so and can be released from the
 * substitutions list. A locked lesson opens no dialog, so the "Berlaku
 * mulai" hint that names the record elsewhere never shows for it.
 */
export function useBlockLock(): (block: ScheduleBlock) => BlockLock | undefined {
  const t = useTranslations("app.schedule");
  const format = useFormatter();
  return (block) => {
    const key = blockLockedReasonKey(block);
    if (!key) return undefined;
    const shortReason = t(key);
    const hold = lockingHold(block);
    if (!hold) return { reason: shortReason, shortReason };
    const date = formatCalendarDate(format, hold.date, CAPTION_DATE);
    const link = holdLink(hold);
    return {
      reason: t(`blockHeldBy.${holdKey(hold)}`, { date }),
      shortReason,
      link: link && {
        href: link.href,
        label: t(`blockHeldBy.${link.key}`, { date }),
        page: link.page,
      },
    };
  };
}

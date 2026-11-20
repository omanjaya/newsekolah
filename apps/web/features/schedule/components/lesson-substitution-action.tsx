"use client";

import { Button, Dialog, DialogContent, IconButton } from "@newsekolah/ui";
import { Repeat } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";

import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { RequestForm } from "../../substitutions/components/request-form";
import type { ScheduleBlock } from "../api";
import { nextLessonDate } from "../next-lesson-date";

/**
 * The same request form as the inbox, prefilled from the teacher's lesson
 * and its next date. The timetable is effective-dated: a lesson that starts
 * later is prefilled with its first date, and one with no date left (it
 * ends before its next weekday) offers nothing.
 */
export function LessonSubstitutionAction({
  block,
  compact = false,
}: {
  block: ScheduleBlock;
  compact?: boolean;
}): ReactElement | null {
  const t = useTranslations("app.academic.workspace");
  const { me } = useSession();
  const canRequest = useCan("manage_attendance");
  const [open, setOpen] = useState(false);
  if (!canRequest || me?.id !== block.teacher_user_id || !block.schedule_ids[0]) return null;
  let initialDate = nextLessonDate(todayInZone(me.tenant.timezone), block.day_of_week);
  if (initialDate < block.effective_from) initialDate = block.effective_from;
  if (block.effective_until !== undefined && initialDate > block.effective_until) return null;
  return (
    <>
      {compact ? (
        <IconButton
          aria-label={t("requestSubstitute")}
          className="size-11 md:size-8"
          icon={<Repeat />}
          variant="ghost"
          onClick={() => {
            setOpen(true);
          }}
        />
      ) : (
        <Button
          size="sm"
          variant="ghost"
          icon={<Repeat />}
          onClick={() => {
            setOpen(true);
          }}
        >
          {t("requestSubstitute")}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("requestSubstitute")}>
          {open && (
            <RequestForm
              initialScheduleId={block.schedule_ids[0]}
              initialDate={initialDate}
              onDone={() => {
                setOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

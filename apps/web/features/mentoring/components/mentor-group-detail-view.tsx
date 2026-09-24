"use client";

import { PageHeader, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useLookup, useTeachersQuery } from "../../reference/api";
import { useMentorGroupMembersQuery, useMentorGroupQuery } from "../api";

import { MentorGroupMembersPanel } from "./mentor-group-members-panel";
import { MentorMeetingNotesPanel } from "./mentor-meeting-notes-panel";

export function MentorGroupDetailView({ groupId }: { groupId: string }): ReactElement {
  const t = useTranslations("app.mentoring.groupDetail");
  const canSeeNotes = useCan("manage_mentoring");
  const [tab, setTab] = useUrlState<string>(
    "tab",
    ["members", ...(canSeeNotes ? ["notes"] : [])],
    "members",
  );

  const group = useMentorGroupQuery(groupId);
  const members = useMentorGroupMembersQuery(groupId);
  const teachers = useTeachersQuery();
  const teacherMap = useLookup(teachers.data?.data);

  if (group.isError && !group.data)
    return <QueryError retry={() => group.refetch()} className="m-4" />;

  if (group.isLoading || !group.data) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const rawMentorName = teacherMap.get(group.data.mentor_user_id)?.name;
  const mentorName = rawMentorName ? formatDisplayName(rawMentorName) : t("unknownMentor");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <PageHeader eyebrow={t("eyebrow")} title={group.data.name} className="border-b-0 pb-0" />
        <p className="text-[13px] text-fg-muted">{t("mentorLabel", { name: mentorName })}</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="members">{t("tabs.members")}</TabsTrigger>
          {canSeeNotes && <TabsTrigger value="notes">{t("tabs.notes")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="members" className="pt-4">
          <MentorGroupMembersPanel groupId={groupId} />
        </TabsContent>
        {canSeeNotes && (
          <TabsContent value="notes" className="pt-4">
            <MentorMeetingNotesPanel groupId={groupId} members={members.data?.data ?? []} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

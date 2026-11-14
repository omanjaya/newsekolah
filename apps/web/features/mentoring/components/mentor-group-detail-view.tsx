"use client";

import { SkeletonDetail, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useDirectoryNames } from "../../reference/directory-names";
import { useMentorGroupMembersQuery, useMentorGroupQuery } from "../api";

import { MentorGroupMembersPanel } from "./mentor-group-members-panel";
import { MentorMeetingNotesPanel } from "./mentor-meeting-notes-panel";

/** One mentoring group: its members, and the meeting notes for whoever keeps them. */
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
  const teacherMap = useDirectoryNames([group.data?.mentor_user_id]);

  if (group.isError && !group.data) {
    return (
      <AppPage>
        <QueryError retry={() => group.refetch()} error={group.error} />
      </AppPage>
    );
  }

  if (group.isLoading || !group.data) {
    return (
      <AppPage>
        <SkeletonDetail rows={5} />
      </AppPage>
    );
  }

  const rawMentorName = teacherMap.get(group.data.mentor_user_id)?.name;
  const mentorName = rawMentorName ? formatDisplayName(rawMentorName) : t("unknownMentor");

  return (
    <AppPage title={group.data.name} description={t("mentorLabel", { name: mentorName })}>
      <Tabs value={tab} onValueChange={setTab}>
        {canSeeNotes && (
          <TabsList>
            <TabsTrigger value="members">{t("tabs.members")}</TabsTrigger>
            <TabsTrigger value="notes">{t("tabs.notes")}</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="members" className={canSeeNotes ? "pt-4" : undefined}>
          <MentorGroupMembersPanel groupId={groupId} />
        </TabsContent>
        {canSeeNotes && (
          <TabsContent value="notes" className="pt-4">
            <MentorMeetingNotesPanel groupId={groupId} members={members.data?.data ?? []} />
          </TabsContent>
        )}
      </Tabs>
    </AppPage>
  );
}

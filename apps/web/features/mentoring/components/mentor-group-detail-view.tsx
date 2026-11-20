"use client";

import { SkeletonDetail, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { RecordForbiddenPage, RecordNotFoundPage } from "../../../components/record-not-found";
import { isForbiddenError, isNotFoundError } from "../../../lib/api/not-found";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useDirectoryNames } from "../../reference/directory-names";
import { useGroupSizeLimitQuery, useMentorGroupMembersQuery, useMentorGroupQuery } from "../api";
import { useMentorGroupsCrumb } from "../permissions";

import { MentorGroupMembersPanel } from "./mentor-group-members-panel";
import { MentorMeetingNotesPanel } from "./mentor-meeting-notes-panel";

/**
 * One mentoring group: its mentor and size against the school's limit in
 * the header, its members, and the meeting notes for whoever keeps them.
 */
export function MentorGroupDetailView({ groupId }: { groupId: string }): ReactElement {
  const t = useTranslations("app.mentoring.groupDetail");
  const tMembers = useTranslations("app.mentoring.members");
  const canSeeNotes = useCan("manage_mentoring");
  const limit = useGroupSizeLimitQuery();
  const [tab, setTab] = useUrlState<string>(
    "tab",
    ["members", ...(canSeeNotes ? ["notes"] : [])],
    "members",
  );

  const group = useMentorGroupQuery(groupId);
  // The trail leads where the back buttons do: a guru wali without
  // view_mentoring cannot open the full list the path would point at.
  const groupsCrumb = useMentorGroupsCrumb();
  const members = useMentorGroupMembersQuery(groupId);
  const teacherMap = useDirectoryNames([group.data?.mentor_user_id]);

  // An unknown or malformed id is a missing group, not a failure to retry.
  if (group.isError && !group.data && isNotFoundError(group.error)) {
    return (
      <RecordNotFoundPage
        title={t("notFoundTitle")}
        backHref={groupsCrumb.href}
        backLabel={t("backToGroups")}
        trailParent={groupsCrumb}
      />
    );
  }

  // A group another guru wali mentors: the no-access page, not a retry
  // that the API can only refuse again.
  if (group.isError && !group.data && isForbiddenError(group.error)) {
    return (
      <RecordForbiddenPage
        error={group.error}
        backHref={groupsCrumb.href}
        backLabel={t("backToGroups")}
        trailParent={groupsCrumb}
      />
    );
  }

  // Until the group loads, the heading names the reader's own group list,
  // as the trail does: the path-derived label is the school-wide list,
  // which a guru wali without view_mentoring cannot open.
  if (group.isError && !group.data) {
    return (
      <AppPage title={groupsCrumb.label} breadcrumb={[groupsCrumb]}>
        <QueryError retry={() => group.refetch()} error={group.error} />
      </AppPage>
    );
  }

  if (group.isLoading || !group.data) {
    return (
      <AppPage title={groupsCrumb.label} breadcrumb={[groupsCrumb]}>
        <SkeletonDetail rows={5} />
      </AppPage>
    );
  }

  const rawMentorName = teacherMap.get(group.data.mentor_user_id)?.name;
  const mentorName = rawMentorName ? formatDisplayName(rawMentorName) : t("unknownMentor");
  const size =
    members.data && limit.data
      ? tMembers("countOfLimit", { count: members.data.data.length, limit: limit.data.limit })
      : undefined;

  return (
    <AppPage
      title={group.data.name}
      breadcrumb={[groupsCrumb, { label: group.data.name }]}
      description={[t("mentorLabel", { name: mentorName }), size].filter(Boolean).join(" · ")}
    >
      <Tabs value={tab} onValueChange={setTab}>
        {canSeeNotes && (
          <TabsList variant="underline" aria-label={t("tabsLabel")}>
            <TabsTrigger value="members">{t("tabs.members")}</TabsTrigger>
            <TabsTrigger value="notes">{t("tabs.notes")}</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="members" className={canSeeNotes ? "pt-4" : undefined}>
          <MentorGroupMembersPanel groupId={groupId} />
        </TabsContent>
        {canSeeNotes && (
          <TabsContent value="notes" className="pt-4">
            <MentorMeetingNotesPanel
              groupId={groupId}
              mentorUserId={group.data.mentor_user_id}
              members={members.data?.data ?? []}
            />
          </TabsContent>
        )}
      </Tabs>
    </AppPage>
  );
}

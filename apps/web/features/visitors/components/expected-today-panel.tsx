"use client";

import {
  Avatar,
  Button,
  Card,
  Dialog,
  DialogContent,
  EmptyState,
  List,
  ListRow,
  SectionHeader,
  SkeletonList,
} from "@newsekolah/ui";
import { CalendarClock, LogIn } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useId, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { useDirectoryNames } from "../../reference/directory-names";
import { type ExpectedGuest, useExpectedGuestsQuery } from "../api";
import { matchesSearch } from "../lib/board";

import { CheckInForm } from "./check-in-form";

/**
 * Today's scheduled visitors beside the on-site list, so the guard finds a
 * name instead of typing it: checking one in opens the sign-in form with
 * their details already filled. Readers without the right only see the list.
 */
export function ExpectedTodayPanel({ search }: { search: string }): ReactElement {
  const t = useTranslations("app.visitors.expected");
  const canManage = useCan("manage_visitors");
  const { me } = useSession();
  const guests = useExpectedGuestsQuery(todayInZone(me?.tenant.timezone));
  const [selected, setSelected] = useState<ExpectedGuest | null>(null);
  const titleId = useId();
  const all = guests.data?.data ?? [];
  const items = all.filter((guest) => matchesSearch(search, guest.full_name, guest.organization));
  const hosts = useDirectoryNames(items.map((guest) => guest.host_user_id));

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <SectionHeader
        titleId={titleId}
        title={t("todayTitle")}
        count={guests.isLoading ? undefined : all.length}
      />
      {guests.isLoading ? (
        <SkeletonList rows={2} />
      ) : guests.isError ? (
        <QueryError retry={() => guests.refetch()} error={guests.error} />
      ) : items.length === 0 ? (
        <Card padding="sm">
          <EmptyState
            variant="compact"
            icon={<CalendarClock />}
            title={all.length === 0 ? t("todayEmptyTitle") : t("todaySearchEmpty")}
            description={all.length === 0 ? t("todayEmptyBody") : undefined}
            action={
              canManage && all.length === 0 ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href="/visitors/expected">{t("scheduleGuest")}</Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <List framed aria-label={t("todayTitle")}>
          {items.map((guest) => {
            const host = hosts.get(guest.host_user_id)?.name;
            const about = [guest.organization, guest.purpose].filter(Boolean).join(" · ");
            return (
              <ListRow
                key={guest.id}
                leading={<Avatar name={guest.full_name} size={40} decorative />}
                title={guest.full_name}
                meta={
                  <>
                    {about && <span className="block truncate">{about}</span>}
                    {host && (
                      <span className="block truncate">{t("hostLine", { name: host })}</span>
                    )}
                  </>
                }
                action={
                  canManage ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<LogIn />}
                      aria-label={t("checkInFor", { name: guest.full_name })}
                      onClick={() => {
                        setSelected(guest);
                      }}
                    >
                      {t("checkInShort")}
                    </Button>
                  ) : undefined
                }
              />
            );
          })}
        </List>
      )}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent title={t("checkIn")}>
          {selected && (
            <CheckInForm
              expectedGuestId={selected.id}
              defaultFullName={selected.full_name}
              defaultOrganization={selected.organization}
              defaultHostUserId={selected.host_user_id}
              defaultPurpose={selected.purpose}
              onDone={() => {
                setSelected(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

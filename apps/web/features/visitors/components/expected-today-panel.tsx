"use client";

import { Button, Dialog, DialogContent, Skeleton } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { type ExpectedGuest, useExpectedGuestsQuery } from "../api";

import { CheckInForm } from "./check-in-form";

/** Scheduled visitors can be checked in directly from today's shared visitor desk. */
export function ExpectedTodayPanel({ search }: { search: string }): ReactElement {
  const t = useTranslations("app.visitors.expected");
  const workspace = useTranslations("app.serviceWorkspace");
  const canManage = useCan("manage_visitors");
  const { me } = useSession();
  const guests = useExpectedGuestsQuery(todayInZone(me?.tenant.timezone));
  const [selected, setSelected] = useState<ExpectedGuest | null>(null);
  const query = search.trim().toLocaleLowerCase();
  const items = (guests.data?.data ?? []).filter((guest) =>
    `${guest.full_name} ${guest.organization}`.toLocaleLowerCase().includes(query),
  );
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{workspace("expectedToday")}</h2>
      {guests.isLoading ? (
        <Skeleton className="h-24 w-full" aria-busy="true" />
      ) : guests.isError ? (
        <QueryError retry={() => guests.refetch()} />
      ) : items.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("emptyBody")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((guest) => (
            <li
              key={guest.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-bg-raised p-4"
            >
              <div>
                <p className="font-semibold">{guest.full_name}</p>
                <p className="text-sm text-fg-muted">{guest.organization}</p>
              </div>
              <p className="text-sm">{guest.purpose}</p>
              {canManage && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelected(guest);
                  }}
                >
                  {t("checkIn")}
                </Button>
              )}
            </li>
          ))}
        </ul>
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

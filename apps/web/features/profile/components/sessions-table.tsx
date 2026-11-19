"use client";

import type { components } from "@newsekolah/api-client";
import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatRelative } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  IconCircle,
  List,
  ListRow,
  SkeletonList,
  useToast,
} from "@newsekolah/ui";
import { Monitor, Smartphone, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { describeUserAgent } from "../../../lib/user-agent";
import { useRevokeSessionMutation, useSessionsQuery } from "../api";

type Session = components["schemas"]["Session"];

const CLIENT_ICON = { web: Monitor, ios: Smartphone, android: Smartphone } as const;

/**
 * What a session's row is called: the name the app sent at sign-in, else
 * the browser and system its user agent names ("Chrome di Windows"), else
 * the kind of client in words. Never the raw client enum ("web"), which
 * read as a machine word and named every web session alike.
 */
function useSessionTitle(): (session: Session) => string {
  const t = useTranslations("app.profile");
  return (session) => {
    if (session.device_name) return session.device_name;
    const { browser, os } = describeUserAgent(session.user_agent);
    if (browser && os) return t("sessionDevice", { browser, os });
    return browser ?? os ?? t(`sessionClient.${session.client}`);
  };
}

/**
 * The reader's signed-in devices as a short list (one to a few rows): the
 * device, when it was last active, "this device" on the current one, and
 * a sign-out on every other, confirmed first. Meant to sit straight in a
 * Card, under its header.
 */
export function SessionsTable(): ReactElement {
  const t = useTranslations("app.profile");
  const tAuth = useTranslations("auth.sessions");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const { data, isLoading, isError, error, refetch } = useSessionsQuery();
  const revokeMutation = useRevokeSessionMutation();
  const apiErrorMessage = useApiErrorMessage();
  const toast = useToast();
  const sessionTitle = useSessionTitle();
  const [pendingRevoke, setPendingRevoke] = useState<Session | null>(null);

  const sessions = [...(data?.data ?? [])].sort(
    (a, b) => Number(b.is_current) - Number(a.is_current),
  );

  async function confirmRevoke() {
    if (!pendingRevoke) return;
    try {
      await revokeMutation.mutateAsync(pendingRevoke.id);
      toast.success(t("revokeSuccess"));
    } catch (err) {
      toast.error(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    } finally {
      setPendingRevoke(null);
    }
  }

  if (isLoading) {
    return (
      <div className="px-5 pb-5">
        <SkeletonList rows={2} framed={false} />
      </div>
    );
  }
  if (isError && !data) {
    return (
      <div className="px-5 pb-5">
        <QueryError retry={() => refetch()} error={error} />
      </div>
    );
  }
  if (sessions.length === 0) {
    return (
      <div className="px-5 pb-5">
        <EmptyState
          icon={<Users aria-hidden="true" />}
          title={t("sessionsEmptyTitle")}
          description={t("sessionsEmptyBody")}
        />
      </div>
    );
  }

  return (
    <>
      <List>
        {sessions.map((session) => {
          const Icon = CLIENT_ICON[session.client];
          return (
            <ListRow
              key={session.id}
              leading={
                <IconCircle tone={session.is_current ? "green" : "neutral"} size="sm">
                  <Icon />
                </IconCircle>
              }
              title={sessionTitle(session)}
              meta={t("sessionLastSeen", {
                time: formatRelative(session.last_seen_at, {
                  locale,
                  timeZone: me?.tenant.timezone,
                }),
              })}
              trailing={
                session.is_current ? (
                  <Badge tone="accent" size="sm">
                    {tAuth("currentDevice")}
                  </Badge>
                ) : undefined
              }
              action={
                session.is_current ? undefined : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPendingRevoke(session);
                    }}
                  >
                    {tAuth("revoke")}
                  </Button>
                )
              }
            />
          );
        })}
      </List>
      <ConfirmDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null);
        }}
        title={tAuth("revokeConfirmTitle")}
        description={tAuth("revokeConfirmBody")}
        confirmLabel={tAuth("revoke")}
        tone="danger"
        confirming={revokeMutation.isPending}
        onConfirm={confirmRevoke}
      />
    </>
  );
}

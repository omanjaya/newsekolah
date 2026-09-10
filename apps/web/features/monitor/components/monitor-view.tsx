"use client";

import { Alert, Button, EmptyState, Input, PageHeader, Skeleton } from "@newsekolah/ui";
import { MonitorSmartphone, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useCan } from "../../../lib/session/session-provider";
import {
  useMonitorPresenceQuery,
  useMonitorSnapshotQuery,
  useMonitorSocket,
  type MonitorSessionCard,
} from "../api";

const TOKEN_STORAGE_KEY = "newsekolah.monitor.display-token";

/** Per-viewer convenience only: which display token this browser last used. Never the source of truth. */
function readStoredToken(): string {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Private browsing or blocked storage: the field just asks again next time.
  }
}

const STATUS_ORDER: MonitorSessionCard["status"][] = ["in_progress", "not_started", "submitted"];

/**
 * The wall display: a school opens this page once on a mounted screen and
 * leaves it running (DESIGN.md: "read at a distance... no interaction
 * required"). Type stays inside the project's normal scale (up to 32px);
 * legibility at a distance comes from the grid and contrast, not from a
 * one-off oversized font that would break the shared type system.
 */
export function MonitorView(): ReactElement {
  const t = useTranslations("app.monitor");
  const [token, setToken] = useState(() => readStoredToken());
  const [tokenInput, setTokenInput] = useState("");

  if (token === "") {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
        <form
          className="flex max-w-sm flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            storeToken(tokenInput.trim());
            setToken(tokenInput.trim());
          }}
        >
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("tokenLabel")}</span>
            <Input
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value);
              }}
              placeholder={t("tokenPlaceholder")}
              aria-label={t("tokenLabel")}
            />
          </label>
          <p className="text-[13px] text-fg-muted">{t("tokenHint")}</p>
          <Button type="submit" disabled={tokenInput.trim() === ""}>
            {t("tokenSubmit")}
          </Button>
        </form>
      </div>
    );
  }

  function forgetToken(): void {
    storeToken("");
    setToken("");
  }

  return <MonitorDisplay token={token} onForget={forgetToken} />;
}

function MonitorDisplay({
  token,
  onForget,
}: {
  token: string;
  onForget: () => void;
}): ReactElement {
  const t = useTranslations("app.monitor");
  const canSeePresence = useCan("view_monitor_presence");

  const mode = useMonitorSocket(token);
  const snapshot = useMonitorSnapshotQuery(token, {
    refetchInterval: mode === "polling" ? 15_000 : undefined,
  });
  const presence = useMonitorPresenceQuery(canSeePresence);

  if (snapshot.isError) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Alert variant="warning" title={t("tokenInvalidTitle")}>
          {t("tokenInvalidBody")}
        </Alert>
        <Button variant="secondary" onClick={onForget} className="w-fit">
          {t("tokenForget")}
        </Button>
      </div>
    );
  }

  const sessions = [...(snapshot.data?.sessions ?? [])].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );

  return (
    <div className="flex flex-col gap-6 bg-bg p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <MonitorSmartphone className="size-6 text-fg-muted" aria-hidden="true" />
          <h1 className="text-[32px] font-medium text-fg">{t("title")}</h1>
        </div>
        <div className="flex items-center gap-4 text-[14px] text-fg-muted">
          {canSeePresence && presence.data && (
            <span className="flex items-center gap-1.5">
              <Users className="size-4" aria-hidden="true" />
              {t("presenceCount", { count: presence.data.count })}
            </span>
          )}
          <ConnectionIndicator mode={mode} />
        </div>
      </div>

      {mode === "polling" && (
        <Alert variant="warning" title={t("pollingTitle")}>
          {t("pollingBody")}
        </Alert>
      )}

      {snapshot.isLoading ? (
        <Skeleton className="h-64 w-full" aria-busy="true" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            {Object.entries(snapshot.data?.status_counts ?? {}).map(([code, count]) => (
              <div
                key={code}
                className="flex flex-col items-center gap-1 rounded-sm border border-border bg-surface p-4"
              >
                <dd className="text-[32px] font-medium tabular-nums text-fg">{count}</dd>
                <dt className="text-[13px] text-fg-muted">{t(`codes.${code}`)}</dt>
              </div>
            ))}
          </dl>

          {sessions.length === 0 ? (
            <EmptyState
              icon={<MonitorSmartphone aria-hidden="true" />}
              title={t("noSessionsTitle")}
              description={t("noSessionsBody")}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sessions.map((session, index) => (
                <SessionCard
                  key={`${session.class_name}-${session.subject_name}-${index}`}
                  session={session}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function ConnectionIndicator({ mode }: { mode: "connecting" | "live" | "polling" }): ReactElement {
  const t = useTranslations("app.monitor");
  const label =
    mode === "live"
      ? t("connectionLive")
      : mode === "polling"
        ? t("connectionPolling")
        : t("connectionConnecting");
  const dotClass =
    mode === "live" ? "bg-status-present" : mode === "polling" ? "bg-status-late" : "bg-fg-muted";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-xs ${dotClass}`} aria-hidden="true" />
      {label}
    </span>
  );
}

const CARD_STATUS_CLASS: Record<MonitorSessionCard["status"], string> = {
  not_started: "border-border",
  in_progress: "border-accent",
  submitted: "border-status-present",
};

function SessionCard({ session }: { session: MonitorSessionCard }): ReactElement {
  const t = useTranslations("app.monitor");
  return (
    <li
      className={`flex flex-col gap-1 rounded-sm border-2 bg-surface p-4 ${CARD_STATUS_CLASS[session.status]}`}
    >
      <span className="text-[20px] font-medium text-fg">{session.class_name}</span>
      <span className="text-[14px] text-fg-muted">
        {session.subject_name} - {session.teacher_name}
      </span>
      <span className="text-[13px] font-medium text-fg">
        {t(`sessionStatus.${session.status}`)}
      </span>
    </li>
  );
}

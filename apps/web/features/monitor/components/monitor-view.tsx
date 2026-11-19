"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  EmptyState,
  Field,
  IconCircle,
  Input,
  PageHeader,
  SectionHeader,
  Skeleton,
  cn,
  type BadgeTone,
  type StatusName,
} from "@newsekolah/ui";
import { MonitorSmartphone, RefreshCw, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useIsSchoolAdmin } from "../../../lib/session/school-admin";
import { useCan, useSession } from "../../../lib/session/session-provider";
import {
  useMonitorPresenceQuery,
  useMonitorSnapshotQuery,
  useMonitorSocket,
  type MonitorConnectionMode,
  type MonitorPeriod,
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

const STATUS_ORDER: MonitorSessionCard["status"][] = [
  "in_progress",
  "not_started",
  "submitted",
  "no_schedule",
];

/** Attendance codes in roster order, each with its status token. */
const CODE_STATUS: Record<string, StatusName> = {
  H: "present",
  S: "sick",
  I: "excused",
  D: "dispensation",
  A: "absent",
};
const CODE_ORDER = ["H", "S", "I", "D", "A"];

/** The attendance colour of each status, as the dot beside its count. */
const STATUS_DOT: Record<StatusName, string> = {
  present: "bg-status-present",
  sick: "bg-status-sick",
  excused: "bg-status-excused",
  dispensation: "bg-status-dispensation",
  absent: "bg-status-absent",
  late: "bg-status-late",
};

const SESSION_TONE: Record<MonitorSessionCard["status"], BadgeTone> = {
  in_progress: "info",
  not_started: "warning",
  submitted: "success",
  no_schedule: "neutral",
};

/** A session still waiting for its attendance stands out with a coloured edge. */
const SESSION_EDGE: Record<MonitorSessionCard["status"], string> = {
  in_progress: "border-l-4 border-l-info",
  not_started: "border-l-4 border-l-warning",
  submitted: "border-l-4 border-l-success",
  no_schedule: "",
};

/**
 * The wall display inside the kiosk frame (brand, screen name, clock): a
 * school opens it once on a mounted screen and leaves it running. The
 * day's attendance counts lead in large figures, then every class in
 * session at a glance, its state readable across a room by colour and
 * words. The snapshot is the public display feed, so a device asks once
 * for the school's display token and remembers it.
 */
export function MonitorView(): ReactElement {
  const [token, setToken] = useState(() => readStoredToken());

  if (token === "") {
    return (
      <TokenGate
        onSubmit={(value) => {
          storeToken(value);
          setToken(value);
        }}
      />
    );
  }

  return (
    <MonitorDisplay
      token={token}
      onForget={() => {
        storeToken("");
        setToken("");
      }}
    />
  );
}

function TokenGate({ onSubmit }: { onSubmit: (token: string) => void }): ReactElement {
  const t = useTranslations("app.monitor");
  const [value, setValue] = useState("");
  // "Ask the school admin" would send the admin to themselves: tell them
  // who sets the token instead.
  const schoolAdmin = useIsSchoolAdmin();
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <Card padding="lg" className="w-full max-w-md">
        <IconCircle tone="green" size="lg">
          <MonitorSmartphone />
        </IconCircle>
        {/* The gate is the whole screen inside the kiosk frame, so its card holds the h1. */}
        <div className="flex flex-col gap-1">
          <CardTitle as="h1" className="text-title">
            {t("gateTitle")}
          </CardTitle>
          <CardDescription>{t("gateBody")}</CardDescription>
        </div>
        {/* POST, so a submit before the page has hydrated never puts the
            display token in the address bar as a query string. */}
        <form
          method="post"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(value.trim());
          }}
        >
          <Field label={t("tokenLabel")} hint={schoolAdmin ? t("tokenHintAdmin") : t("tokenHint")}>
            <Input
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
              }}
              placeholder={t("tokenPlaceholder")}
              autoComplete="off"
            />
          </Field>
          <Button type="submit" size="lg" disabled={value.trim() === ""}>
            {t("tokenSubmit")}
          </Button>
        </form>
      </Card>
    </div>
  );
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
  const schoolAdmin = useIsSchoolAdmin();

  const mode = useMonitorSocket(token);
  const snapshot = useMonitorSnapshotQuery(token, {
    refetchInterval: mode === "polling" ? 15_000 : undefined,
  });
  const presence = useMonitorPresenceQuery(canSeePresence);

  if (snapshot.isError) {
    // Only a refused token means the token is wrong; a network or server
    // failure says so and offers a retry instead of blaming the token.
    const tokenRefused =
      snapshot.error instanceof ApiError &&
      (snapshot.error.status === 401 || snapshot.error.status === 403);
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-10">
        <MonitorPageHeading />
        {tokenRefused ? (
          <Alert variant="warning" title={t("tokenInvalidTitle")}>
            {schoolAdmin ? t("tokenInvalidBodyAdmin") : t("tokenInvalidBody")}
          </Alert>
        ) : (
          <QueryError retry={() => snapshot.refetch()} error={snapshot.error} />
        )}
        <Button variant="secondary" onClick={onForget} className="w-fit">
          {t("tokenForget")}
        </Button>
      </div>
    );
  }

  const counts = snapshot.data?.status_counts ?? {};
  const codes = [
    ...CODE_ORDER.filter((code) => code in counts),
    ...Object.keys(counts).filter((code) => !CODE_ORDER.includes(code)),
  ];
  // A class with no lesson right now is not "in session": it gets its own
  // quiet list, so before and after school the board says nothing runs.
  const allSessions = snapshot.data?.sessions ?? [];
  const sessions = allSessions
    .filter((session) => session.status !== "no_schedule")
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const unscheduled = allSessions.filter((session) => session.status === "no_schedule");
  const currentPeriod = snapshot.data?.current_period;

  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <MonitorPageHeading />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-body text-fg-muted">
          <ConnectionIndicator mode={mode} />
          {canSeePresence && presence.data && (
            <span className="flex items-center gap-2">
              <Users className="size-4" aria-hidden="true" />
              {t("presenceCount", { count: presence.data.count })}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw />} onClick={onForget}>
          {t("tokenForget")}
        </Button>
      </div>

      {mode === "polling" && (
        <Alert variant="warning" title={t("pollingTitle")}>
          {t("pollingBody")}
        </Alert>
      )}

      {snapshot.isLoading ? (
        <div className="flex flex-col gap-6" aria-busy="true">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {CODE_ORDER.map((code) => (
              <Skeleton key={code} className="h-32 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : (
        <>
          <dl
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
            aria-label={t("countsLabel")}
          >
            {codes.map((code) => {
              const status = CODE_STATUS[code];
              return (
                <Card key={code} padding="md" className="gap-2">
                  <dt className="flex items-center gap-2.5 text-heading text-fg">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-3 shrink-0 rounded-full",
                        status ? STATUS_DOT[status] : "bg-fg-muted",
                      )}
                    />
                    {t.has(`codes.${code}`) ? t(`codes.${code}`) : code}
                  </dt>
                  {/* Read from across the room: the kiosk display role. */}
                  <dd className="text-kiosk-display text-fg tabular-nums">{counts[code]}</dd>
                </Card>
              );
            })}
          </dl>

          {sessions.length === 0 ? (
            <EmptyState
              icon={<MonitorSmartphone aria-hidden="true" />}
              title={t("noSessionsTitle")}
              description={t("noSessionsBody")}
            />
          ) : (
            <section className="flex flex-col gap-3" aria-labelledby="monitor-sessions-title">
              <SectionHeader
                titleId="monitor-sessions-title"
                title={t("sessionsTitle")}
                action={currentPeriod && <CurrentPeriod period={currentPeriod} />}
              />
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {sessions.map((session, index) => (
                  <SessionCard
                    key={`${session.class_name}-${session.subject_name}-${index}`}
                    session={session}
                  />
                ))}
              </ul>
            </section>
          )}

          {unscheduled.length > 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="monitor-unscheduled-title">
              <SectionHeader
                titleId="monitor-unscheduled-title"
                title={t("noScheduleTitle")}
                count={unscheduled.length}
              />
              <ul className="flex flex-wrap gap-2">
                {unscheduled.map((session, index) => (
                  <li
                    key={`${session.class_name}-${index}`}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-heading text-fg-muted"
                  >
                    {session.class_name}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The page heading for heading navigation. The kiosk frame already shows
 * the screen's name (as a paragraph beside the school's), so it is only
 * read, not shown twice.
 */
function MonitorPageHeading(): ReactElement {
  const t = useTranslations("app.monitor");
  return <PageHeader title={t("navLabel")} compactTitle={false} className="sr-only" />;
}

/** The lesson period the board is showing, in the school's time zone. */
function CurrentPeriod({ period }: { period: MonitorPeriod }): ReactElement {
  const t = useTranslations("app.monitor");
  const format = useFormatter();
  const { me } = useSession();
  const clock = (instant: string) =>
    format.dateTime(new Date(instant), {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: me?.tenant.timezone,
    });
  return (
    <span className="text-heading text-fg-muted tabular-nums">
      {t("currentPeriod", {
        name: period.name,
        start: clock(period.starts_at),
        end: clock(period.ends_at),
      })}
    </span>
  );
}

function ConnectionIndicator({ mode }: { mode: MonitorConnectionMode }): ReactElement {
  const t = useTranslations("app.monitor");
  const label =
    mode === "live"
      ? t("connectionLive")
      : mode === "polling"
        ? t("connectionPolling")
        : t("connectionConnecting");
  return (
    <span className="flex items-center gap-2" role="status">
      <span
        aria-hidden="true"
        className={cn(
          "size-2.5 rounded-full",
          mode === "live" && "animate-live bg-success",
          mode === "polling" && "bg-warning",
          mode === "connecting" && "bg-fg-muted",
        )}
      />
      {label}
    </span>
  );
}

function SessionCard({ session }: { session: MonitorSessionCard }): ReactElement {
  const t = useTranslations("app.monitor");
  return (
    <li>
      <Card padding="md" className={cn("h-full gap-2", SESSION_EDGE[session.status])}>
        <div className="flex items-start justify-between gap-3">
          <span className="text-kiosk-title text-fg">{session.class_name}</span>
          <Badge tone={SESSION_TONE[session.status]} dot>
            {t.has(`sessionStatus.${session.status}`)
              ? t(`sessionStatus.${session.status}`)
              : session.status}
          </Badge>
        </div>
        {session.status !== "no_schedule" && (
          <p className="text-body text-fg-muted">
            {session.subject_name}
            {" · "}
            {session.substitute_name
              ? `${session.substitute_name} (${t("substituteFor")} ${session.teacher_name})`
              : session.teacher_name}
          </p>
        )}
      </Card>
    </li>
  );
}

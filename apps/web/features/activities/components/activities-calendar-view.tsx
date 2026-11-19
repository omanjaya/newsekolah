"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import {
  DateRangePicker,
  DialogFooter,
  Field,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  RowActionsMenu,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarRange, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import {
  type ActivityEvent,
  type ActivityEventWrite,
  useActivityEventsQuery,
  useCreateActivityEventMutation,
  useUpdateActivityEventMutation,
  useDeleteActivityEventMutation,
} from "../api";
import { formatDayRange } from "../lib/activity-dates";

import { ActivityParticipants } from "./activity-participants";

/**
 * The school's activity agenda, a tab of the student activities area (its
 * title and group come from the navigation). Editing, the participants and
 * deleting wait in each row's menu.
 */
export function ActivitiesCalendarView(): ReactElement {
  const t = useTranslations("app.activities.events");
  const locale = useLocale() as Locale;
  const [search, setSearch] = useState("");
  const canManage = useCan("manage_activity_events");
  const { data, isLoading, error, refetch } = useActivityEventsQuery();
  const [editing, setEditing] = useState<ActivityEvent | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ActivityEvent | null>(null);
  const remove = useDeleteActivityEventMutation();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [participants, setParticipants] = useState<ActivityEvent | null>(null);

  const events = data?.data ?? [];

  const columns = useMemo<ColumnDef<ActivityEvent>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      {
        accessorKey: "start_date",
        header: t("columns.dates"),
        enableSorting: false,
        cell: ({ row }) => formatDayRange(row.original.start_date, row.original.end_date, locale),
      },
      {
        accessorKey: "location",
        header: t("columns.location"),
        enableSorting: false,
        cell: ({ row }) => row.original.location || "-",
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: t("columns.actions"),
              enableSorting: false,
              cell: ({ row }: { row: { original: ActivityEvent } }) => (
                <RowActionsMenu
                  ariaLabel={t("rowActions", { name: row.original.name })}
                  items={[
                    {
                      label: t("edit"),
                      icon: <Pencil />,
                      onClick: () => {
                        setEditing(row.original);
                      },
                    },
                    {
                      label: t("participants.title"),
                      icon: <Users />,
                      onClick: () => {
                        setParticipants(row.original);
                      },
                    },
                    {
                      label: t("delete"),
                      icon: <Trash2 />,
                      tone: "danger",
                      onClick: () => {
                        setPendingDelete(row.original);
                      },
                    },
                  ]}
                />
              ),
            } satisfies ColumnDef<ActivityEvent>,
          ]
        : []),
    ],
    [t, canManage, locale],
  );

  return (
    <AppPage
      variant="fit"
      primaryAction={
        canManage ? (
          <Button
            icon={<Plus />}
            onClick={() => {
              setEditing("new");
            }}
          >
            {t("add")}
          </Button>
        ) : undefined
      }
      primaryActionCompact={
        canManage
          ? {
              icon: <Plus />,
              label: t("add"),
              onSelect: () => {
                setEditing("new");
              },
            }
          : undefined
      }
    >
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
          stateKey="features/activities/components/activities-calendar-view:1"
          mode="local"
          data={events}
          columns={columns}
          rowCount={events.length}
          pagination={{ pageIndex: 0, pageSize: 50 }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          getRowId={(item) => item.id}
          fillHeight
          emptyState={
            <EmptyState
              icon={<CalendarRange aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
              // The header already carries the primary "add".
              action={
                canManage ? (
                  <Button
                    variant="secondary"
                    icon={<Plus />}
                    onClick={() => {
                      setEditing("new");
                    }}
                  >
                    {t("add")}
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent title={editing === "new" ? t("form.title") : t("form.editTitle")}>
          {editing !== null && (
            <ActivityEventForm
              key={editing === "new" ? "new" : editing.id}
              initial={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("deleteTitle")}
        description={t("deleteBody")}
        confirmLabel={t("delete")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            toast.success(t("deleted"));
            setPendingDelete(null);
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          }
        }}
      />
      <Dialog
        open={participants !== null}
        onOpenChange={(open) => {
          if (!open) setParticipants(null);
        }}
      >
        <DialogContent title={t("participants.title")} description={participants?.name}>
          {participants && <ActivityParticipants activityId={participants.id} />}
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}

function ActivityEventForm({
  initial,
  onDone,
}: {
  initial?: ActivityEvent;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.activities.events.form");
  const tEvents = useTranslations("app.activities.events");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateActivityEventMutation();
  const update = useUpdateActivityEventMutation();
  const { me } = useSession();

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  // One picker for both ends, so the end can never come before the start.
  const [dates, setDates] = useState({
    from: initial?.start_date ?? "",
    to: initial?.end_date ?? "",
  });
  // Required fields are marked on their labels and checked on submit.
  const [attempted, setAttempted] = useState(false);
  const errors = {
    name: name.trim() === "" ? t("errors.name") : undefined,
    dates: dates.from === "" || dates.to === "" ? t("errors.dates") : undefined,
  };
  const valid = Object.values(errors).every((error) => error === undefined);
  const shown = (error: string | undefined) => (attempted ? error : undefined);
  const pending = create.isPending || update.isPending;

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (!valid || pending) return;
        const body: ActivityEventWrite = {
          organiser_user_id: initial?.organiser_user_id,
          name: name.trim(),
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          start_date: dates.from,
          end_date: dates.to,
        };
        const callbacks = {
          onSuccess: () => {
            toast.success(tEvents("saved"));
            onDone();
          },
          onError: (error: unknown) => {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        };
        if (initial) update.mutate({ id: initial.id, ...body }, callbacks);
        else create.mutate(body, callbacks);
      }}
    >
      <Field label={t("name")} required error={shown(errors.name)}>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          maxLength={200}
        />
      </Field>
      <Field label={t("description")}>
        <Textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          maxLength={4000}
          rows={3}
        />
      </Field>
      <Field label={t("location")}>
        <Input
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
          }}
          maxLength={200}
        />
      </Field>
      <Field label={t("dates")} required error={shown(errors.dates)}>
        <DateRangePicker
          value={dates}
          onChange={setDates}
          today={todayInZone(me?.tenant.timezone)}
          required
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

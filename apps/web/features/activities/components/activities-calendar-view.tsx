"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  DatePicker,
  DialogFooter,
  Field,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarRange, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type ActivityEvent,
  type ActivityEventWrite,
  useActivityEventsQuery,
  useCreateActivityEventMutation,
  useUpdateActivityEventMutation,
  useDeleteActivityEventMutation,
} from "../api";

import { ActivityParticipants } from "./activity-participants";

export function ActivitiesCalendarView(): ReactElement {
  const tNav = useTranslations("app.activities");
  const tShell = useTranslations("app.shell.nav.items");
  const t = useTranslations("app.activities.events");
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
        cell: ({ row }) => `${row.original.start_date} - ${row.original.end_date}`,
      },
      {
        accessorKey: "location",
        header: t("columns.location"),
        enableSorting: false,
        cell: ({ row }) => row.original.location || "-",
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          canManage ? (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditing(row.original);
                }}
              >
                {t("edit")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setParticipants(row.original);
                }}
              >
                {t("participants.title")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPendingDelete(row.original);
                }}
              >
                {t("delete")}
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, canManage],
  );

  return (
    <AppPage
      variant="fit"
      title={tNav("navLabelEvents")}
      eyebrow={tShell("studentActivities")}
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
    >
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
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
              action={
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

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body: ActivityEventWrite = {
          organiser_user_id: initial?.organiser_user_id,
          name: name.trim(),
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          start_date: startDate,
          end_date: endDate,
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
      <Field label={t("name")}>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
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
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("startDate")}>
          <DatePicker value={startDate} required onChange={setStartDate} />
        </Field>
        <Field label={t("endDate")}>
          <DatePicker min={startDate} value={endDate} required onChange={setEndDate} />
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending || update.isPending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

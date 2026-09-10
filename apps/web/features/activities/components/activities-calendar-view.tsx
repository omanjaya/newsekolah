"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  PageHeader,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarRange, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type ActivityEvent,
  type ActivityEventWrite,
  useActivityEventsQuery,
  useCreateActivityEventMutation,
} from "../api";

export function ActivitiesCalendarView(): ReactElement {
  const t = useTranslations("app.activities.events");
  const canManage = useCan("manage_activity_events");
  const { data, isLoading } = useActivityEventsQuery();
  const [creating, setCreating] = useState(false);

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
    ],
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      {canManage && (
        <div className="flex justify-end">
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setCreating(true);
            }}
          >
            {t("add")}
          </Button>
        </div>
      )}

      <DataTable
        data={events}
        columns={columns}
        rowCount={events.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
        isLoading={isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<CalendarRange aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("form.title")}>
          <ActivityEventForm
            onDone={() => {
              setCreating(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActivityEventForm({ onDone }: { onDone: () => void }): ReactElement {
  const t = useTranslations("app.activities.events.form");
  const tEvents = useTranslations("app.activities.events");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateActivityEventMutation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body: ActivityEventWrite = {
          name: name.trim(),
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          start_date: startDate,
          end_date: endDate,
        };
        create.mutate(body, {
          onSuccess: () => {
            toast.success(tEvents("saved"));
            onDone();
          },
          onError: (error) => {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        });
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("name")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
          maxLength={200}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("description")}</span>
        <Textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          maxLength={4000}
          rows={3}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("location")}</span>
        <Input
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
          }}
          maxLength={200}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("startDate")}</span>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
            }}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("endDate")}</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
            }}
            required
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Checkbox,
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
import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type Extracurricular,
  type ExtracurricularWrite,
  useCreateExtracurricularMutation,
  useExtracurricularsQuery,
  useUpdateExtracurricularMutation,
} from "../api";

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function ClubsView(): ReactElement {
  const t = useTranslations("app.activities.clubs");
  const canManage = useCan("manage_extracurriculars");
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data, isLoading } = useExtracurricularsQuery(includeInactive);
  const [editing, setEditing] = useState<Extracurricular | "new" | null>(null);

  const clubs = data?.data ?? [];

  const columns = useMemo<ColumnDef<Extracurricular>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            href={`/activities/clubs/${row.original.id}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "meeting_day",
        header: t("columns.schedule"),
        enableSorting: false,
        cell: ({ row }) => {
          const club = row.original;
          if (club.meeting_day === undefined) return "-";
          const day = t(`weekdays.${WEEKDAY_KEYS[club.meeting_day] ?? "sunday"}`);
          const time =
            club.meeting_start && club.meeting_end
              ? `${club.meeting_start}-${club.meeting_end}`
              : (club.meeting_start ?? "");
          return `${day}${time ? ` ${time}` : ""}`;
        },
      },
      {
        accessorKey: "capacity",
        header: t("columns.capacity"),
        enableSorting: false,
        cell: ({ row }) => row.original.capacity ?? t("noLimit"),
      },
      {
        accessorKey: "is_active",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? "accent" : "neutral"}>
            {t(row.original.is_active ? "status.active" : "status.inactive")}
          </Badge>
        ),
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: t("columns.actions"),
              enableSorting: false,
              cell: ({ row }: { row: { original: Extracurricular } }) => (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditing(row.original);
                  }}
                >
                  {t("edit")}
                </Button>
              ),
            } satisfies ColumnDef<Extracurricular>,
          ]
        : []),
    ],
    [t, canManage],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox
            checked={includeInactive}
            onCheckedChange={(v) => {
              setIncludeInactive(v === true);
            }}
          />
          {t("includeInactive")}
        </label>
        {canManage && (
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setEditing("new");
            }}
          >
            {t("add")}
          </Button>
        )}
      </div>

      <DataTable
        data={clubs}
        columns={columns}
        rowCount={clubs.length}
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
            icon={<Users aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent title={editing === "new" ? t("form.createTitle") : t("form.editTitle")}>
          {editing !== null && (
            <ClubForm
              initial={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClubForm({
  initial,
  onDone,
}: {
  initial?: Extracurricular;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.activities.clubs.form");
  const tClubs = useTranslations("app.activities.clubs");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateExtracurricularMutation();
  const update = useUpdateExtracurricularMutation();

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [meetingDay, setMeetingDay] = useState(
    initial?.meeting_day !== undefined ? String(initial.meeting_day) : "",
  );
  const [meetingStart, setMeetingStart] = useState(initial?.meeting_start ?? "");
  const [meetingEnd, setMeetingEnd] = useState(initial?.meeting_end ?? "");

  const pending = create.isPending || update.isPending;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body: ExtracurricularWrite = {
          name: name.trim(),
          description: description.trim() || undefined,
          capacity: capacity.trim() ? Number(capacity) : undefined,
          location: location.trim() || undefined,
          meeting_day: meetingDay === "" ? undefined : Number(meetingDay),
          meeting_start: meetingStart.trim() || undefined,
          meeting_end: meetingEnd.trim() || undefined,
          is_active: initial?.is_active ?? true,
        };
        const onSuccess = () => {
          toast.success(tClubs("saved"));
          onDone();
        };
        const onError = (error: unknown) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        };
        if (initial) {
          update.mutate({ id: initial.id, ...body }, { onSuccess, onError });
        } else {
          create.mutate(body, { onSuccess, onError });
        }
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
          maxLength={150}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("description")}</span>
        <Textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          maxLength={2000}
          rows={3}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("capacity")}</span>
          <Input
            type="number"
            value={capacity}
            onChange={(e) => {
              setCapacity(e.target.value);
            }}
            min={1}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("location")}</span>
          <Input
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
            }}
            maxLength={150}
          />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("meetingDay")}</span>
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
            value={meetingDay}
            onChange={(e) => {
              setMeetingDay(e.target.value);
            }}
          >
            <option value="">{t("meetingDayNone")}</option>
            {WEEKDAY_KEYS.map((key, index) => (
              <option key={key} value={index}>
                {tClubs(`weekdays.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("meetingStart")}</span>
          <Input
            type="time"
            value={meetingStart}
            onChange={(e) => {
              setMeetingStart(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("meetingEnd")}</span>
          <Input
            type="time"
            value={meetingEnd}
            onChange={(e) => {
              setMeetingEnd(e.target.value);
            }}
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

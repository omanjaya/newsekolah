"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Avatar,
  Badge,
  Button,
  Combobox,
  ConfirmDialog,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  FormError,
  List,
  RowActionsMenu,
  type RowActionsMenuItem,
  Select,
  SkeletonList,
  Switch,
  useDebouncedCallback,
  useSingleFlight,
  useToast,
} from "@newsekolah/ui";
import { Ban, CalendarX2, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../attendance/api";
import { useClassesQuery, useLookup } from "../../reference/api";
import { useDirectoryNames } from "../../reference/directory-names";
import { type DutyAssignment } from "../api";
import {
  useCreateDutyAssignmentMutation,
  useDutyAssignmentsQuery,
  useDutyTypesQuery,
  useEndDutyAssignmentMutation,
  useStaffOptionsQuery,
  useUpdateDutyAssignmentMutation,
} from "../duties-api";

import { EndDutyAssignmentDialog } from "./end-duty-assignment-dialog";

/** Active additional duties and the form for assigning staff. */
export function DutiesView(): ReactElement {
  const t = useTranslations("app.school.duties");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const types = useDutyTypesQuery();
  const assignments = useDutyAssignmentsQuery();
  const classes = useClassesQuery();
  const classMap = useLookup(classes.data?.data);
  const end = useEndDutyAssignmentMutation();
  const update = useUpdateDutyAssignmentMutation();
  const [adding, setAdding] = useState(false);
  const [showEnded, setShowEnded] = useState(false);
  const [ending, setEnding] = useState<DutyAssignment | null>(null);
  // An ended row is removed; an active row that has not started yet is
  // cancelled, which is the same DELETE: it never granted anything.
  const [removing, setRemoving] = useState<DutyAssignment | null>(null);
  const cancelling = removing?.is_active ?? false;
  const today = todayInZone(me?.tenant.timezone);
  const allRows = assignments.data?.data ?? [];
  const activeRows = allRows.filter((a) => a.is_active);
  const rows = showEnded ? allRows : activeRows;
  // Duty holders can be teachers or non-teaching staff; look up whoever is listed.
  const holderMap = useDirectoryNames(rows.map((a) => a.user_id));

  function fail(error: unknown) {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  /**
   * A row that has not started yet is cancelled (deleted: it never granted
   * anything), an active one is ended on a date, and an ended one can be
   * reactivated or removed.
   */
  function rowActions(a: DutyAssignment, notStarted: boolean): RowActionsMenuItem[] {
    if (notStarted) {
      return [
        {
          label: t("cancelAssignment"),
          icon: <Ban />,
          tone: "danger",
          onClick: () => {
            setRemoving(a);
          },
        },
      ];
    }
    if (a.is_active) {
      return [
        {
          label: t("endAction"),
          icon: <CalendarX2 />,
          tone: "danger",
          onClick: () => {
            setEnding(a);
          },
        },
      ];
    }
    return [
      {
        label: t("reactivate"),
        icon: <RotateCcw />,
        disabled: update.isPending && update.variables.id === a.id,
        onClick: () => {
          update.mutate(
            { id: a.id, body: { is_active: true } },
            {
              onSuccess: () => {
                toast.success(t("reactivated"));
              },
              onError: fail,
            },
          );
        },
      },
      {
        label: t("remove"),
        icon: <Trash2 />,
        tone: "danger",
        onClick: () => {
          setRemoving(a);
        },
      },
    ];
  }

  return (
    // md:h-full: fills the tab panel's height; the assignments list below
    // the fixed heading and action row scrolls internally.
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body-sm text-fg-muted tabular-nums">
            {assignments.data ? t("activeCount", { n: activeRows.length }) : null}
          </p>
          <Field label={t("showEnded")} orientation="inline">
            <Switch checked={showEnded} onCheckedChange={setShowEnded} />
          </Field>
        </div>
        <Button
          size="sm"
          icon={<Plus />}
          onClick={() => {
            setAdding(true);
          }}
        >
          {t("assign")}
        </Button>
      </div>
      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
        {assignments.isLoading ? (
          <SkeletonList rows={5} leading framed />
        ) : assignments.isError && !assignments.data ? (
          <QueryError retry={() => assignments.refetch()} error={assignments.error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        ) : (
          <List framed>
            {rows.map((a) => {
              const name = holderMap.get(a.user_id)?.name ?? "-";
              // starts_on and today are both "YYYY-MM-DD" in the school's zone.
              const notStarted = a.is_active && a.starts_on > today;
              return (
                <li
                  key={a.id}
                  className="group relative flex flex-col gap-2 py-3 pr-14 pl-4 transition-colors hover:bg-state-hover md:flex-row md:items-center md:justify-between md:pr-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {name !== "-" && <Avatar size={32} name={name} />}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-body text-fg">{name}</span>
                      <span className="flex flex-wrap items-center gap-2 text-body-sm text-fg-muted">
                        <Badge tone={a.is_active ? "success" : "neutral"}>{a.duty_name}</Badge>
                        {a.scope_class_id && (
                          <span>{classMap.get(a.scope_class_id)?.name ?? "-"}</span>
                        )}
                        <span>
                          {t(notStarted ? "startsLater" : "since", {
                            date: formatDate(a.starts_on, {
                              locale,
                              timeZone: me?.tenant.timezone,
                            }),
                          })}
                        </span>
                        {!a.is_active && a.ends_on && (
                          <span>
                            {t("endedOn", {
                              date: formatDate(a.ends_on, {
                                locale,
                                timeZone: me?.tenant.timezone,
                              }),
                            })}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="absolute top-2 right-2 md:static md:shrink-0">
                    {/* One "..." menu per row, named after the holder and the
                        duty, like the other school lists' row actions. */}
                    <RowActionsMenu
                      ariaLabel={t("rowActions", { name, duty: a.duty_name })}
                      items={rowActions(a, notStarted)}
                    />
                  </div>
                </li>
              );
            })}
          </List>
        )}
      </div>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title={t("assign")}>
          {adding && (
            <AssignForm
              types={types.data?.data ?? []}
              onDone={() => {
                setAdding(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <EndDutyAssignmentDialog
        assignment={ending}
        onClose={() => {
          setEnding(null);
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={t(cancelling ? "cancelAssignment" : "remove")}
        description={
          removing
            ? t(cancelling ? "cancelAssignmentBody" : "removeBody", { duty: removing.duty_name })
            : ""
        }
        confirmLabel={t(cancelling ? "cancelAssignmentConfirm" : "remove")}
        tone="danger"
        confirming={end.isPending}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await end.mutateAsync(removing.id);
            toast.success(t(cancelling ? "cancelledAssignment" : "removed"));
          } catch (error) {
            fail(error);
          } finally {
            setRemoving(null);
          }
        }}
      />
    </div>
  );
}

function AssignForm({
  types,
  onDone,
}: {
  types: { id: string; name: string; scope_kind: string; is_active: boolean }[];
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.school.duties");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();
  const year = useActiveYear();
  const classes = useClassesQuery();
  const create = useCreateDutyAssignmentMutation();
  const [typeId, setTypeId] = useState("");
  const [userId, setUserId] = useState("");
  const [userLabel, setUserLabel] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [classId, setClassId] = useState("");
  const [startsOn, setStartsOn] = useState(() => todayInZone(me?.tenant.timezone));
  const [error, setError] = useState<string | null>(null);
  const type = types.find((x) => x.id === typeId);

  const debounceUserSearch = useDebouncedCallback(setUserSearch, 300);
  const staffOptionsQuery = useStaffOptionsQuery(userSearch);
  // Keeps the picked name showing in the trigger even after the search
  // text moves on and the person falls out of the latest results.
  const userOptions = useMemo(() => {
    const base = (staffOptionsQuery.data?.data ?? []).map((option) => ({
      value: option.id,
      label: option.name,
    }));
    if (userId && !base.some((option) => option.value === userId)) {
      return [{ value: userId, label: userLabel }, ...base];
    }
    return base;
  }, [staffOptionsQuery.data, userId, userLabel]);

  // A double click on Simpan used to send two POSTs before isPending
  // re-rendered the button, saving the assignment twice.
  const submit = useSingleFlight(async () => {
    setError(null);
    if (!typeId || !userId || (type?.scope_kind === "class" && !classId)) {
      setError(t("requiredError"));
      return;
    }
    try {
      await create.mutateAsync({
        academic_year_id: year.id,
        duty_type_id: typeId,
        user_id: userId,
        starts_on: startsOn,
        ...(type?.scope_kind === "class" ? { scope_class_id: classId } : {}),
      });
      toast.success(t("assigned"));
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && <FormError>{error}</FormError>}
      <Field label={t("duty")}>
        <Select
          options={types.filter((x) => x.is_active).map((x) => ({ value: x.id, label: x.name }))}
          value={typeId}
          onValueChange={setTypeId}
          placeholder={t("pick")}
        />
      </Field>
      <Field label={t("person")}>
        <Combobox
          options={userOptions}
          value={userId}
          onValueChange={(value) => {
            setUserId(value);
            setUserLabel(userOptions.find((option) => option.value === value)?.label ?? "");
          }}
          search={userSearch}
          onSearchChange={debounceUserSearch}
          placeholder={t("pick")}
          searchPlaceholder={t("personSearchPlaceholder")}
          emptyLabel={t("personEmpty")}
          loading={staffOptionsQuery.isLoading}
          aria-label={t("person")}
        />
      </Field>
      {type?.scope_kind === "class" && (
        <Field label={t("class")}>
          <Select
            options={(classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={classId}
            onValueChange={setClassId}
            placeholder={t("pick")}
          />
        </Field>
      )}
      <Field label={t("startsOn")}>
        <DatePicker value={startsOn} onChange={setStartsOn} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

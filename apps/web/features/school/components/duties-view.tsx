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
  Dialog,
  DialogContent,
  EmptyState,
  IconButton,
  Input,
  Select,
  Skeleton,
  Switch,
  useDebouncedCallback,
  useToast,
} from "@newsekolah/ui";
import { Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../attendance/api";
import { useClassesQuery, useDirectoryQuery, useLookup } from "../../reference/api";
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
  // Duty holders can be teachers or non-teaching staff; a single unscoped
  // directory query missed most staff, so names fell back to raw ids.
  const teachers = useDirectoryQuery("teacher");
  const staff = useDirectoryQuery("staff");
  const classes = useClassesQuery();
  const teacherMap = useLookup(teachers.data?.data);
  const staffMap = useLookup(staff.data?.data);
  const classMap = useLookup(classes.data?.data);
  const end = useEndDutyAssignmentMutation();
  const update = useUpdateDutyAssignmentMutation();
  const [adding, setAdding] = useState(false);
  const [showEnded, setShowEnded] = useState(false);
  const [ending, setEnding] = useState<DutyAssignment | null>(null);
  const [removing, setRemoving] = useState<DutyAssignment | null>(null);
  const allRows = assignments.data?.data ?? [];
  const activeRows = allRows.filter((a) => a.is_active);
  const rows = showEnded ? allRows : activeRows;

  function fail(error: unknown) {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  return (
    // md:h-full: fills the tab panel's height; the assignments list below
    // the fixed heading and action row scrolls internally.
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-fg-muted tabular-nums">
            {assignments.data ? t("activeCount", { n: activeRows.length }) : null}
          </p>
          <label className="flex items-center gap-2 text-[13px] text-fg-muted">
            <Switch checked={showEnded} onCheckedChange={setShowEnded} />
            {t("showEnded")}
          </label>
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
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        ) : (
          <ul className="divide-y divide-border rounded-sm border border-border bg-surface">
            {rows.map((a) => {
              const name = teacherMap.get(a.user_id)?.name ?? staffMap.get(a.user_id)?.name ?? "-";
              return (
                <li
                  key={a.id}
                  className="group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-bg md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {name !== "-" && <Avatar size="sm" name={name} />}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[14px] text-fg">{name}</span>
                      <span className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
                        <Badge variant={a.is_active ? "accent" : "neutral"}>{a.duty_name}</Badge>
                        {a.scope_class_id && (
                          <span>{classMap.get(a.scope_class_id)?.name ?? "-"}</span>
                        )}
                        <span>
                          {t("since", {
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
                  <div className="flex shrink-0 items-center gap-1 self-start md:self-auto">
                    {a.is_active ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEnding(a);
                        }}
                      >
                        {t("end")}
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<RotateCcw />}
                          loading={update.isPending && update.variables.id === a.id}
                          onClick={() => {
                            update.mutate(
                              { id: a.id, body: { is_active: true } },
                              {
                                onSuccess: () => {
                                  toast.success(t("reactivated"));
                                },
                                onError: fail,
                              },
                            );
                          }}
                        >
                          {t("reactivate")}
                        </Button>
                        <IconButton
                          icon={<Trash2 />}
                          aria-label={t("remove")}
                          onClick={() => {
                            setRemoving(a);
                          }}
                        />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
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
        title={t("remove")}
        description={removing ? t("removeBody", { duty: removing.duty_name }) : ""}
        confirmLabel={t("remove")}
        destructive
        confirming={end.isPending}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await end.mutateAsync(removing.id);
            toast.success(t("removed"));
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

  async function submit() {
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
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && (
        <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("duty")}</span>
        <Select
          options={types.filter((x) => x.is_active).map((x) => ({ value: x.id, label: x.name }))}
          value={typeId}
          onValueChange={setTypeId}
          placeholder={t("pick")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("person")}</span>
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
      </label>
      {type?.scope_kind === "class" && (
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("class")}</span>
          <Select
            options={(classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={classId}
            onValueChange={setClassId}
            placeholder={t("pick")}
          />
        </label>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("startsOn")}</span>
        <Input
          type="date"
          value={startsOn}
          onChange={(e) => {
            setStartsOn(e.target.value);
          }}
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

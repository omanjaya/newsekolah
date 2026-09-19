"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  Combobox,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  Select,
  Skeleton,
  useDebouncedCallback,
  useToast,
} from "@newsekolah/ui";
import { Plus, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useClassesQuery, useDirectoryQuery, useLookup } from "../../reference/api";
import {
  useCreateDutyAssignmentMutation,
  useDutyAssignmentsQuery,
  useDutyTypesQuery,
  useEndDutyAssignmentMutation,
  useStaffOptionsQuery,
} from "../duties-api";

/** Active additional duties and the form for assigning staff. */
export function DutiesView(): ReactElement {
  const t = useTranslations("app.school.duties");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const types = useDutyTypesQuery();
  const assignments = useDutyAssignmentsQuery();
  const people = useDirectoryQuery();
  const classes = useClassesQuery();
  const peopleMap = useLookup(people.data?.data);
  const classMap = useLookup(classes.data?.data);
  const end = useEndDutyAssignmentMutation();
  const [adding, setAdding] = useState(false);
  const rows = (assignments.data?.data ?? []).filter((a) => a.is_active);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[18px] font-medium text-fg">{t("tabs.assignments")}</h2>
      <div className="flex justify-end">
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
          {rows.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] text-fg">
                  {peopleMap.get(a.user_id)?.name ?? a.user_id}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
                  <Badge variant="accent">{a.duty_name}</Badge>
                  {a.scope_class_id && <span>{classMap.get(a.scope_class_id)?.name ?? "-"}</span>}
                  <span>
                    {t("since", {
                      date: formatDate(a.starts_on, { locale, timeZone: me?.tenant.timezone }),
                    })}
                  </span>
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                loading={end.isPending && end.variables === a.id}
                onClick={() => {
                  end.mutate(a.id, {
                    onSuccess: () => {
                      toast.success(t("ended"));
                    },
                    onError: (error) => {
                      toast.error(
                        error instanceof ApiError
                          ? apiErrorMessage(error.code)
                          : apiErrorMessage("UNKNOWN"),
                      );
                    },
                  });
                }}
              >
                {t("end")}
              </Button>
            </li>
          ))}
        </ul>
      )}
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
  const year = useActiveYear();
  const classes = useClassesQuery();
  const create = useCreateDutyAssignmentMutation();
  const [typeId, setTypeId] = useState("");
  const [userId, setUserId] = useState("");
  const [userLabel, setUserLabel] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [classId, setClassId] = useState("");
  const [startsOn, setStartsOn] = useState(new Date().toISOString().slice(0, 10));
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

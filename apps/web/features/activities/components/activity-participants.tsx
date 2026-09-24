"use client";

import { ApiError } from "@newsekolah/api-client";
import { Avatar, Button, ConfirmDialog, EmptyState, Select, useToast } from "@newsekolah/ui";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useGradeLevelsQuery } from "../../academic/api-master-data";
import { useClassesQuery, useDirectoryQuery } from "../../reference/api";
import {
  useActivityEventQuery,
  useAddActivityParticipantMutation,
  useRemoveActivityParticipantMutation,
} from "../api";

import { StudentPicker } from "./student-picker";

export function ActivityParticipants({ activityId }: { activityId: string }): ReactElement {
  const t = useTranslations("app.activities.events.participants");
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const event = useActivityEventQuery(activityId);
  const classes = useClassesQuery();
  const grades = useGradeLevelsQuery();
  const students = useDirectoryQuery("student");
  const add = useAddActivityParticipantMutation(activityId);
  const remove = useRemoveActivityParticipantMutation();
  const [scope, setScope] = useState("student");
  const [target, setTarget] = useState("");
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const fail = (error: unknown) => {
    toast.error(error instanceof ApiError ? errorMessage(error.code) : errorMessage("UNKNOWN"));
  };
  const studentNameById = useMemo(
    () => new Map((students.data?.data ?? []).map((s) => [s.id, s.name])),
    [students.data],
  );
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!target) return;
          const body =
            scope === "class"
              ? { class_id: target }
              : scope === "grade_level"
                ? { grade_level_id: target }
                : { student_user_id: target };
          add.mutate(body, {
            onSuccess: () => {
              setTarget("");
              toast.success(t("added"));
            },
            onError: fail,
          });
        }}
      >
        <Select
          aria-label={t("scope")}
          value={scope}
          onValueChange={(value) => {
            setScope(value);
            setTarget("");
          }}
          options={["student", "class", "grade_level"].map((value) => ({ value, label: t(value) }))}
        />
        {scope === "student" ? (
          <StudentPicker value={target} onChange={setTarget} />
        ) : (
          <Select
            aria-label={t("choose")}
            placeholder={t("choose")}
            value={target}
            onValueChange={setTarget}
            options={(scope === "class"
              ? (classes.data?.data ?? [])
              : (grades.data?.data ?? [])
            ).map((item) => ({ value: item.id, label: item.name }))}
          />
        )}
        <Button
          type="submit"
          disabled={!target || event.isLoading || event.isError}
          loading={add.isPending}
        >
          {t("add")}
        </Button>
      </form>
      {event.isError && (
        <p role="alert" className="text-[13px] text-status-absent">
          {t("loadError")}
        </p>
      )}
      {event.isLoading && <p className="text-[13px] text-fg-muted">{t("loading")}</p>}
      {!event.isLoading &&
        !event.isError &&
        ((event.data?.participants ?? []).length === 0 ? (
          <EmptyState icon={<Users aria-hidden="true" />} title={t("empty")} />
        ) : (
          <ul className="divide-y divide-border">
            {(event.data?.participants ?? []).map((participant) => {
              const name =
                participant.scope === "student"
                  ? (studentNameById.get(participant.student_user_id ?? "") ?? t("unknown"))
                  : ((participant.scope === "class"
                      ? classes.data?.data.find((item) => item.id === participant.class_id)?.name
                      : grades.data?.data.find((item) => item.id === participant.grade_level_id)
                          ?.name) ?? t("unknown"));
              return (
                <li
                  key={participant.id}
                  className="flex items-center justify-between gap-2 py-2 text-[13px]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {participant.scope === "student" && <Avatar name={name} size="sm" />}
                    <span className="truncate">
                      <span className="text-fg-muted">{t(participant.scope)}: </span>
                      {formatDisplayName(name)}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPendingRemove(participant.id);
                    }}
                  >
                    {t("remove")}
                  </Button>
                </li>
              );
            })}
          </ul>
        ))}
      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
        title={t("removeTitle")}
        description={t("removeBody")}
        confirmLabel={t("remove")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingRemove) return;
          try {
            await remove.mutateAsync(pendingRemove);
            setPendingRemove(null);
            toast.success(t("removed"));
          } catch (error) {
            fail(error);
          }
        }}
      />
    </div>
  );
}

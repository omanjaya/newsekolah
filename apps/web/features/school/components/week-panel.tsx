"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Switch, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSchoolDaysQuery } from "../../reference/api";
import { useSetWeekdayMutation, useWeekdayAssignmentsQuery } from "../api";

export function WeekPanel({ templateId }: { templateId: string }): ReactElement {
  const t = useTranslations("app.school.periods");
  const tDays = useTranslations("app.common.weekdays");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const schoolDays = useSchoolDaysQuery();
  const weekdays = useWeekdayAssignmentsQuery();
  const set = useSetWeekdayMutation();
  const active = new Map((schoolDays.data?.data ?? []).map((d) => [d.day_of_week, d.is_active]));
  const assigned = new Map((weekdays.data?.data ?? []).map((w) => [w.day_of_week, w.template_id]));

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <h2 className="text-[16px] font-medium text-fg">{t("weekTitle")}</h2>
      <p className="text-[13px] text-fg-muted">{t("weekBody")}</p>
      <ul className="flex flex-col divide-y divide-border">
        {[1, 2, 3, 4, 5, 6, 7].map((day) => {
          const on = active.get(day) ?? false;
          const usesThis = assigned.get(day) === templateId;
          return (
            <li key={day} className="flex items-center justify-between py-2 text-[14px]">
              <span className="flex items-center gap-2">
                <Switch
                  checked={on}
                  aria-label={tDays(String(day))}
                  onCheckedChange={(checked) => {
                    set.mutate(
                      { day, templateId, active: checked },
                      {
                        onError: (error) => {
                          toast.error(
                            error instanceof ApiError
                              ? apiErrorMessage(error.code)
                              : apiErrorMessage("UNKNOWN"),
                          );
                        },
                      },
                    );
                  }}
                />
                {tDays(String(day))}
              </span>
              {on &&
                (usesThis ? (
                  <span className="text-[12px] text-accent">{t("usesTemplate")}</span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      set.mutate({ day, templateId, active: true });
                    }}
                  >
                    {t("useTemplate")}
                  </Button>
                ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

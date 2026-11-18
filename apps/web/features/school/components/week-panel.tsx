"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  List,
  ListRow,
  Switch,
  useToast,
} from "@newsekolah/ui";
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

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("weekTitle")}</CardTitle>
        <CardDescription>{t("weekBody")}</CardDescription>
      </CardHeader>
      <List dense>
        {[1, 2, 3, 4, 5, 6, 7].map((day) => {
          const on = active.get(day) ?? false;
          const usesThis = assigned.get(day) === templateId;
          return (
            <ListRow
              key={day}
              leading={
                <Switch
                  checked={on}
                  aria-label={tDays(String(day))}
                  onCheckedChange={(checked) => {
                    set.mutate({ day, templateId, active: checked }, { onError: fail });
                  }}
                />
              }
              title={tDays(String(day))}
              trailing={
                on && usesThis ? (
                  <Badge tone="success" dot>
                    {t("usesTemplate")}
                  </Badge>
                ) : undefined
              }
              action={
                on && !usesThis ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      set.mutate({ day, templateId, active: true }, { onError: fail });
                    }}
                  >
                    {t("useTemplate")}
                  </Button>
                ) : undefined
              }
            />
          );
        })}
      </List>
    </Card>
  );
}

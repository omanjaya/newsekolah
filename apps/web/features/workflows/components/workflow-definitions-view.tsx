"use client";

import { PageHeader, Skeleton, Tabs, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useDutyTypesQuery } from "../../school/api";
import { WORKFLOW_KINDS, type WorkflowKind, useWorkflowDefinitionsQuery } from "../api";

import { StageEditor } from "./stage-editor";

export function WorkflowDefinitionsView(): ReactElement {
  const t = useTranslations("app.workflows");
  const [kind, setKind] = useState<WorkflowKind>("exit_permit");
  const definitions = useWorkflowDefinitionsQuery();
  const dutyTypes = useDutyTypesQuery();

  const active = useMemo(
    () => definitions.data?.data.find((d) => d.kind === kind && d.is_active),
    [definitions.data, kind],
  );
  const dutySlugs = (dutyTypes.data?.data ?? []).map((d) => ({ value: d.slug, label: d.name }));

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("body")}</p>

      <Tabs
        value={kind}
        onValueChange={(value) => {
          setKind(value as WorkflowKind);
        }}
      >
        <TabsList>
          {WORKFLOW_KINDS.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`kind.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {definitions.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        // Keyed on kind + version so the editor's local stage list resets to
        // the freshly loaded definition instead of syncing via an effect
        // (see NotificationSettingsView's TimingForm for the same pattern).
        <StageEditor
          key={`${kind}:${active?.version ?? "new"}`}
          kind={kind}
          active={active}
          dutySlugs={dutySlugs}
        />
      )}
    </div>
  );
}

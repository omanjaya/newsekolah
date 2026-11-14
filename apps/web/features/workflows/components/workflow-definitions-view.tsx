"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  ConfirmDialog,
  FormError,
  SkeletonForm,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useDutyTypesQuery } from "../../school/duties-api";
import { SettingsPage } from "../../settings/components/settings-page";
import { SettingsSaveBar } from "../../settings/components/settings-save-bar";
import {
  WORKFLOW_KINDS,
  type WorkflowKind,
  type WorkflowStage,
  useReplaceWorkflowDefinitionMutation,
  useWorkflowDefinitionsQuery,
} from "../api";

import {
  StageEditor,
  newItemId,
  stageKeyErrors,
  uniqueStageKey,
  type StageItem,
} from "./stage-editor";

const NAV_KEY = "settings-workflows";

function itemsOf(stages: readonly WorkflowStage[]): StageItem[] {
  return stages.map((stage) => ({ id: newItemId(), stage, isNew: false, keyTouched: false }));
}

function sameStages(items: StageItem[], stages: readonly WorkflowStage[]): boolean {
  return JSON.stringify(items.map((item) => item.stage)) === JSON.stringify(stages);
}

/**
 * The approval flows of the permit kinds: one tab per kind, each the
 * kind's active stages in order. Edits are a draft until saved from the
 * bar at the bottom edge, which asks first because a save becomes a new
 * version. Switching kind or leaving the page with a draft asks before
 * throwing it away.
 */
export function WorkflowDefinitionsView(): ReactElement {
  const t = useTranslations("app.workflows");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_workflows");
  const [kind, setKind] = useUrlState<WorkflowKind>("kind", WORKFLOW_KINDS, "exit_permit");
  const definitions = useWorkflowDefinitionsQuery();
  const dutyTypes = useDutyTypesQuery();
  const replace = useReplaceWorkflowDefinitionMutation();

  const active = useMemo(
    () => definitions.data?.data.find((d) => d.kind === kind && d.is_active),
    [definitions.data, kind],
  );
  const baseStages = useMemo(() => active?.stages ?? [], [active]);
  const baseKey = `${kind}:${active?.version ?? "new"}`;
  // Client ids for the saved stages, made once per loaded definition so
  // rows keep their identity (focus, open state) across renders.
  const baseItems = useMemo(() => itemsOf(baseStages), [baseStages]);
  // The draft belongs to one kind and version; a fresh definition (after a
  // save, or another kind) starts from its own stages again.
  const [draft, setDraft] = useState<{ key: string; items: StageItem[] } | null>(null);
  const items = draft?.key === baseKey ? draft.items : baseItems;
  const dirty = draft?.key === baseKey && !sameStages(draft.items, baseStages);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingKind, setPendingKind] = useState<WorkflowKind | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const keyErrors = stageKeyErrors(items, {
    empty: t("stage.keyEmpty"),
    duplicate: t("stage.keyDuplicate"),
  });
  const showKeyErrors = submitted ? keyErrors : new Map<string, string>();
  const dutySlugs = (dutyTypes.data?.data ?? []).map((d) => ({ value: d.slug, label: d.name }));
  const editable = canManage;

  function change(next: StageItem[]) {
    setDraft({ key: baseKey, items: next });
  }

  function discard() {
    setDraft(null);
    setSubmitted(false);
  }

  function addStage() {
    const taken = new Set(items.map((item) => item.stage.key));
    const item: StageItem = {
      id: newItemId(),
      stage: {
        key: uniqueStageKey(`tahap_${items.length + 1}`, taken),
        label: "",
        approver_rule: "any_teacher",
        verification: "manual",
      },
      isNew: true,
      keyTouched: false,
    };
    setOpenIds((current) => new Set([...current, item.id]));
    change([...items, item]);
  }

  function removeStage(index: number) {
    const before = items;
    const label = items[index]?.stage.label.trim() ?? "";
    change(items.filter((_, i) => i !== index));
    toast.info(
      t("stageRemoved", { name: label === "" ? t("stage.untitled", { index: index + 1 }) : label }),
      {
        action: {
          label: t("undo"),
          onClick: () => {
            change(before);
          },
        },
      },
    );
  }

  function requestSave() {
    setSubmitted(true);
    if (items.length === 0 || keyErrors.size > 0) return;
    setConfirmSave(true);
  }

  async function handleSave() {
    try {
      await replace.mutateAsync({
        kind,
        stages: items.map((item) => item.stage),
        config: active?.config,
      });
      toast.success(t("saved"));
      setConfirmSave(false);
      discard();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  const blocking =
    submitted && items.length === 0
      ? t("stagesRequired")
      : submitted && keyErrors.size > 0
        ? t("keysInvalid")
        : null;

  return (
    <SettingsPage
      navKey={NAV_KEY}
      variant="default"
      description={t("body")}
      floating={
        editable ? (
          <SettingsSaveBar
            container="default"
            dirty={dirty}
            saving={replace.isPending}
            message={t("unsaved", { kind: t(`kind.${kind}`) })}
            onSave={requestSave}
            onDiscard={discard}
          />
        ) : undefined
      }
    >
      <Tabs
        value={kind}
        onValueChange={(value) => {
          const next = value as WorkflowKind;
          if (next === kind) return;
          if (dirty) setPendingKind(next);
          else setKind(next);
        }}
        className="flex flex-col gap-6"
      >
        <TabsList aria-label={t("kindLabel")}>
          {WORKFLOW_KINDS.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`kind.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* The editor is the tab panel, so each trigger's aria-controls points at it. */}
        <TabsContent value={kind} className="flex flex-col gap-6 pt-0">
          {definitions.isLoading ? (
            <SkeletonForm fields={3} actions={false} />
          ) : definitions.isError && !definitions.data ? (
            <QueryError retry={() => definitions.refetch()} error={definitions.error} />
          ) : (
            <>
              {blocking && <FormError>{blocking}</FormError>}
              <StageEditor
                items={items}
                editable={editable}
                dutySlugs={dutySlugs}
                version={active?.version}
                keyErrors={showKeyErrors}
                openIds={openIds}
                onChange={change}
                onAdd={addStage}
                onRemove={removeStage}
              />
            </>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title={t("confirmTitle")}
        description={t("confirmBody")}
        confirmLabel={t("confirmSave")}
        confirming={replace.isPending}
        onConfirm={handleSave}
      />
      <ConfirmDialog
        open={pendingKind !== null}
        onOpenChange={(open) => {
          if (!open) setPendingKind(null);
        }}
        title={t("discardTitle")}
        description={t("discardBody", { kind: t(`kind.${kind}`) })}
        confirmLabel={t("discardConfirm")}
        tone="danger"
        onConfirm={() => {
          if (pendingKind) setKind(pendingKind);
          discard();
          setPendingKind(null);
        }}
      />
    </SettingsPage>
  );
}

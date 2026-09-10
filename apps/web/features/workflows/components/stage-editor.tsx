"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, ConfirmDialog, useToast } from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type WorkflowDefinition,
  type WorkflowKind,
  type WorkflowStage,
  useReplaceWorkflowDefinitionMutation,
} from "../api";

import { StageRow } from "./stage-row";

function newStage(index: number): WorkflowStage {
  return {
    key: `stage_${index + 1}`,
    label: "",
    approver_rule: "any_teacher",
    verification: "manual",
  };
}

/**
 * Owns the editable stage list for one workflow kind's active definition.
 * Remounted (via a `key` in the parent) whenever the kind or version
 * changes, so its local state always starts from the freshly loaded
 * definition without an effect syncing it after the fact.
 */
export function StageEditor({
  kind,
  active,
  dutySlugs,
}: {
  kind: WorkflowKind;
  active: WorkflowDefinition | undefined;
  dutySlugs: { value: string; label: string }[];
}): ReactElement {
  const t = useTranslations("app.workflows");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_workflows");
  const replace = useReplaceWorkflowDefinitionMutation();

  const [stages, setStages] = useState<WorkflowStage[]>(active?.stages ?? []);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dirty = JSON.stringify(active?.stages ?? []) !== JSON.stringify(stages);

  function updateStage(index: number, next: WorkflowStage) {
    setStages((prev) => prev.map((s, i) => (i === index ? next : s)));
  }

  function moveStage(index: number, direction: -1 | 1) {
    setStages((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(target, 0, moved);
      return next;
    });
  }

  function removeStage(index: number) {
    setStages((prev) => prev.filter((_, i) => i !== index));
  }

  function addStage() {
    setStages((prev) => [...prev, newStage(prev.length)]);
  }

  async function handleSave() {
    try {
      await replace.mutateAsync({ kind, stages, config: active?.config });
      toast.success(t("saved"));
      setConfirmOpen(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <>
      {active && (
        <p className="text-[13px] text-fg-muted">
          {t("versionLabel", { version: active.version })}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {stages.map((stage, index) => (
          <StageRow
            key={index}
            stage={stage}
            index={index}
            isFirst={index === 0}
            isLast={index === stages.length - 1}
            dutySlugs={dutySlugs}
            onChange={(next) => {
              updateStage(index, next);
            }}
            onMove={(direction) => {
              moveStage(index, direction);
            }}
            onRemove={() => {
              removeStage(index);
            }}
          />
        ))}
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" icon={<Plus />} onClick={addStage}>
            {t("addStage")}
          </Button>
          <Button
            size="sm"
            disabled={!dirty || stages.length === 0}
            onClick={() => {
              setConfirmOpen(true);
            }}
          >
            {t("save")}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("confirmTitle")}
        description={t("confirmBody")}
        confirmLabel={t("confirmSave")}
        confirming={replace.isPending}
        onConfirm={handleSave}
      />
    </>
  );
}

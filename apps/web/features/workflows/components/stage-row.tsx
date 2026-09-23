"use client";

import { Button, IconButton, Input, Select } from "@newsekolah/ui";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { FIXED_APPROVER_RULES, VERIFICATION_MODES, type WorkflowStage } from "../api";

const DUTY_PREFIX = "duty:";

/** One editable row of a workflow's stage list: rule, verification, order, and removal. */
export function StageRow({
  stage,
  index,
  isFirst,
  isLast,
  dutySlugs,
  onChange,
  onMove,
  onRemove,
}: {
  stage: WorkflowStage;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  dutySlugs: { value: string; label: string }[];
  onChange: (next: WorkflowStage) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}): ReactElement {
  const t = useTranslations("app.workflows.stage");
  const isDutyRule = stage.approver_rule.startsWith(DUTY_PREFIX);
  const ruleSelectValue = isDutyRule ? "duty" : stage.approver_rule;

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="mt-2 w-5 shrink-0 text-[13px] font-medium tabular-nums text-fg-muted">{`${index + 1}.`}</span>
        <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("labelField")}</span>
            <Input
              value={stage.label}
              onChange={(e) => {
                onChange({ ...stage, label: e.target.value });
              }}
              maxLength={100}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("keyField")}</span>
            <Input
              value={stage.key}
              onChange={(e) => {
                onChange({ ...stage, key: e.target.value.trim() });
              }}
              maxLength={60}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("approverRuleField")}</span>
            <Select
              value={ruleSelectValue}
              onValueChange={(value) => {
                if (value === "duty") {
                  onChange({ ...stage, approver_rule: DUTY_PREFIX });
                  return;
                }
                onChange({ ...stage, approver_rule: value });
              }}
              options={[
                ...FIXED_APPROVER_RULES.map((rule) => ({ value: rule, label: t(`rule.${rule}`) })),
                { value: "duty", label: t("rule.duty") },
              ]}
            />
          </label>
          {isDutyRule && (
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium text-fg">{t("dutySlugField")}</span>
              {dutySlugs.length > 0 ? (
                <Select
                  value={stage.approver_rule.slice(DUTY_PREFIX.length)}
                  onValueChange={(slug) => {
                    onChange({ ...stage, approver_rule: `${DUTY_PREFIX}${slug}` });
                  }}
                  options={dutySlugs}
                  placeholder={t("dutySlugPlaceholder")}
                />
              ) : (
                <Input
                  value={stage.approver_rule.slice(DUTY_PREFIX.length)}
                  onChange={(e) => {
                    onChange({ ...stage, approver_rule: `${DUTY_PREFIX}${e.target.value.trim()}` });
                  }}
                  placeholder={t("dutySlugPlaceholder")}
                />
              )}
            </label>
          )}
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("verificationField")}</span>
            <Select
              value={stage.verification}
              onValueChange={(value) => {
                onChange({ ...stage, verification: value as WorkflowStage["verification"] });
              }}
              options={VERIFICATION_MODES.map((mode) => ({
                value: mode,
                label: t(`verification.${mode}`),
              }))}
            />
          </label>
        </div>
        <div className="flex flex-col items-center gap-1">
          <IconButton
            variant="ghost"
            icon={<ArrowUp />}
            aria-label={t("moveUp")}
            disabled={isFirst}
            onClick={() => {
              onMove(-1);
            }}
          />
          <IconButton
            variant="ghost"
            icon={<ArrowDown />}
            aria-label={t("moveDown")}
            disabled={isLast}
            onClick={() => {
              onMove(1);
            }}
          />
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        icon={<Trash2 />}
        className="self-start text-status-absent"
        onClick={onRemove}
      >
        {t("removeStage")}
      </Button>
    </div>
  );
}

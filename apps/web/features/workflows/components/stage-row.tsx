"use client";

import {
  Disclosure,
  DisclosureContent,
  DisclosureIndicator,
  DisclosureTrigger,
  Field,
  Input,
  RowActionsMenu,
  Select,
  type RowActionsMenuItem,
} from "@newsekolah/ui";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";

import { FIXED_APPROVER_RULES, VERIFICATION_MODES, type WorkflowStage } from "../api";

export const DUTY_PREFIX = "duty:";

/** The human name of a stage's approver rule, e.g. "Guru mana pun" or the duty's own name. */
export function useApproverRuleLabel(
  dutySlugs: { value: string; label: string }[],
): (rule: string) => string {
  const t = useTranslations("app.workflows.stage");
  return (rule) => {
    if (rule.startsWith(DUTY_PREFIX)) {
      const slug = rule.slice(DUTY_PREFIX.length);
      if (!slug) return t("rule.duty");
      return dutySlugs.find((duty) => duty.value === slug)?.label ?? slug;
    }
    return t.has(`rule.${rule}`) ? t(`rule.${rule}`) : rule;
  };
}

export interface StageRowProps {
  stage: WorkflowStage;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  /** Open on mount: a stage just added, so its name can be typed at once. */
  defaultOpen?: boolean;
  /** The stage's code collides with another stage's. */
  keyError?: string;
  editable: boolean;
  dutySlugs: { value: string; label: string }[];
  onChange: (next: WorkflowStage) => void;
  /** The user typed the code themselves: it stops following the name. */
  onKeyTouched: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

/**
 * One stage of a workflow: a compact row (number, name, who approves and
 * how) that opens into its form. Order changes and removal sit together in
 * the row's menu; the stage code, which in-flight requests refer
 * to, waits under "Lanjutan" in the open form.
 */
export function StageRow({
  stage,
  index,
  isFirst,
  isLast,
  defaultOpen = false,
  keyError,
  editable,
  dutySlugs,
  onChange,
  onKeyTouched,
  onMove,
  onRemove,
}: StageRowProps): ReactElement {
  const t = useTranslations("app.workflows.stage");
  const ruleLabel = useApproverRuleLabel(dutySlugs);
  // A stage whose code is in conflict stays open on its code, so the
  // problem is in view without a click.
  const [openState, setOpen] = useState(defaultOpen);
  const [advancedState, setAdvanced] = useState(false);
  const open = openState || Boolean(keyError);
  const advanced = advancedState || Boolean(keyError);
  const isDutyRule = stage.approver_rule.startsWith(DUTY_PREFIX);
  const ruleSelectValue = isDutyRule ? "duty" : stage.approver_rule;
  const name = stage.label.trim() || t("untitled", { index: index + 1 });
  const summary = `${ruleLabel(stage.approver_rule)} · ${t(`verification.${stage.verification}`)}`;

  const menu: RowActionsMenuItem[] = [
    {
      label: t("moveUp"),
      icon: <ArrowUp />,
      disabled: isFirst,
      onClick: () => {
        onMove(-1);
      },
    },
    {
      label: t("moveDown"),
      icon: <ArrowDown />,
      disabled: isLast,
      onClick: () => {
        onMove(1);
      },
    },
    {
      label: t("removeStage"),
      icon: <Trash2 />,
      tone: "danger",
      onClick: onRemove,
    },
  ];

  return (
    <Disclosure open={open} onOpenChange={setOpen}>
      <li className="flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 md:px-4">
          <DisclosureTrigger className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-md">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-label tabular-nums text-accent-soft-fg"
            >
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-label text-fg">
                <span className="sr-only">{t("stageNumber", { index: index + 1 })} </span>
                {name}
              </span>
              <span className="truncate text-body-sm text-fg-muted">{summary}</span>
            </span>
            <DisclosureIndicator />
          </DisclosureTrigger>
          {editable && <RowActionsMenu ariaLabel={t("actions", { name })} items={menu} />}
        </div>

        <DisclosureContent className="grid grid-cols-1 gap-x-4 gap-y-5 px-4 pb-5 sm:grid-cols-2 md:px-5 md:pl-15">
          <Field label={t("labelField")} className="sm:col-span-2" disabled={!editable}>
            <Input
              value={stage.label}
              onChange={(e) => {
                onChange({ ...stage, label: e.target.value });
              }}
              placeholder={t("labelPlaceholder")}
              maxLength={100}
            />
          </Field>
          <Field label={t("approverRuleField")} disabled={!editable}>
            <Select
              value={ruleSelectValue}
              onValueChange={(value) => {
                onChange({ ...stage, approver_rule: value === "duty" ? DUTY_PREFIX : value });
              }}
              options={[
                ...FIXED_APPROVER_RULES.map((rule) => ({ value: rule, label: t(`rule.${rule}`) })),
                { value: "duty", label: t("rule.duty") },
              ]}
            />
          </Field>
          <Field label={t("verificationField")} disabled={!editable}>
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
          </Field>
          {isDutyRule && (
            <Field label={t("dutySlugField")} hint={t("dutySlugHint")} disabled={!editable}>
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
                    onChange({
                      ...stage,
                      approver_rule: `${DUTY_PREFIX}${e.target.value.trim()}`,
                    });
                  }}
                  placeholder={t("dutySlugPlaceholder")}
                />
              )}
            </Field>
          )}
          <Disclosure open={advanced} onOpenChange={setAdvanced}>
            <div className="flex flex-col gap-3 sm:col-span-2">
              <DisclosureTrigger className="flex min-h-11 items-center gap-1.5 self-start rounded-md text-label text-fg-muted hover:text-fg">
                <DisclosureIndicator className="text-current" />
                {t("advanced")}
              </DisclosureTrigger>
              <DisclosureContent>
                <Field
                  label={t("keyField")}
                  hint={t("keyHint")}
                  error={keyError}
                  disabled={!editable}
                  className="sm:max-w-sm"
                >
                  <Input
                    value={stage.key}
                    onChange={(e) => {
                      onKeyTouched();
                      onChange({ ...stage, key: e.target.value.trim() });
                    }}
                    maxLength={60}
                    inputClassName="font-mono"
                    className="font-mono"
                  />
                </Field>
              </DisclosureContent>
            </div>
          </Disclosure>
        </DisclosureContent>
      </li>
    </Disclosure>
  );
}

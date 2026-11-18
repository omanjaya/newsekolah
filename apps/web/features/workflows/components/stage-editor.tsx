"use client";

import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Stepper,
} from "@newsekolah/ui";
import { ListOrdered, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { WorkflowStage } from "../api";

import { StageRow, useApproverRuleLabel } from "./stage-row";

/** A stage being edited, with a client id that survives reordering. */
export interface StageItem {
  id: string;
  stage: WorkflowStage;
  /** Added in this edit: its code follows its name until typed by hand. */
  isNew: boolean;
  keyTouched: boolean;
}

let nextId = 0;
export function newItemId(): string {
  nextId += 1;
  return `stage-item-${nextId}`;
}

/** `Guru piket` becomes `guru_piket`: a stage code made from its name. */
export function stageKeyFrom(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** The first of `base`, `base_2`, `base_3`... no other stage uses. */
export function uniqueStageKey(base: string, taken: ReadonlySet<string>): string {
  const root = base || "tahap";
  if (!taken.has(root)) return root;
  for (let n = 2; ; n += 1) {
    const candidate = `${root}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Per stage id, why its code cannot be saved: empty, or used by an earlier stage. */
export function stageKeyErrors(
  items: StageItem[],
  messages: { empty: string; duplicate: string },
): Map<string, string> {
  const errors = new Map<string, string>();
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.stage.key.trim();
    if (!key) errors.set(item.id, messages.empty);
    else if (seen.has(key)) errors.set(item.id, messages.duplicate);
    seen.add(key);
  }
  return errors;
}

export interface StageEditorProps {
  items: StageItem[];
  editable: boolean;
  dutySlugs: { value: string; label: string }[];
  /** The active definition's version, when one exists. */
  version: number | undefined;
  keyErrors: ReadonlyMap<string, string>;
  /** Item ids to open on mount: stages added in this edit. */
  openIds: ReadonlySet<string>;
  onChange: (items: StageItem[]) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

/**
 * The stages of one workflow kind: the editable list on the left, each
 * stage a row that opens into its form, and on the right a summary of the
 * flow in order (who approves, how) that follows every edit and stays in
 * view on a desktop.
 */
export function StageEditor({
  items,
  editable,
  dutySlugs,
  version,
  keyErrors,
  openIds,
  onChange,
  onAdd,
  onRemove,
}: StageEditorProps): ReactElement {
  const t = useTranslations("app.workflows");
  const ruleLabel = useApproverRuleLabel(dutySlugs);

  function update(index: number, stage: WorkflowStage) {
    onChange(
      items.map((item, i) => {
        if (i !== index) return item;
        // A new stage's code follows its name until the code is typed by hand.
        if (item.isNew && !item.keyTouched && stage.label !== item.stage.label) {
          const taken = new Set(
            items.filter((_, j) => j !== index).map((other) => other.stage.key),
          );
          return {
            ...item,
            stage: { ...stage, key: uniqueStageKey(stageKeyFrom(stage.label), taken) },
          };
        }
        return { ...item, stage };
      }),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    onChange(next);
  }

  const addButton = editable ? (
    <Button variant="secondary" icon={<Plus />} onClick={onAdd}>
      {t("addStage")}
    </Button>
  ) : undefined;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="min-w-0">
        <CardHeader
          action={
            version !== undefined ? (
              <Badge tone="neutral" size="sm">
                {t("versionLabel", { version })}
              </Badge>
            ) : (
              <Badge tone="info" size="sm">
                {t("noVersion")}
              </Badge>
            )
          }
        >
          <CardTitle as="h2">{t("stagesTitle")}</CardTitle>
          <CardDescription>{t("stagesHint")}</CardDescription>
        </CardHeader>
        {items.length === 0 ? (
          <EmptyState
            icon={<ListOrdered aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={addButton}
          />
        ) : (
          <>
            <ol
              aria-label={t("stagesTitle")}
              className="flex flex-col divide-y divide-line border-t border-line"
            >
              {items.map((item, index) => (
                <StageRow
                  key={item.id}
                  stage={item.stage}
                  index={index}
                  isFirst={index === 0}
                  isLast={index === items.length - 1}
                  defaultOpen={openIds.has(item.id)}
                  keyError={keyErrors.get(item.id)}
                  editable={editable}
                  dutySlugs={dutySlugs}
                  onChange={(stage) => {
                    update(index, stage);
                  }}
                  onKeyTouched={() => {
                    onChange(
                      items.map((other, i) =>
                        i === index ? { ...other, keyTouched: true } : other,
                      ),
                    );
                  }}
                  onMove={(direction) => {
                    move(index, direction);
                  }}
                  onRemove={() => {
                    onRemove(index);
                  }}
                />
              ))}
            </ol>
            {addButton && <div className="border-t border-line p-4 md:px-5">{addButton}</div>}
          </>
        )}
      </Card>

      <Card className="hidden lg:sticky lg:block lg:top-[calc(var(--shell-header-height,3.5rem)+1.5rem)]">
        <CardHeader>
          <CardTitle as="h2">{t("summaryTitle")}</CardTitle>
          <CardDescription>{t("summaryHint")}</CardDescription>
        </CardHeader>
        <div className="px-5 pb-5">
          {items.length === 0 ? (
            <p className="text-body-sm text-fg-muted">{t("summaryEmpty")}</p>
          ) : (
            <Stepper
              orientation="vertical"
              currentIndex={-1}
              steps={items.map((item, index) => ({
                id: item.id,
                label: item.stage.label.trim() || t("stage.untitled", { index: index + 1 }),
                description: ruleLabel(item.stage.approver_rule),
                actor: t(`stage.verification.${item.stage.verification}`),
                state: "upcoming",
              }))}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

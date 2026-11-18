"use client";

import { RowActionsMenu } from "@newsekolah/ui";
import { Pencil, Save } from "lucide-react";
import type { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * A component column's secondary actions, collapsed behind one "..." button
 * instead of a permanent "Simpan" button sitting in every column header at
 * once: the sticky bottom bar (`StickySaveBar`) already saves every changed
 * column in one action, so a second, always-visible save control per column
 * was two ways to do the same thing. Saving just this one column (useful
 * mid-entry, before the rest of the sheet is ready) is still one tap away,
 * just no longer competing for attention with the primary save action --
 * the same "actions menu instead of a row of buttons" move
 * `SessionRowActionsMenu` made for the attendance roster.
 */
export function GradebookColumnMenu({
  t,
  code,
  hasEdits,
  saving,
  disabled,
  onEditComponent,
  onSaveColumn,
}: {
  t: ReturnType<typeof useTranslations>;
  code: string;
  hasEdits: boolean;
  saving: boolean;
  /** True while this column has a value outside the grading scale: saving it would fail, so the action is disabled here too. */
  disabled: boolean;
  onEditComponent: () => void;
  onSaveColumn: () => void;
}): ReactElement {
  return (
    <RowActionsMenu
      ariaLabel={t("columnMenu", { code })}
      items={[
        { label: t("editComponent", { code }), icon: <Pencil />, onClick: onEditComponent },
        {
          label: saving ? t("saving") : t("saveColumn"),
          icon: <Save />,
          onClick: onSaveColumn,
          disabled: !hasEdits || disabled || saving,
        },
      ]}
    />
  );
}

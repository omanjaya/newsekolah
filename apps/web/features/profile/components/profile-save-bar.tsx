"use client";

import { Button, StickySaveBar } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * The profile forms' save action: a bar that rises over the tab bar once
 * a field changed, lined up with the narrow page. The form keeps a
 * visually hidden submit button, so Enter in a field still saves.
 */
export function ProfileSaveBar({
  dirty,
  saving,
  saveLabel,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  saveLabel: string;
  onSave: () => void;
}): ReactElement {
  const t = useTranslations("app.profile");
  return (
    <>
      {/* Lets Enter in any field submit the form while the bar is hidden. */}
      <Button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
        {saveLabel}
      </Button>
      {(dirty || saving) && (
        <StickySaveBar
          container="narrow"
          leadingSlot={<p className="text-body-sm text-fg-muted">{t("unsavedChanges")}</p>}
          saveLabel={saveLabel}
          saving={saving}
          onSave={onSave}
        />
      )}
    </>
  );
}

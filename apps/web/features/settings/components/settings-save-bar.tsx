"use client";

import { Button, StickySaveBar, type StickySaveBarProps } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { useUnsavedChangesProtection } from "../../../lib/navigation/use-unsaved-changes-protection";

export interface SettingsSaveBarProps {
  /** The form differs from what is saved: the bar shows and leaving the page asks first. */
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  /** Puts the form back to its saved values. */
  onDiscard: () => void;
  /** Left side; defaults to "Ada perubahan yang belum disimpan". */
  message?: ReactNode;
  /** Defaults to "Simpan perubahan". */
  saveLabel?: ReactNode;
  /** Defaults to "Batalkan". */
  discardLabel?: ReactNode;
  /**
   * Shows the bar before anything changes: a create form, whose submit
   * button is never held back (docs/07-ui-ux.md). Leaving still asks only
   * once something was typed.
   */
  alwaysShow?: boolean;
  /** Lines the bar up with the page: `narrow` for a form, `default` for a two-pane editor. */
  container?: StickySaveBarProps["container"];
  /**
   * Asks before leaving while `dirty` (default). Off for a page that keeps
   * several unsaved drafts and guards all of them itself.
   */
  protect?: boolean;
}

/**
 * The one save behaviour of the settings pages: nothing while the form
 * matches what is saved; with a change, a bar rises from the bottom edge
 * (above the phone tab bar, beside the sidebar) with the count of what is
 * pending, "Batalkan" and "Simpan perubahan", and in-app links, reloads
 * and the back button ask before throwing the change away. Render it in
 * `AppPage`'s `floating` slot, outside the entering content. A create
 * form passes `alwaysShow`, so its create button is there from the start.
 */
export function SettingsSaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  message,
  saveLabel,
  discardLabel,
  alwaysShow = false,
  container = "narrow",
  protect = true,
}: SettingsSaveBarProps): ReactElement | null {
  const t = useTranslations("app.settingsHub.saveBar");
  useUnsavedChangesProtection(protect && dirty, t("leaveConfirm"));
  if (!dirty && !alwaysShow) return null;

  const discard = (className: string) => (
    <Button variant="secondary" className={className} disabled={saving} onClick={onDiscard}>
      {discardLabel ?? t("discard")}
    </Button>
  );

  return (
    <StickySaveBar
      container={container}
      // On a phone the message and "Batalkan" share the first row and the
      // save button takes the second at full width; from 768px "Batalkan"
      // sits beside the save button instead.
      leadingSlot={
        <div className="flex min-h-11 items-center justify-between gap-3">
          <p role="status" className="text-body-sm text-fg">
            {message ?? t("unsaved")}
          </p>
          {discard("md:hidden")}
        </div>
      }
      trailingSlot={discard("hidden md:inline-flex")}
      saveLabel={saveLabel ?? t("save")}
      saving={saving}
      onSave={onSave}
    />
  );
}

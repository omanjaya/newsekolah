"use client";

import { useTranslations } from "next-intl";
import { useMemo, type ReactElement } from "react";

import { AppPage, type AppPageProps } from "../../../components/app-page";
import { WorkspaceNav } from "../../../components/workspace-nav";
import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useSession } from "../../../lib/session/session-provider";
import { settingsPageContext } from "../settings-hub";

export interface SettingsPageProps extends Omit<AppPageProps, "nav" | "eyebrow" | "breadcrumb"> {
  /**
   * The page's navigation registry key ("settings-branding"). Its label is
   * the title, the same text as its hub card and its tab; its hub section
   * gives the tabs under the header.
   */
  navKey: string;
}

/**
 * The frame of every settings page: the narrow page template (720px; a
 * two-pane editor passes `variant="default"`), the page's registry name as
 * its title, a trail back to the settings hub, and the pages of its hub
 * section as tabs directly under the header. One taxonomy (settings-hub.ts)
 * names and groups the hub and the pages it leads to.
 *
 * Pages of the reader's own account (security, notifications, appearance)
 * are reached from the avatar menu by every role, so they carry the
 * "Akun saya" eyebrow instead of a trail into the school's settings.
 */
export function SettingsPage({
  navKey,
  variant = "narrow",
  title,
  ...props
}: SettingsPageProps): ReactElement {
  const t = useTranslations();
  const { me } = useSession();
  const access = useMemo(() => navAccessFromMe(me), [me]);
  const context = useMemo(
    () => settingsPageContext(navKey, { access, translate: (key) => t(key) }),
    [navKey, access, t],
  );
  const account = context?.section === "account";
  const name = title ?? context?.title;
  const hubLabel = t("app.settingsHub.title");
  const breadcrumb =
    !account && canOpenPath("/settings", access) && typeof name === "string"
      ? [{ label: hubLabel, href: "/settings" }, { label: name }]
      : false;
  const sectionLabel = context ? t(`app.settingsHub.sections.${context.section}.title`) : undefined;

  return (
    <AppPage
      variant={variant}
      title={name}
      eyebrow={breadcrumb ? undefined : (sectionLabel ?? false)}
      breadcrumb={breadcrumb}
      nav={
        context && context.tabs.length >= 2 ? (
          <WorkspaceNav label={sectionLabel ?? hubLabel} items={context.tabs} />
        ) : (
          false
        )
      }
      {...props}
    />
  );
}

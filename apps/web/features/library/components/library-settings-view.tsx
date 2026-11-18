"use client";

import { EmptyState, NavTabs, type NavTabsLinkProps } from "@newsekolah/ui";
import { Settings2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { ReactElement, ReactNode } from "react";

import { AppPage } from "../../../components/app-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useSession } from "../../../lib/session/session-provider";
import {
  LIBRARY_SETTINGS_TABS,
  type LibrarySettingsTab,
  visibleLibrarySettingsTabs,
} from "../library-settings-tabs";

import { LoanRulesView } from "./loan-rules-view";
import { MasterDataView } from "./master-data-view";
import { MemberTypesView } from "./member-types-view";

function renderNavLink({ href, className, children, ...rest }: NavTabsLinkProps): ReactNode {
  return (
    <Link href={href} className={className} aria-current={rest["aria-current"]}>
      {children}
    </Link>
  );
}

/**
 * The one place for the library's configuration: loan rules, member types
 * and catalogue data as sections of one page, picked from the tabs under
 * the header and kept in `?section=` (catalogue data owns `?tab=` for its
 * own lists). The old addresses of each section redirect here, so every
 * link and the menu lead to the same page under the same name.
 */
export function LibrarySettingsView(): ReactElement {
  const t = useTranslations("app.librarySettings");
  const { me } = useSession();
  const permissions = me?.permissions;
  const visible = useMemo(
    () => visibleLibrarySettingsTabs((code) => permissions?.includes(code) ?? false),
    [permissions],
  );
  const [requested] = useUrlState<LibrarySettingsTab>(
    "section",
    LIBRARY_SETTINGS_TABS,
    "loanRules",
  );
  const first = visible[0];

  if (!first) {
    return (
      <AppPage nav={false}>
        <EmptyState
          icon={<Settings2 aria-hidden="true" />}
          title={t("noAccessTitle")}
          description={t("noAccessDescription")}
        />
      </AppPage>
    );
  }
  const section = visible.includes(requested) ? requested : first;

  return (
    <AppPage
      documentTitle={t(`tabs.${section}`)}
      nav={
        visible.length > 1 ? (
          <NavTabs
            aria-label={t("tabsLabel")}
            variant="underline"
            items={visible.map((key) => ({
              href: `/library/settings?section=${key}`,
              label: t(`tabs.${key}`),
              current: key === section,
            }))}
            renderLink={renderNavLink}
          />
        ) : (
          false
        )
      }
    >
      {section === "loanRules" && <LoanRulesView />}
      {section === "memberTypes" && <MemberTypesView />}
      {section === "masterData" && <MasterDataView />}
    </AppPage>
  );
}

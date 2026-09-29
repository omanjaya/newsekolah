"use client";

import { Button, Select } from "@newsekolah/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { WorkspaceNav } from "../../../components/workspace-nav";
import { confirmUnsavedChangesBeforeNavigation } from "../../../lib/navigation/use-unsaved-changes-protection";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useSession } from "../../../lib/session/session-provider";

const SECTIONS = [
  { key: "identity", pages: [{ href: "/settings/branding", key: "identity" }] },
  {
    key: "documents",
    pages: [
      { href: "/settings/document-templates", key: "templates" },
      { href: "/settings/report-header", key: "letterhead" },
    ],
  },
  {
    key: "security",
    pages: [
      { href: "/settings/session", key: "sessions" },
      { href: "/settings/sso", key: "sso" },
    ],
  },
  {
    key: "notifications",
    pages: [
      { href: "/settings/notification-defaults", key: "notificationDefaults" },
      { href: "/settings/whatsapp", key: "whatsapp" },
    ],
  },
  { key: "integrations", pages: [{ href: "/settings/integrations", key: "integrations" }] },
  { key: "workflows", pages: [{ href: "/settings/workflows", key: "workflows" }] },
  { key: "audit", pages: [{ href: "/settings/audit-logs", key: "audit" }] },
] as const;

/** School settings share a section picker; personal settings and access roles keep their own context. */
export function SettingsWorkspace({ children }: { children: ReactNode }): ReactElement {
  const t = useTranslations("app.workspace");
  const pathname = usePathname();
  const router = useRouter();
  const { me } = useSession();
  const canOpen = (href: string) =>
    canOpenPath(href, (p) => me?.permissions.includes(p) ?? false, me?.profile_kind);
  const sections = SECTIONS.map((section) => ({
    ...section,
    pages: section.pages.filter((page) => canOpen(page.href)),
  })).filter((section) => section.pages.length > 0);
  const active = sections.find((section) => section.pages.some((page) => page.href === pathname));
  if (!active) return <>{children}</>;
  return (
    <>
      <div className="flex flex-col gap-2 px-4 pt-4 md:px-6 md:pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            <span>{t("settings")}</span>
            <Select
              aria-label={t("settings")}
              className="w-64 max-w-full"
              value={active.key}
              options={sections.map((section) => ({ value: section.key, label: t(section.key) }))}
              onValueChange={(key) => {
                const href = sections.find((section) => section.key === key)?.pages[0]?.href;
                if (href && confirmUnsavedChangesBeforeNavigation()) router.push(href);
              }}
            />
          </label>
          {canOpen("/setup") && (
            <Button asChild variant="secondary" size="sm">
              <Link href="/setup">{t("setup")}</Link>
            </Button>
          )}
        </div>
        {active.pages.length > 1 && (
          <WorkspaceNav
            label={t(active.key)}
            items={active.pages.map((page) => ({ href: page.href, label: t(page.key) }))}
          />
        )}
      </div>
      {children}
    </>
  );
}

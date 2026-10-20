"use client";

import { Button } from "@newsekolah/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { WorkspaceNav } from "../../../components/workspace-nav";
import { useCan } from "../../../lib/session/session-provider";

type LibraryArea = "catalogue" | "circulation" | "members" | "settings" | "visits" | "stocktake";

interface LibraryLink {
  href: string;
  label: string;
  allowed: boolean;
  external?: boolean;
}

/** Each workspace retains a few task views; setup, reports and kiosks are contextual actions. */
export function LibraryWorkspaceNav({ area }: { area: LibraryArea }): ReactElement {
  const t = useTranslations("app.library.workspace");
  const pathname = usePathname();
  const canView = useCan("view_library");
  const canCatalogue = useCan("manage_library_catalog");
  const canCirculate = useCan("manage_library_circulation");
  const canMembers = useCan("manage_library_members");
  const canSettings = useCan("manage_library_settings");
  const canReport = useCan("view_library_reports");
  const items: LibraryLink[] = [];
  const actions: LibraryLink[] = [];

  // Stocktake belongs to the catalogue workspace and visits to circulation; the
  // pages keep their own area so the report shortcut still matches.
  const workspace = area === "stocktake" ? "catalogue" : area === "visits" ? "circulation" : area;

  if (workspace === "catalogue") {
    items.push(
      { href: "/library/catalogue", label: t("titles"), allowed: canView },
      { href: "/library/copies", label: t("copies"), allowed: canView },
      { href: "/library/import", label: t("importBooks"), allowed: canCatalogue },
      { href: "/library/stocktake", label: t("stocktake"), allowed: canCatalogue },
    );
    actions.push({
      href: "/library/master-data",
      label: t("catalogueSettings"),
      allowed: canView,
    });
  }
  if (workspace === "circulation") {
    items.push(
      { href: "/library/desk", label: t("individual"), allowed: canCirculate },
      { href: "/library/class-loans", label: t("class"), allowed: canCirculate },
      { href: "/library/violations", label: t("sanctions"), allowed: canCirculate },
      { href: "/library/visits", label: t("visits"), allowed: canCirculate },
    );
    actions.push(
      { href: "/library/kiosk", label: t("openKiosk"), allowed: canCirculate, external: true },
      {
        href: "/library/visit-kiosk",
        label: t("openVisitKiosk"),
        allowed: canCirculate,
        external: true,
      },
    );
  }
  if (workspace === "members" || workspace === "circulation") {
    actions.push({ href: "/library/member-types", label: t("loanSettings"), allowed: canSettings });
  }
  if (area === "settings") {
    items.push(
      { href: "/library/member-types", label: t("memberTypes"), allowed: canSettings },
      { href: "/library/loan-rules", label: t("periodRules"), allowed: canSettings },
    );
    actions.push(
      { href: "/library/members", label: t("members"), allowed: canMembers },
      { href: "/library/desk", label: t("circulation"), allowed: canCirculate },
    );
  }
  if (area !== "settings") {
    const reportTab =
      area === "catalogue" || area === "stocktake"
        ? "accessionRegister"
        : area === "members"
          ? "members"
          : area === "visits"
            ? "visits"
            : "loans";
    actions.push({
      href: `/library/reports?tab=${reportTab}`,
      label: t("report"),
      allowed: canReport,
    });
  }

  return (
    <WorkspaceNav
      label={t(workspace)}
      items={items
        .filter((item) => item.allowed)
        .map(({ href, label }) => ({
          href,
          label,
          active: pathname === href || pathname.startsWith(`${href}/`),
        }))}
      actions={actions
        .filter((item) => item.allowed && item.href !== pathname)
        .map((item) => (
          <Button key={item.href} asChild size="sm" variant="secondary">
            <Link
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer" : undefined}
            >
              {item.label}
            </Link>
          </Button>
        ))}
    />
  );
}

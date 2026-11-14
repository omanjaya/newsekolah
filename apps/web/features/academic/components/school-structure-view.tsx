"use client";

import { NavTabs, type NavTabsLinkProps } from "@newsekolah/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { AppPage } from "../../../components/app-page";

import { GradeLevelsView } from "./grade-levels-view";
import { RoomsView } from "./rooms-view";
import { TracksView } from "./tracks-view";

const sections = [
  { value: "grade-levels", label: "gradeLevels", View: GradeLevelsView },
  { value: "tracks", label: "tracks", View: TracksView },
  { value: "rooms", label: "rooms", View: RoomsView },
] as const;

function renderLink({ href, className, children, ...rest }: NavTabsLinkProps): ReactNode {
  return (
    <Link href={href} className={className} aria-current={rest["aria-current"]} scroll={false}>
      {children}
    </Link>
  );
}

/**
 * Struktur sekolah: grade levels, tracks and rooms, one reference table
 * per tab. The tab is in the URL (`?tab=`), so old links land on the
 * right one; each table carries its own search and add button.
 */
export function SchoolStructureView(): ReactElement {
  const t = useTranslations("app.academic.structure");
  const requested = useSearchParams().get("tab");
  const active = sections.find((section) => section.value === requested) ?? sections[0];
  const ActiveView = active.View;

  return (
    <AppPage
      description={t("description")}
      nav={
        <NavTabs
          aria-label={t("title")}
          variant="underline"
          items={sections.map(({ value, label }) => ({
            href: `/school/structure?tab=${value}`,
            label: t(label),
            current: value === active.value,
          }))}
          renderLink={renderLink}
        />
      }
    >
      <ActiveView />
    </AppPage>
  );
}

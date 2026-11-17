"use client";

import { NavTabs, type NavTabsLinkProps } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

function renderLink({ href, className, children, ...rest }: NavTabsLinkProps): ReactNode {
  return (
    <Link href={href} className={className} aria-current={rest["aria-current"]}>
      {children}
    </Link>
  );
}

/**
 * The two pages of one supervision cycle as tabs under its title: the
 * observations (instrument, schedule, filling in) and the results.
 */
export function CycleNav({
  cycleId,
  current,
}: {
  cycleId: string;
  current: "observations" | "report";
}): ReactElement {
  const t = useTranslations("app.supervision.cycleNav");
  const base = `/supervision/cycles/${encodeURIComponent(cycleId)}`;
  return (
    <NavTabs
      aria-label={t("label")}
      variant="underline"
      items={[
        { href: base, label: t("observations"), current: current === "observations" },
        { href: `${base}/report`, label: t("report"), current: current === "report" },
      ]}
      renderLink={renderLink}
    />
  );
}

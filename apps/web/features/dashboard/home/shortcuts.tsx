import type { CategoryTone } from "@newsekolah/ui";
import { MonitorPlay, Rocket } from "lucide-react";
import type { ReactNode } from "react";

import { isHeroLink, type Me, type ShownHero } from "./types";

/** At most this many shortcuts in the side column. */
const MAX_SHORTCUTS = 5;

/** One link of the home's shortcuts card. */
export interface Shortcut {
  key: string;
  href: string;
  label: string;
  icon: ReactNode;
  tone: CategoryTone;
}

/**
 * The side column's shortcuts: the reader's quick actions (the same list,
 * in the same order, as the phone's quick-action button and the command
 * palette), plus the monitor and the setup checklist for whoever may open
 * them. A shortcut that repeats the hero's action or the check-in card
 * right beside it is left out.
 */
export function buildShortcuts({
  me,
  hero,
  canOpen,
  hasCheckInCard,
  quick,
  extra,
}: {
  me: Me;
  hero: ShownHero;
  canOpen: (href: string) => boolean;
  hasCheckInCard: boolean;
  quick: Shortcut[];
  extra: { monitor: string; setup: string };
}): Shortcut[] {
  const path = (href: string) => href.split("?")[0] ?? href;
  const heroPaths = new Set(
    [hero.action, hero.secondaryAction].flatMap((link) =>
      link && isHeroLink(link) ? [path(link.href)] : [],
    ),
  );
  const can = (permission: string) => me.permissions.includes(permission);
  const links: Shortcut[] = [
    ...quick.filter((shortcut) => !(hasCheckInCard && shortcut.key === "check-in")),
    ...(can("view_monitor_presence")
      ? [
          {
            key: "monitor",
            href: "/monitor",
            label: extra.monitor,
            icon: <MonitorPlay />,
            tone: "blue" as const,
          },
        ]
      : []),
    ...(can("manage_settings")
      ? [
          {
            key: "setup",
            href: "/setup",
            label: extra.setup,
            icon: <Rocket />,
            tone: "green" as const,
          },
        ]
      : []),
  ];
  return links
    .filter((link) => canOpen(path(link.href)) && !heroPaths.has(path(link.href)))
    .slice(0, MAX_SHORTCUTS);
}

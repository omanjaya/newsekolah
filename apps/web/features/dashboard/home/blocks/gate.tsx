"use client";

import { useTranslations } from "next-intl";

import { isModuleEnabled } from "../../../../lib/modules/feature-modules";
import { quickActionHref, quickActions } from "../../../../lib/quick-actions";
import { EMPTY_BLOCK, HERO_PRIORITY, type Me, type PersonaBlock } from "../types";

const SCAN_HREF = "/scan";
const ADD_VISITOR = quickActions.find((action) => action.id === "add-visitor");

/**
 * Gate duty (the security duty): the gate scanner is the job of every
 * shift, so the hero always opens on it, with the visitor book beside it
 * when the school runs the visitors module. The gate has no queue of its
 * own to count, so the block adds no tiles.
 */
export function useGateBlock(me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardDuty.gate");
  if (!active) return EMPTY_BLOCK;
  const permitsOn = isModuleEnabled(me, "permits");
  const visitorsOn = isModuleEnabled(me, "visitors");
  const visitorLink =
    visitorsOn && ADD_VISITOR
      ? { label: t("visitorAction"), href: quickActionHref(ADD_VISITOR) }
      : undefined;
  return {
    hero: {
      key: "gate.scan",
      priority: HERO_PRIORITY.gateIdle,
      eyebrow: t("eyebrow"),
      title: permitsOn ? t("title") : t("titleVisitors"),
      meta: permitsOn ? t("meta") : t("metaVisitors"),
      action: permitsOn ? { label: t("scanAction"), href: SCAN_HREF } : visitorLink,
      secondaryAction: permitsOn ? visitorLink : undefined,
    },
    tiles: [],
    main: [],
    side: [],
  };
}

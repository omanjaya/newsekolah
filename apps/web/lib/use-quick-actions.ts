"use client";

import { useMemo } from "react";

import { navAccessFromMe } from "./navigation-access";
import { availableQuickActions, type QuickAction } from "./quick-actions";
import { useSession } from "./session/session-provider";

/** The quick actions the signed-in reader may perform (see `availableQuickActions`). */
export function useQuickActions(): QuickAction[] {
  const { me } = useSession();
  return useMemo(() => availableQuickActions(navAccessFromMe(me)), [me]);
}

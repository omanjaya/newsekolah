import { useCallback, useEffect, useRef, type MouseEvent, type RefObject } from "react";

import { focusAfterReset } from "./data-table-filters.js";

export interface ToolbarFocusHandOff {
  /** The table's root, which holds the toolbar. */
  rootRef: RefObject<HTMLDivElement | null>;
  /**
   * Called by an empty state's reset before it runs: the reset takes the
   * empty state, and its button, away, so focus moves first to the
   * toolbar, which stays (search box from the keyboard, else first pill).
   */
  handOffResetFocus: (event: MouseEvent<HTMLButtonElement>) => void;
  /**
   * Called just before the toolbar is remounted to clear its search box:
   * a box that had focus is a new element afterwards, and focus follows
   * it there instead of dropping to <body>.
   */
  keepSearchFocus: () => void;
}

/** Keeps focus in a DataTable's toolbar when the control that had it goes away. */
export function useToolbarFocusHandOff(toolbarKey: number): ToolbarFocusHandOff {
  const rootRef = useRef<HTMLDivElement>(null);
  const refocusSearch = useRef(false);

  const toolbarControl = useCallback(
    (selector: string) =>
      rootRef.current?.querySelector<HTMLElement>(`[data-slot="data-table-toolbar"] ${selector}`),
    [],
  );

  const handOffResetFocus = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      focusAfterReset(
        event.detail,
        toolbarControl('input[type="search"]'),
        toolbarControl('[data-slot="data-table-filters"]'),
      );
    },
    [toolbarControl],
  );

  const keepSearchFocus = useCallback(() => {
    const active = document.activeElement;
    refocusSearch.current =
      active instanceof HTMLInputElement &&
      active.type === "search" &&
      rootRef.current?.contains(active) === true;
  }, []);

  useEffect(() => {
    if (!refocusSearch.current) return;
    refocusSearch.current = false;
    toolbarControl('input[type="search"]')?.focus();
  }, [toolbarKey, toolbarControl]);

  return { rootRef, handOffResetFocus, keepSearchFocus };
}

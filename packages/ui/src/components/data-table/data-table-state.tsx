import type { PaginationState, SortingState } from "@tanstack/react-table";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface DataTableLocalState {
  pagination: PaginationState;
  sorting: SortingState;
  globalFilter: string;
}

interface DataTableStateContextValue {
  scope: string;
  read: (key: string) => DataTableLocalState | undefined;
  write: (key: string, state: DataTableLocalState) => void;
}

const DataTableStateContext = createContext<DataTableStateContextValue | null>(null);

/**
 * In-memory table state, namespaced by `scope` (who is signed in, which
 * school year, which page). A table reads and writes only its current
 * scope's entries, and starts over from the new scope's state when the
 * scope changes (see DataTable).
 *
 * The scope is data, never a React key: keying the children on it would
 * unmount and remount everything under the provider, the whole app shell
 * included, each time it changes, and the page is part of the scope
 * (docs/16-audit-performa-web.md item 2).
 */
export function DataTableStateProvider({
  scope,
  children,
}: {
  scope: string;
  children: ReactNode;
}) {
  const [states] = useState(() => new Map<string, DataTableLocalState>());
  const value = useMemo<DataTableStateContextValue>(
    () => ({
      scope,
      read: (key) => states.get(`${scope}:${key}`),
      write: (key, state) => {
        states.set(`${scope}:${key}`, state);
      },
    }),
    [scope, states],
  );

  return <DataTableStateContext.Provider value={value}>{children}</DataTableStateContext.Provider>;
}

export function useDataTableState(stateKey: string | undefined) {
  const context = useContext(DataTableStateContext);
  return {
    /** Changes when the provider's scope does; a table resets its local state then. */
    scope: context?.scope,
    initialState: stateKey ? context?.read(stateKey) : undefined,
    remember: (state: DataTableLocalState) => {
      if (stateKey) context?.write(stateKey, state);
    },
  };
}

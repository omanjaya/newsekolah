import type { PaginationState, SortingState } from "@tanstack/react-table";
import { Fragment, createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface DataTableLocalState {
  pagination: PaginationState;
  sorting: SortingState;
  globalFilter: string;
}

interface DataTableStateContextValue {
  read: (key: string) => DataTableLocalState | undefined;
  write: (key: string, state: DataTableLocalState) => void;
}

const DataTableStateContext = createContext<DataTableStateContextValue | null>(null);

/** In-memory table state, cleared whenever the authenticated scope changes. */
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
      read: (key) => states.get(`${scope}:${key}`),
      write: (key, state) => {
        states.set(`${scope}:${key}`, state);
      },
    }),
    [scope, states],
  );

  return (
    <DataTableStateContext.Provider value={value}>
      <Fragment key={scope}>{children}</Fragment>
    </DataTableStateContext.Provider>
  );
}

export function useDataTableState(stateKey: string | undefined) {
  const context = useContext(DataTableStateContext);
  return {
    initialState: stateKey ? context?.read(stateKey) : undefined,
    remember: (state: DataTableLocalState) => {
      if (stateKey) context?.write(stateKey, state);
    },
  };
}

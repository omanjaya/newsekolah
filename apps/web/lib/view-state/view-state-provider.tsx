"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Dispatch, ReactElement, ReactNode, SetStateAction } from "react";

const MAX_ROUTE_KEYS = 100;

type Listener = () => void;

export class ViewStateStore {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly values = new Map<string, unknown>();

  read(key: string, fallback: unknown): unknown {
    const value = this.values.get(key);
    if (value === undefined) return fallback;
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }

  write(key: string, value: unknown): void {
    this.values.delete(key);
    this.values.set(key, value);
    while (this.values.size > MAX_ROUTE_KEYS) {
      const oldest = this.values.keys().next();
      if (oldest.done) break;
      this.values.delete(oldest.value);
    }
    this.listeners.get(key)?.forEach((listener) => {
      listener();
    });
  }

  subscribe(key: string, listener: Listener): () => void {
    const listeners = this.listeners.get(key) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(key);
    };
  }

  get size(): number {
    return this.values.size;
  }

  /**
   * Drops every remembered value and notifies current subscribers, so
   * mounted `useRememberedViewState` callers fall back to their initial
   * value on their next read. Used to isolate the store per identity
   * (tenant/user/school year) without remounting the component tree that
   * reads it (docs/16-audit-performa-web.md item 2).
   */
  reset(): void {
    this.values.clear();
    for (const listeners of this.listeners.values()) {
      for (const listener of listeners) listener();
    }
  }
}

const ViewStateContext = createContext<ViewStateStore | null>(null);

/**
 * In-memory, account-scoped view preferences. It never writes filters or
 * roster data to browser storage.
 *
 * `identity` (tenant/user/school year, joined by the caller) scopes the
 * store without remounting `children`: passing a new value clears the
 * store's contents in place instead of the caller keying this component to
 * force a fresh instance, which used to unmount and remount the entire app
 * tree underneath it on every boot-time identity resolution
 * (docs/16-audit-performa-web.md item 2). Omit it to keep a single store
 * for the provider's whole lifetime (e.g. in tests).
 */
export function ViewStateProvider({
  children,
  identity,
}: {
  children: ReactNode;
  identity?: string;
}): ReactElement {
  const store = useMemo(() => new ViewStateStore(), []);
  const identityRef = useRef(identity);

  useLayoutEffect(() => {
    if (identityRef.current === identity) return;
    identityRef.current = identity;
    store.reset();
  }, [identity, store]);

  return <ViewStateContext.Provider value={store}>{children}</ViewStateContext.Provider>;
}

/** Remembers a read-only view filter while returning to the same route and identity context. */
export function useRememberedViewState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const store = useContext(ViewStateContext);
  const pathname = usePathname();
  if (!store) throw new Error("useRememberedViewState must be used within ViewStateProvider");
  const [fallback] = useState(() => initial);
  const routeKey = `${pathname}:${key}`;
  const value = useSyncExternalStore(
    (listener) => store.subscribe(routeKey, listener),
    () => store.read(routeKey, fallback) as T,
    () => fallback,
  );
  const setValue: Dispatch<SetStateAction<T>> = (next) => {
    const current = store.read(routeKey, fallback) as T;
    store.write(
      routeKey,
      typeof next === "function" ? (next as (previous: T) => T)(current) : next,
    );
  };
  return [value, setValue];
}

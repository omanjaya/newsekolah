"use client";

import type { ReactElement } from "react";

import { useLibraryTitleQuery } from "../api";

/** Resolves a title id to its name for a list row; a loan only carries the id. */
export function LibraryTitleName({ titleId }: { titleId: string }): ReactElement {
  const { data, isLoading } = useLibraryTitleQuery(titleId);
  if (isLoading) return <span className="text-fg-muted">...</span>;
  return <>{data?.title ?? titleId}</>;
}

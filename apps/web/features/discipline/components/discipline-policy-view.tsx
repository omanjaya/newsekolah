"use client";

import { Skeleton } from "@newsekolah/ui";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useDisciplinePolicyQuery } from "../api";

import { DisciplinePolicyEditor } from "./discipline-policy-editor";

/**
 * Loads the policy first so `DisciplinePolicyEditor` can seed its editable
 * draft straight from `useState`'s initializer instead of an effect that
 * would call `setLevels` after the fetch resolves.
 */
export function DisciplinePolicyView(): ReactElement {
  const policy = useDisciplinePolicyQuery();

  if (policy.isError && !policy.data)
    return <QueryError retry={() => policy.refetch()} className="m-4" />;

  if (policy.isLoading || !policy.data) {
    return <Skeleton className="h-40 w-full" aria-busy="true" />;
  }

  return <DisciplinePolicyEditor initialLevels={policy.data.levels} />;
}

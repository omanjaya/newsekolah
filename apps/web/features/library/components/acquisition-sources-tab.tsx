"use client";

import type { ReactElement } from "react";

import {
  useCreateLibraryAcquisitionSourceMutation,
  useDeleteLibraryAcquisitionSourceMutation,
  useLibraryAcquisitionSourcesQuery,
  useUpdateLibraryAcquisitionSourceMutation,
} from "../master-data-api";

import { MasterEntryTab } from "./master-entry-tab";

/** Acquisition sources (purchase, donation, ...) used on copies to say where a book came from. */
export function AcquisitionSourcesTab(): ReactElement {
  const { data, isLoading, error, refetch } = useLibraryAcquisitionSourcesQuery();
  return (
    <MasterEntryTab
      namespace="app.library.masterData.acquisitionSources"
      stateKey="features/library/components/acquisition-sources-tab:1"
      items={data?.data ?? []}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      create={useCreateLibraryAcquisitionSourceMutation()}
      update={useUpdateLibraryAcquisitionSourceMutation()}
      remove={useDeleteLibraryAcquisitionSourceMutation()}
    />
  );
}

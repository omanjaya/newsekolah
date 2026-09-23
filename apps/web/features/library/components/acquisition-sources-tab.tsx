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
  const { data, isLoading } = useLibraryAcquisitionSourcesQuery();
  return (
    <MasterEntryTab
      namespace="app.library.masterData.acquisitionSources"
      stateKey="features/library/components/acquisition-sources-tab:1"
      items={data?.data ?? []}
      isLoading={isLoading}
      create={useCreateLibraryAcquisitionSourceMutation()}
      update={useUpdateLibraryAcquisitionSourceMutation()}
      remove={useDeleteLibraryAcquisitionSourceMutation()}
    />
  );
}

"use client";

import type { ReactElement } from "react";

import {
  useCreateLibraryLocationMutation,
  useDeleteLibraryLocationMutation,
  useLibraryLocationsQuery,
  useUpdateLibraryLocationMutation,
} from "../copies-api";

import { MasterEntryTab } from "./master-entry-tab";

/** Shelf/room locations used on copies to say where a book physically sits. */
export function LocationsTab(): ReactElement {
  const { data, isLoading } = useLibraryLocationsQuery();
  return (
    <MasterEntryTab
      namespace="app.library.masterData.locations"
      stateKey="features/library/components/locations-tab:1"
      items={data?.data ?? []}
      isLoading={isLoading}
      create={useCreateLibraryLocationMutation()}
      update={useUpdateLibraryLocationMutation()}
      remove={useDeleteLibraryLocationMutation()}
    />
  );
}

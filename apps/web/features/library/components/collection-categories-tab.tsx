"use client";

import type { ReactElement } from "react";

import {
  useCollectionCategoriesQuery,
  useCreateCollectionCategoryMutation,
  useDeleteCollectionCategoryMutation,
  useUpdateCollectionCategoryMutation,
} from "../copies-api";

import { MasterEntryTab } from "./master-entry-tab";

/** Collection categories (fiction, reference, ...) used on copies to group the catalogue. */
export function CollectionCategoriesTab(): ReactElement {
  const { data, isLoading } = useCollectionCategoriesQuery();
  return (
    <MasterEntryTab
      namespace="app.library.masterData.collectionCategories"
      stateKey="features/library/components/collection-categories-tab:1"
      items={data?.data ?? []}
      isLoading={isLoading}
      create={useCreateCollectionCategoryMutation()}
      update={useUpdateCollectionCategoryMutation()}
      remove={useDeleteCollectionCategoryMutation()}
    />
  );
}

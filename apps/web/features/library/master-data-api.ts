"use client";

import type { components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type LibraryMaterialType = components["schemas"]["LibraryMaterialType"];
export type LibraryMaterialTypeWrite = components["schemas"]["LibraryMaterialTypeWrite"];
export type LibraryMasterEntry = components["schemas"]["LibraryMasterEntry"];
export type LibraryMasterEntryWrite = components["schemas"]["LibraryMasterEntryWrite"];
export type LibraryPartner = components["schemas"]["LibraryPartner"];
export type LibraryPartnerWrite = components["schemas"]["LibraryPartnerWrite"];
export type LibraryDDCClass = components["schemas"]["LibraryDDCClass"];
export type LibraryCatalogueOptions = components["schemas"]["LibraryCatalogueOptions"];

const REFERENCE_STALE_MS = 5 * 60 * 1000;

function useInvalidate(key: string) {
  const queryClient = useQueryClient();
  // The copy forms read every master list through the combined options query.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library", key] }),
      queryClient.invalidateQueries({ queryKey: ["library", "catalogue-options"] }),
    ]);
}

// Material types.

export function useLibraryMaterialTypesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "material-types"],
    queryFn: () => client.GET("/v1/library/material-types"),
  });
}

export function useCreateLibraryMaterialTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("material-types");
  return useMutation({
    mutationFn: (body: LibraryMaterialTypeWrite) =>
      client.POST("/v1/library/material-types", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateLibraryMaterialTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("material-types");
  return useMutation({
    mutationFn: ({ id, ...body }: LibraryMaterialTypeWrite & { id: string }) =>
      client.PUT("/v1/library/material-types/{id}", { params: { path: { id } }, body }),
    onSuccess: invalidate,
  });
}

export function useDeleteLibraryMaterialTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("material-types");
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/library/material-types/{id}", { params: { path: { id } } }),
    onSuccess: invalidate,
  });
}

// Acquisition sources.

export function useLibraryAcquisitionSourcesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "acquisition-sources"],
    queryFn: () => client.GET("/v1/library/acquisition-sources"),
  });
}

export function useCreateLibraryAcquisitionSourceMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("acquisition-sources");
  return useMutation({
    mutationFn: (body: LibraryMasterEntryWrite) =>
      client.POST("/v1/library/acquisition-sources", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateLibraryAcquisitionSourceMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("acquisition-sources");
  return useMutation({
    mutationFn: ({ id, ...body }: LibraryMasterEntryWrite & { id: string }) =>
      client.PUT("/v1/library/acquisition-sources/{id}", { params: { path: { id } }, body }),
    onSuccess: invalidate,
  });
}

export function useDeleteLibraryAcquisitionSourceMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("acquisition-sources");
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/library/acquisition-sources/{id}", { params: { path: { id } } }),
    onSuccess: invalidate,
  });
}

// Partners.

export function useLibraryPartnersQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "partners"],
    queryFn: () => client.GET("/v1/library/partners"),
  });
}

export function useCreateLibraryPartnerMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("partners");
  return useMutation({
    mutationFn: (body: LibraryPartnerWrite) => client.POST("/v1/library/partners", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateLibraryPartnerMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("partners");
  return useMutation({
    mutationFn: ({ id, ...body }: LibraryPartnerWrite & { id: string }) =>
      client.PUT("/v1/library/partners/{id}", { params: { path: { id } }, body }),
    onSuccess: invalidate,
  });
}

export function useDeleteLibraryPartnerMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("partners");
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/library/partners/{id}", { params: { path: { id } } }),
    onSuccess: invalidate,
  });
}

// DDC classes (read-only) and the combined options for catalogue/copy forms.

export function useLibraryDdcClassesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "ddc-classes"],
    queryFn: () => client.GET("/v1/library/ddc-classes"),
    staleTime: REFERENCE_STALE_MS,
  });
}

export function useLibraryCatalogueOptionsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "catalogue-options"],
    queryFn: () => client.GET("/v1/library/catalogue/options"),
    staleTime: REFERENCE_STALE_MS,
  });
}

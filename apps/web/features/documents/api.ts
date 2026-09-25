"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type DocumentTemplate = components["schemas"]["DocumentTemplate"];
export type DocumentTemplateWrite = components["schemas"]["DocumentTemplateWrite"];
export type DocumentTemplateKind = DocumentTemplateWrite["kind"];

export const DOCUMENT_TEMPLATE_KINDS: DocumentTemplateKind[] = [
  "leave_letter",
  "warning_letter",
  "class_journal",
  "member_card",
  "item_label",
  "clearance_letter",
  "report",
];

function useInvalidateDocumentTemplates() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.documentTemplates() });
}

export function useDocumentTemplatesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.documentTemplates(),
    queryFn: () => client.GET("/v1/documents/templates"),
  });
}

export function useCreateDocumentTemplateMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateDocumentTemplates();
  return useMutation({
    mutationFn: (body: DocumentTemplateWrite) => client.POST("/v1/documents/templates", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateDocumentTemplateMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateDocumentTemplates();
  return useMutation({
    mutationFn: ({
      templateId,
      ...body
    }: {
      templateId: string;
      name: string;
      body: string;
      variables?: string[];
    }) =>
      client.PUT("/v1/documents/templates/{templateId}", {
        params: { path: { templateId } },
        body,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useSetDefaultDocumentTemplateMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateDocumentTemplates();
  return useMutation({
    mutationFn: (templateId: string) =>
      client.POST("/v1/documents/templates/{templateId}/set-default", {
        params: { path: { templateId } },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Placeholder names referenced in a template body, in first-seen order. */
export function extractPlaceholders(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(PLACEHOLDER_PATTERN)) {
    found.add(match[1] ?? "");
  }
  return [...found];
}

/**
 * The only kind actually wired to a real rendering context today
 * (apps/api/internal/modules/permits/service/leaverequest.go); every other
 * kind is reserved for a module not built yet, so its templates only get
 * whatever placeholders the author defines. Kept here rather than fetched
 * from the API because the API has no such endpoint -- it is documentation
 * for the editor, not tenant-configurable data.
 */
export const KNOWN_TEMPLATE_PLACEHOLDERS: Partial<Record<DocumentTemplateKind, string[]>> = {
  leave_letter: [
    "letter_number",
    "student_name",
    "class_name",
    "guardian_name",
    "category",
    "reason",
    "starts_on",
    "ends_on",
    "days",
    "issued_at",
    "verification_code",
  ],
};

/** Renders the body with each placeholder replaced by a bracketed sample value, for preview only. */
export function renderPreviewHtml(body: string, placeholders: string[]): string {
  let out = body;
  for (const name of placeholders) {
    out = out.replaceAll(`{{${name}}}`, `[${name}]`);
  }
  return out;
}

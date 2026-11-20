"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";
import type { FeatureModule } from "../../lib/modules/feature-modules";

export type DocumentTemplate = components["schemas"]["DocumentTemplate"];
export type DocumentTemplateWrite = components["schemas"]["DocumentTemplateWrite"];
export type DocumentTemplateKind = DocumentTemplateWrite["kind"];

export const DOCUMENT_TEMPLATE_KINDS: DocumentTemplateKind[] = [
  "leave_letter",
  "warning_letter",
  "visitor_badge",
  "class_journal",
  "member_card",
  "item_label",
  "clearance_letter",
  "report",
];

/**
 * The feature module whose documents use each kind, mirroring
 * `TemplateKind.OwnerModule` on the API, which leaves a kind whose module is
 * switched off out of the list and refuses it with 403 MODULE_DISABLED.
 * `undefined` marks a kind owned by an always-on module.
 */
export const TEMPLATE_KIND_MODULE: Record<DocumentTemplateKind, FeatureModule | undefined> = {
  leave_letter: "permits",
  warning_letter: "discipline",
  visitor_badge: "visitors",
  class_journal: undefined,
  member_card: "library",
  item_label: "library",
  clearance_letter: "library",
  report: "reports",
};

/** The kinds a new template may take: those whose owner module is on. */
export function availableTemplateKinds(
  isEnabled: (module: FeatureModule) => boolean,
): DocumentTemplateKind[] {
  return DOCUMENT_TEMPLATE_KINDS.filter((kind) => {
    const module = TEMPLATE_KIND_MODULE[kind];
    return !module || isEnabled(module);
  });
}

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

/**
 * The values the API fills into a school's template when it issues a
 * document of each kind, written `{{.name}}` (see ./template-syntax.ts).
 * Only these kinds are printed from a school's template today: a leave
 * letter (apps/api/internal/modules/permits/service/leaverequest.go,
 * `leaveLetterTemplateVariables`), a warning letter
 * (apps/api/internal/modules/discipline/service/letters.go) and a visitor
 * badge (apps/api/internal/modules/visitors/service/visits.go), the last
 * two through the shared pipeline, which adds the number, the issue date
 * and the verification code (permits/service/issue_document.go). Kept
 * here rather than fetched because the API has no such endpoint; keep the
 * names in step with those files.
 */
export const KNOWN_TEMPLATE_PLACEHOLDERS: Partial<Record<DocumentTemplateKind, readonly string[]>> =
  {
    leave_letter: [
      "letter_number",
      "student_name",
      "nis",
      "class_name",
      "address",
      "guardian_name",
      "category",
      "category_code",
      "reason",
      "reason_detail",
      "starts_on",
      "ends_on",
      "days",
      "issued_at",
      "issuer_name",
      "homeroom_name",
      "verification_code",
    ],
    warning_letter: [
      "letter_number",
      "student_name",
      "nis",
      "class_name",
      "guardian_name",
      "level",
      "level_label",
      "total_points",
      "threshold_points",
      "opening_text",
      "closing_text",
      "issued_at",
      "issuer_name",
      "verification_code",
    ],
    visitor_badge: [
      "visitor_name",
      "organization",
      "purpose",
      "arrived_at",
      "letter_number",
      "issued_at",
      "verification_code",
    ],
  };

/**
 * The lists the API passes for each kind, walked with
 * `{{range .list}}...{{end}}`, with the fields of one item.
 */
export const KNOWN_TEMPLATE_LISTS: Partial<
  Record<DocumentTemplateKind, Readonly<Record<string, readonly string[]>>>
> = {
  warning_letter: { violations: ["date", "name", "points"] },
};

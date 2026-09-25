"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type WorkflowKind = components["schemas"]["WorkflowKind"];
export type WorkflowStage = components["schemas"]["WorkflowStage"];
export type WorkflowDefinition = components["schemas"]["WorkflowDefinition"];

export const WORKFLOW_KINDS: WorkflowKind[] = ["exit_permit", "late_arrival", "leave_request"];

/**
 * The fixed approver rules the backend recognizes outright
 * (apps/api/internal/modules/permits/service/workflow.go validApproverRule);
 * a "duty:<slug>" rule is entered as free text against a known duty slug.
 */
export const FIXED_APPROVER_RULES = [
  "any_teacher",
  "teacher_of_class_now",
  "homeroom_of_student",
] as const;

export const VERIFICATION_MODES: WorkflowStage["verification"][] = ["qr_scan", "manual", "auto"];

export function useWorkflowDefinitionsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.workflowDefinitions(),
    queryFn: () => client.GET("/v1/workflows/definitions"),
  });
}

export function useReplaceWorkflowDefinitionMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      stages,
      config,
    }: {
      kind: WorkflowKind;
      stages: WorkflowStage[];
      config?: Record<string, unknown>;
    }) =>
      client.PUT("/v1/workflows/definitions/{kind}", {
        params: { path: { kind } },
        body: { stages, config },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflowDefinitions() });
    },
  });
}

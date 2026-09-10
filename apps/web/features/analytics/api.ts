"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type RiskLevel = components["schemas"]["RiskLevel"];
export type StudentRisk = components["schemas"]["StudentRisk"];
export type StudentRiskDetail = components["schemas"]["StudentRiskDetail"];
export type RiskReason = components["schemas"]["RiskReason"];
export type EarlyWarningPolicy = components["schemas"]["EarlyWarningPolicy"];
export type EarlyWarningPolicyWrite = components["schemas"]["EarlyWarningPolicyWrite"];

/**
 * Query keys local to this feature (not added to the shared
 * `packages/api-client` registry, matching discipline's own convention)
 * all under `["analytics", ...]` so a single prefix invalidates everything.
 */
const keys = {
  atRiskStudents: () => ["analytics", "at-risk-students"] as const,
  studentRisk: (studentId: string) => ["analytics", "at-risk-students", studentId] as const,
  policy: () => ["analytics", "policy"] as const,
};

export function useAtRiskStudentsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.atRiskStudents(),
    queryFn: () => client.GET("/v1/analytics/at-risk-students"),
  });
}

export function useStudentRiskQuery(studentId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.studentRisk(studentId),
    queryFn: () =>
      client.GET("/v1/analytics/at-risk-students/{studentId}", {
        params: { path: { studentId } },
      }),
    enabled: enabled && studentId !== "",
  });
}

export function useEarlyWarningPolicyQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.policy(),
    queryFn: () => client.GET("/v1/analytics/policy"),
  });
}

export function useUpdateEarlyWarningPolicyMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EarlyWarningPolicyWrite) => client.PUT("/v1/analytics/policy", { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analytics"] }),
  });
}

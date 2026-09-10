"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type LinkedChild = components["schemas"]["LinkedChild"];
export type ParentRelation = components["schemas"]["ParentRelation"];
export type Guardian = components["schemas"]["Guardian"];

/**
 * Guardian links (a parent account linked to a student account), split out
 * of school/api.ts to keep that file under the 400-line limit
 * (docs/04-clean-code.md).
 */

export function useUserChildrenQuery(userId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["users", userId, "children"],
    queryFn: () => client.GET("/v1/users/{userId}/children", { params: { path: { userId } } }),
    enabled: enabled && userId !== "",
  });
}

export function useLinkChildMutation(userId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      student_user_id: string;
      relation: ParentRelation;
      can_approve_leave?: boolean;
    }) => client.POST("/v1/users/{userId}/children", { params: { path: { userId } }, body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users", userId, "children"] });
    },
  });
}

export function useUnlinkChildMutation(userId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) =>
      client.DELETE("/v1/users/{userId}/children/{studentId}", {
        params: { path: { userId, studentId } },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users", userId, "children"] });
    },
  });
}

export function useStudentGuardiansQuery(studentId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["students", studentId, "guardians"],
    queryFn: () =>
      client.GET("/v1/students/{studentId}/guardians", { params: { path: { studentId } } }),
    enabled: enabled && studentId !== "",
  });
}

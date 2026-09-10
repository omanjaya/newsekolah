"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type FeeType = components["schemas"]["FeeType"];
export type FeeTypeWrite = components["schemas"]["FeeTypeWrite"];
export type Recurrence = components["schemas"]["Recurrence"];
export type DiscountKind = components["schemas"]["DiscountKind"];
export type Discount = components["schemas"]["Discount"];
export type DiscountWrite = components["schemas"]["DiscountWrite"];
export type BillCandidate = components["schemas"]["BillCandidate"];
export type GenerationSummary = components["schemas"]["GenerationSummary"];
export type BillStatus = components["schemas"]["BillStatus"];
export type Bill = components["schemas"]["Bill"];
export type PaymentMethod = components["schemas"]["PaymentMethod"];
export type PaymentWrite = components["schemas"]["PaymentWrite"];
export type Payment = components["schemas"]["Payment"];
export type StudentBillHistoryEntry = components["schemas"]["StudentBillHistoryEntry"];
export type StudentBillHistory = components["schemas"]["StudentBillHistory"];
export type ArrearsStudentLine = components["schemas"]["ArrearsStudentLine"];
export type ArrearsClassLine = components["schemas"]["ArrearsClassLine"];
export type ArrearsReport = components["schemas"]["ArrearsReport"];

/**
 * Query keys local to this feature (not added to the shared
 * `packages/api-client` registry per the task's scope), all under
 * `["billing", ...]` so a single prefix invalidates everything below.
 */
const keys = {
  feeTypes: (includeInactive: boolean) => ["billing", "fee-types", includeInactive] as const,
  feeTypeDiscounts: (feeTypeId: string) =>
    ["billing", "fee-types", feeTypeId, "discounts"] as const,
  studentDiscounts: (studentId: string) => ["billing", "students", studentId, "discounts"] as const,
  bills: (filters: BillFilters) => ["billing", "bills", filters] as const,
  studentHistory: (studentId: string) => ["billing", "students", studentId, "history"] as const,
  arrears: () => ["billing", "arrears"] as const,
};

function useInvalidateBilling() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["billing"] });
}

// Fee types.

export function useFeeTypesQuery(includeInactive = false) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.feeTypes(includeInactive),
    queryFn: () =>
      client.GET("/v1/billing/fee-types", {
        params: { query: { include_inactive: includeInactive } },
      }),
  });
}

export function useCreateFeeTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (body: FeeTypeWrite) => client.POST("/v1/billing/fee-types", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateFeeTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: ({ id, ...body }: FeeTypeWrite & { id: string }) =>
      client.PUT("/v1/billing/fee-types/{feeTypeId}", {
        params: { path: { feeTypeId: id } },
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteFeeTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/billing/fee-types/{feeTypeId}", { params: { path: { feeTypeId: id } } }),
    onSuccess: invalidate,
  });
}

// Discounts.

export function useFeeTypeDiscountsQuery(feeTypeId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.feeTypeDiscounts(feeTypeId),
    queryFn: () =>
      client.GET("/v1/billing/fee-types/{feeTypeId}/discounts", {
        params: { path: { feeTypeId } },
      }),
    enabled: enabled && feeTypeId !== "",
  });
}

export function useStudentDiscountsQuery(studentId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.studentDiscounts(studentId),
    queryFn: () =>
      client.GET("/v1/billing/students/{studentId}/discounts", {
        params: { path: { studentId } },
      }),
    enabled: enabled && studentId !== "",
  });
}

export function useCreateDiscountMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (body: DiscountWrite) => client.POST("/v1/billing/discounts", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateDiscountMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: ({ id, ...body }: DiscountWrite & { id: string }) =>
      client.PUT("/v1/billing/discounts/{discountId}", {
        params: { path: { discountId: id } },
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteDiscountMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/billing/discounts/{discountId}", {
        params: { path: { discountId: id } },
      }),
    onSuccess: invalidate,
  });
}

// Generation.

export function usePreviewGenerationMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (period: string) =>
      client.POST("/v1/billing/generation/preview", { body: { period } }),
  });
}

export function useRunGenerationMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (period: string) => client.POST("/v1/billing/generation/run", { body: { period } }),
    onSuccess: invalidate,
  });
}

// Bills.

export interface BillFilters {
  period: string;
  status: BillStatus | "";
  classId: string;
}

export function useBillsQuery(filters: BillFilters) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.bills(filters),
    queryFn: () =>
      client.GET("/v1/billing/bills", {
        params: {
          query: {
            period: filters.period || undefined,
            status: filters.status || undefined,
            class_id: filters.classId || undefined,
            limit: 200,
          },
        },
      }),
  });
}

export function useStudentBillHistoryQuery(studentId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.studentHistory(studentId),
    queryFn: () =>
      client.GET("/v1/billing/students/{studentId}/bills", { params: { path: { studentId } } }),
    enabled: enabled && studentId !== "",
  });
}

// Payments.

export function useRecordPaymentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (body: PaymentWrite) => client.POST("/v1/billing/payments", { body }),
    onSuccess: invalidate,
  });
}

export function useVoidPaymentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      client.POST("/v1/billing/payments/{paymentId}/void", {
        params: { path: { paymentId: id } },
        body: { reason },
      }),
    onSuccess: invalidate,
  });
}

export function usePaymentReceiptUrlMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (paymentId: string) =>
      client.GET("/v1/billing/payments/{paymentId}/receipt", {
        params: { path: { paymentId } },
      }),
  });
}

// Arrears.

export function useArrearsReportQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.arrears(),
    queryFn: () => client.GET("/v1/billing/arrears"),
    enabled,
  });
}

/** Today as `YYYY-MM-DD`, the default paid-on date on the payment form. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The current billing period as `YYYY-MM`, the default for generation. */
export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

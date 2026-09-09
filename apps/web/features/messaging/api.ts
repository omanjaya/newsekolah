"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type WhatsAppProviderKind = components["schemas"]["WhatsAppProviderKind"];
export type WhatsAppProviderStatus = components["schemas"]["WhatsAppProviderStatus"];
export type WhatsAppProviderInput = components["schemas"]["WhatsAppProviderInput"];
export type WhatsAppTemplate = components["schemas"]["WhatsAppTemplate"];
export type WhatsAppTemplateInput = components["schemas"]["WhatsAppTemplateInput"];
export type WhatsAppDelivery = components["schemas"]["WhatsAppDelivery"];
export type WhatsAppDeliveryStatus = components["schemas"]["WhatsAppDeliveryStatus"];

export function useWhatsAppProviderConfigQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.whatsAppProviderConfig(),
    queryFn: () => client.GET("/v1/whatsapp/provider-config"),
  });
}

export function useSetWhatsAppProviderConfigMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: WhatsAppProviderInput) =>
      client.PUT("/v1/whatsapp/provider-config", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.whatsAppProviderConfig() });
    },
  });
}

export function useWhatsAppTemplatesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.whatsAppTemplates(),
    queryFn: () => client.GET("/v1/whatsapp/templates"),
  });
}

function useInvalidateTemplates() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.whatsAppTemplates() });
}

export function useCreateWhatsAppTemplateMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: (body: WhatsAppTemplateInput) => client.POST("/v1/whatsapp/templates", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateWhatsAppTemplateMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: ({ templateId, body }: { templateId: string; body: WhatsAppTemplateInput }) =>
      client.PUT("/v1/whatsapp/templates/{templateId}", { params: { path: { templateId } }, body }),
    onSuccess: invalidate,
  });
}

export function useDeleteWhatsAppTemplateMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: (templateId: string) =>
      client.DELETE("/v1/whatsapp/templates/{templateId}", { params: { path: { templateId } } }),
    onSuccess: invalidate,
  });
}

export function usePreviewWhatsAppTemplateMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({
      templateId,
      variables,
    }: {
      templateId: string;
      variables: Record<string, string>;
    }) =>
      client.POST("/v1/whatsapp/templates/{templateId}/preview", {
        params: { path: { templateId } },
        body: { variables },
      }),
  });
}

export function useWhatsAppDeliveriesQuery(status: string, cursor: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.whatsAppDeliveries(status, cursor),
    queryFn: () =>
      client.GET("/v1/whatsapp/deliveries", {
        params: {
          query: {
            status: status ? (status as WhatsAppDeliveryStatus) : undefined,
            cursor: cursor || undefined,
            limit: 20,
          },
        },
      }),
  });
}

export function useResendWhatsAppDeliveryMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) =>
      client.POST("/v1/whatsapp/deliveries/{deliveryId}/resend", {
        params: { path: { deliveryId } },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp", "deliveries"] });
    },
  });
}

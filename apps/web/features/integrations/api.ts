"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type APIKey = components["schemas"]["APIKey"];
export type APIKeyCreate = components["schemas"]["APIKeyCreate"];
export type APIKeyCreated = components["schemas"]["APIKeyCreated"];
export type WebhookEndpoint = components["schemas"]["WebhookEndpoint"];
export type WebhookEndpointCreate = components["schemas"]["WebhookEndpointCreate"];
export type WebhookDelivery = components["schemas"]["WebhookDelivery"];

// API keys.

export function useAPIKeysQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.apiKeys(),
    queryFn: () => client.GET("/v1/integrations/api-keys"),
  });
}

export function useCreateAPIKeyMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: APIKeyCreate) => client.POST("/v1/integrations/api-keys", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys() });
    },

    meta: { errorToast: false },
  });
}

export function useRevokeAPIKeyMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiKeyId: string) =>
      client.POST("/v1/integrations/api-keys/{apiKeyId}/revoke", {
        params: { path: { apiKeyId } },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys() });
    },

    meta: { errorToast: false },
  });
}

// Webhook endpoints.

export function useWebhookEndpointsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.webhookEndpoints(),
    queryFn: () => client.GET("/v1/integrations/webhook-endpoints"),
  });
}

export function useWebhookEventTypesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.webhookEventTypes(),
    queryFn: () => client.GET("/v1/integrations/event-types"),
    staleTime: Infinity,
  });
}

function useInvalidateWebhookEndpoints() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.webhookEndpoints() });
  };
}

export function useCreateWebhookEndpointMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateWebhookEndpoints();
  return useMutation({
    mutationFn: (body: WebhookEndpointCreate) =>
      client.POST("/v1/integrations/webhook-endpoints", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateWebhookEndpointMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateWebhookEndpoints();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: WebhookEndpointCreate }) =>
      client.PUT("/v1/integrations/webhook-endpoints/{webhookEndpointId}", {
        params: { path: { webhookEndpointId: id } },
        body,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useDeleteWebhookEndpointMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateWebhookEndpoints();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/integrations/webhook-endpoints/{webhookEndpointId}", {
        params: { path: { webhookEndpointId: id } },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

// Delivery log.

export function useWebhookDeliveriesQuery(endpointId: string, cursor: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.webhookDeliveries(endpointId, cursor),
    queryFn: () =>
      client.GET("/v1/integrations/webhook-deliveries", {
        params: {
          query: {
            ...(endpointId ? { endpoint_id: endpointId } : {}),
            ...(cursor ? { cursor } : {}),
            limit: 20,
          },
        },
      }),
  });
}

export function useRetryWebhookDeliveryMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (webhookDeliveryId: string) =>
      client.POST("/v1/integrations/webhook-deliveries/{webhookDeliveryId}/retry", {
        params: { path: { webhookDeliveryId } },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations", "webhook-deliveries"] });
    },

    meta: { errorToast: false },
  });
}

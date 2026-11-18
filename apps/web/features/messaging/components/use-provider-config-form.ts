"use client";

import { ApiError } from "@newsekolah/api-client";
import { useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  useSetWhatsAppProviderConfigMutation,
  useWhatsAppProviderConfigQuery,
  type WhatsAppProviderKind,
  type WhatsAppProviderStatus,
} from "../api";

export interface ProviderFormState {
  provider: WhatsAppProviderKind;
  phoneNumberId: string;
  /** Write-only: blank keeps the saved token. */
  accessToken: string;
  gatewayUrl: string;
  gatewayHeaderName: string;
  /** Write-only: blank keeps the saved value. */
  gatewayHeaderValue: string;
  isActive: boolean;
}

const EMPTY_FORM: ProviderFormState = {
  provider: "meta",
  phoneNumberId: "",
  accessToken: "",
  gatewayUrl: "",
  gatewayHeaderName: "",
  gatewayHeaderValue: "",
  isActive: false,
};

function savedForm(status: WhatsAppProviderStatus | undefined): ProviderFormState {
  if (!status) return EMPTY_FORM;
  return {
    provider: status.provider,
    phoneNumberId: status.phone_number_id ?? "",
    accessToken: "",
    gatewayUrl: status.gateway_url ?? "",
    gatewayHeaderName: status.gateway_header_name ?? "",
    gatewayHeaderValue: "",
    isActive: status.is_active,
  };
}

export interface ProviderConfigForm {
  query: ReturnType<typeof useWhatsAppProviderConfigQuery>;
  /** The form as shown: the draft, or what is saved while nothing changed. */
  form: ProviderFormState;
  update: (patch: Partial<ProviderFormState>) => void;
  /** The form differs from what is saved. */
  dirty: boolean;
  saving: boolean;
  save: () => Promise<void>;
  discard: () => void;
}

/**
 * The WhatsApp provider's form state, lifted out of the panel so the page
 * can offer the settings pages' one save behaviour (a save bar while there
 * is a change) and keep the draft while another panel is open.
 */
export function useProviderConfigForm(): ProviderConfigForm {
  const t = useTranslations("app.messaging.provider");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const query = useWhatsAppProviderConfigQuery();
  const mutation = useSetWhatsAppProviderConfigMutation();
  const [draft, setDraft] = useState<ProviderFormState | null>(null);

  const saved = savedForm(query.data);
  const form = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  return {
    query,
    form,
    dirty,
    saving: mutation.isPending,
    update: (patch) => {
      setDraft((current) => ({ ...(current ?? saved), ...patch }));
    },
    discard: () => {
      setDraft(null);
    },
    save: async () => {
      try {
        await mutation.mutateAsync({
          provider: form.provider,
          phone_number_id: form.phoneNumberId || undefined,
          access_token: form.accessToken || undefined,
          gateway_url: form.gatewayUrl || undefined,
          gateway_header_name: form.gatewayHeaderName || undefined,
          gateway_header_value: form.gatewayHeaderValue || undefined,
          is_active: form.isActive,
        });
        setDraft(null);
        toast.success(t("saved"));
      } catch (error) {
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        );
      }
    },
  };
}

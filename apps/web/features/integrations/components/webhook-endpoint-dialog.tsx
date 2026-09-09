"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Checkbox, Dialog, DialogContent, Input, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type WebhookEndpoint,
  useCreateWebhookEndpointMutation,
  useUpdateWebhookEndpointMutation,
  useWebhookEventTypesQuery,
} from "../api";

/**
 * One dialog for both registering a new endpoint and editing an existing
 * one: the fields are identical (docs/14-public-api.md never rotates the
 * signing secret on update, only url/description/event_types), so the only
 * difference is which mutation `onSave` runs. The caller mounts this with a
 * `key` tied to the target (see webhook-endpoints-panel.tsx), so state only
 * ever needs to be seeded once, in its initializer, never re-seeded via an
 * effect for a prop that cannot change under a live instance.
 */
export function WebhookEndpointDialog({
  open,
  onOpenChange,
  endpoint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; absent when registering a new endpoint. */
  endpoint?: WebhookEndpoint;
}): ReactElement {
  const t = useTranslations("app.integrations.webhooks.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const eventTypes = useWebhookEventTypesQuery();
  const createEndpoint = useCreateWebhookEndpointMutation();
  const updateEndpoint = useUpdateWebhookEndpointMutation();

  const [url, setUrl] = useState(endpoint?.url ?? "");
  const [description, setDescription] = useState(endpoint?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(endpoint?.event_types ?? []));

  const isEditing = endpoint !== undefined;
  const pending = createEndpoint.isPending || updateEndpoint.isPending;
  const canSubmit = url.trim() !== "" && selected.size > 0 && !pending;

  async function handleSave() {
    const body = { url, description: description || undefined, event_types: Array.from(selected) };
    try {
      if (isEditing) {
        await updateEndpoint.mutateAsync({ id: endpoint.id, body });
        toast.success(t("updated"));
      } else {
        await createEndpoint.mutateAsync(body);
        toast.success(t("created"));
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={isEditing ? t("editTitle") : t("createTitle")}
        description={t("dialogBody")}
        footer={
          <Button
            size="sm"
            disabled={!canSubmit}
            loading={pending}
            onClick={() => void handleSave()}
          >
            {t("submit")}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("urlLabel")}</span>
            <Input
              type="url"
              value={url}
              maxLength={2048}
              placeholder="https://example.com/webhooks/newsekolah"
              onChange={(e) => {
                setUrl(e.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("descriptionLabel")}</span>
            <Textarea
              value={description}
              maxLength={500}
              rows={2}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-fg">{t("eventTypesLabel")}</span>
            <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-sm border border-border p-3">
              {(eventTypes.data?.data ?? []).map((eventType) => (
                <label key={eventType} className="flex items-center gap-2 text-[13px] text-fg">
                  <Checkbox
                    checked={selected.has(eventType)}
                    onCheckedChange={(checked) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked === true) next.add(eventType);
                        else next.delete(eventType);
                        return next;
                      });
                    }}
                  />
                  {eventType}
                </label>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

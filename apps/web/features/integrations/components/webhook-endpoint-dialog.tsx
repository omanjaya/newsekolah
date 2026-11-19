"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogContent,
  Field,
  Input,
  Textarea,
  useToast,
  useSubmitValidation,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { isModuleEnabled } from "../../../lib/modules/feature-modules";
import { useSession } from "../../../lib/session/session-provider";
import {
  type WebhookEndpoint,
  useCreateWebhookEndpointMutation,
  useUpdateWebhookEndpointMutation,
  useWebhookEventTypesQuery,
} from "../api";
import { useWebhookEventLabel } from "../lib/use-webhook-event-label";
import { offeredWebhookEvents } from "../lib/webhook-event-modules";

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
  const eventLabel = useWebhookEventLabel();
  const { me } = useSession();
  const createEndpoint = useCreateWebhookEndpointMutation();
  const updateEndpoint = useUpdateWebhookEndpointMutation();

  const [url, setUrl] = useState(endpoint?.url ?? "");
  const [description, setDescription] = useState(endpoint?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(endpoint?.event_types ?? []));

  const isEditing = endpoint !== undefined;
  const pending = createEndpoint.isPending || updateEndpoint.isPending;
  const { ref: bodyRef, attempted, check } = useSubmitValidation<HTMLDivElement>();
  const tValidation = useTranslations("validation");
  const offered = offeredWebhookEvents(eventTypes.data?.data ?? [], (module) =>
    isModuleEnabled(me, module),
  );

  async function handleSave() {
    if (!check(url.trim() !== "" && selected.size > 0)) return;
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
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button loading={pending} onClick={() => void handleSave()}>
              {t("submit")}
            </Button>
          </>
        }
      >
        <div ref={bodyRef} className="flex flex-col gap-5">
          <Field
            label={t("urlLabel")}
            required
            error={attempted && !url.trim() ? tValidation("required") : undefined}
          >
            <Input
              type="url"
              value={url}
              maxLength={2048}
              placeholder="https://example.com/webhooks/newsekolah"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => {
                setUrl(e.target.value);
              }}
            />
          </Field>
          <Field label={t("descriptionLabel")} optional>
            <Textarea
              value={description}
              maxLength={500}
              rows={2}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
            />
          </Field>
          <Field
            label={t("eventTypesLabel")}
            required
            hint={t("eventTypesHint", { count: selected.size })}
            error={attempted && selected.size === 0 ? t("eventTypesRequired") : undefined}
          >
            {(control) => (
              <Card
                tone="sunken"
                role="group"
                aria-labelledby={control.labelId}
                aria-describedby={control["aria-describedby"]}
                className="max-h-64 overflow-y-auto px-4 py-1"
              >
                {offered.map((eventType) => (
                  <Checkbox
                    key={eventType}
                    // The name a school admin reads, with the code an
                    // integrator matches on beneath it.
                    label={
                      <span className="flex flex-col">
                        <span>{eventLabel(eventType)}</span>
                        <span className="font-mono text-caption text-fg-muted">{eventType}</span>
                      </span>
                    }
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
                ))}
              </Card>
            )}
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

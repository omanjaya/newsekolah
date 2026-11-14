"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  Select,
  SkeletonList,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
  type BadgeTone,
} from "@newsekolah/ui";
import { Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import {
  useResendWhatsAppDeliveryMutation,
  useWhatsAppDeliveriesQuery,
  type WhatsAppDeliveryStatus,
} from "../api";

const STATUS_TONE: Record<WhatsAppDeliveryStatus, BadgeTone> = {
  pending: "neutral",
  sent: "info",
  delivered: "success",
  read: "success",
  failed: "danger",
};

export function DeliveriesView(): ReactElement {
  const t = useTranslations("app.messaging.deliveries");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;

  const [status, setStatus] = useState("");
  const [cursors, setCursors] = useState<string[]>([""]);
  const cursor = cursors[cursors.length - 1] ?? "";

  const query = useWhatsAppDeliveriesQuery(status, cursor);
  const resend = useResendWhatsAppDeliveryMutation();

  async function handleResend(deliveryId: string) {
    try {
      await resend.mutateAsync(deliveryId);
      toast.success(t("resent"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  const deliveries = query.data?.data ?? [];
  const nextCursor = query.data?.page.next_cursor ?? "";

  return (
    <Card>
      <CardHeader
        action={
          <Select
            value={status === "" ? "all" : status}
            onValueChange={(value) => {
              setStatus(value === "all" ? "" : value);
              setCursors([""]);
            }}
            aria-label={t("filterLabel")}
            size="sm"
            options={[
              { value: "all", label: t("filterAll") },
              { value: "pending", label: t("status.pending") },
              { value: "sent", label: t("status.sent") },
              { value: "delivered", label: t("status.delivered") },
              { value: "read", label: t("status.read") },
              { value: "failed", label: t("status.failed") },
            ]}
          />
        }
      >
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>

      {query.isLoading ? (
        <div className="px-5 pb-5">
          <SkeletonList rows={4} leading={false} framed={false} />
        </div>
      ) : query.isError ? (
        <div className="px-5 pb-5">
          <QueryError retry={() => void query.refetch()} error={query.error} />
        </div>
      ) : deliveries.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState variant="compact" icon={<Send />} title={t("empty")} />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.target")}</TableHead>
              <TableHead>{t("columns.provider")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead>{t("columns.attempts")}</TableHead>
              <TableHead>{t("columns.createdAt")}</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">{t("columns.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((delivery) => (
              <TableRow key={delivery.id}>
                <TableCell className="text-fg">{delivery.target}</TableCell>
                <TableCell className="text-fg-muted">{delivery.provider}</TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-0.5">
                    <Badge tone={STATUS_TONE[delivery.status]} size="sm">
                      {t(`status.${delivery.status}`)}
                    </Badge>
                    {delivery.status === "failed" && delivery.error && (
                      <span className="text-caption text-fg-muted" title={delivery.error}>
                        {t("errorLabel")}: {delivery.error}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-fg-muted tabular-nums">{delivery.attempts}</TableCell>
                <TableCell className="text-fg-muted">
                  {formatDateTime(delivery.created_at, { locale, timeZone })}
                </TableCell>
                <TableCell className="text-right">
                  {delivery.status === "failed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleResend(delivery.id)}
                    >
                      {t("resend")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {nextCursor && (
        <CardFooter>
          <Button
            variant="secondary"
            onClick={() => {
              setCursors((c) => [...c, nextCursor]);
            }}
          >
            {t("loadMore")}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

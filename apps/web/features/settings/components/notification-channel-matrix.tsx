"use client";

import {
  Button,
  Field,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type NotificationKind,
} from "../../notifications/api";

export interface ChannelMatrixRow {
  kind: NotificationKind;
  label: string;
  values?: Partial<Record<NotificationChannel, boolean>>;
  loading?: boolean;
  /** The row's values failed to load: it offers a retry instead of switches that read as off. */
  failed?: boolean;
  onRetry?: () => void;
}

export interface NotificationChannelMatrixProps {
  rows: ChannelMatrixRow[];
  /** Column heading of the kinds ("Jenis"). */
  kindLabel: string;
  channelLabel: (channel: NotificationChannel) => string;
  failedLabel: string;
  onToggle: (kind: NotificationKind, channel: NotificationChannel, enabled: boolean) => void;
}

/**
 * Notification kinds against the channels they can go out on. The in-app
 * inbox always receives everything, so it is not a column: the caller says
 * so once in its description. A table from 768px; on a phone each kind is
 * one row with its channels side by side, every target 44px tall.
 */
export function NotificationChannelMatrix({
  rows,
  kindLabel,
  channelLabel,
  failedLabel,
  onToggle,
}: NotificationChannelMatrixProps): ReactElement {
  const common = useTranslations("common");
  const channels = NOTIFICATION_CHANNELS.filter((channel) => channel !== "inapp");

  const control = (row: ChannelMatrixRow, channel: NotificationChannel) =>
    row.loading ? (
      <Skeleton className="h-5 w-9 rounded-full" />
    ) : (
      <Switch
        checked={row.values?.[channel] ?? false}
        aria-label={`${row.label}: ${channelLabel(channel)}`}
        onCheckedChange={(checked) => {
          onToggle(row.kind, channel, checked);
        }}
      />
    );

  const retry = (row: ChannelMatrixRow) => (
    <span className="inline-flex flex-wrap items-center gap-2 text-body-sm text-fg-muted">
      {failedLabel}
      <Button variant="secondary" size="sm" onClick={row.onRetry}>
        {common("actions.retry")}
      </Button>
    </span>
  );

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{kindLabel}</TableHead>
              {channels.map((channel) => (
                <TableHead key={channel} scope="col" className="w-28 text-center">
                  {channelLabel(channel)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.kind}>
                <TableHead scope="row" className="text-body text-fg">
                  {row.label}
                </TableHead>
                {row.failed ? (
                  <TableCell colSpan={channels.length} className="text-center">
                    {retry(row)}
                  </TableCell>
                ) : (
                  channels.map((channel) => (
                    <TableCell key={channel} className="text-center">
                      <span className="inline-flex">{control(row, channel)}</span>
                    </TableCell>
                  ))
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col divide-y divide-line md:hidden">
        {rows.map((row) => (
          <li key={row.kind} className="flex flex-col gap-2 px-4 py-3">
            <span className="text-label text-fg">{row.label}</span>
            {row.failed ? (
              retry(row)
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {channels.map((channel) => (
                  // The channel name is the field's label, so tapping it toggles too.
                  <Field
                    key={channel}
                    label={
                      <span className="text-caption text-fg-muted">{channelLabel(channel)}</span>
                    }
                    className="min-h-11 justify-center gap-1"
                  >
                    {control(row, channel)}
                  </Field>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

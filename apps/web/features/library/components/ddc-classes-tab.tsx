"use client";

import {
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  domainIcons,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLibraryDdcClassesQuery } from "../master-data-api";

/** The ten top-level Dewey Decimal classes; read-only reference for cataloguing. */
export function DdcClassesTab(): ReactElement {
  const t = useTranslations("app.library.masterData.ddcClasses");
  const { data, isLoading } = useLibraryDdcClassesQuery();
  const items = data?.data ?? [];

  if (isLoading) return <Skeleton className="h-64 w-full" aria-busy="true" />;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<domainIcons.library aria-hidden="true" />}
        title={t("emptyTitle")}
        description={t("emptyBody")}
      />
    );
  }

  return (
    <Table containerClassName="md:h-full md:min-h-0 md:overflow-y-auto">
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className="w-24">
            {t("columns.code")}
          </TableHead>
          <TableHead scope="col">{t("columns.name")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.code}>
            <TableCell className="font-medium tabular-nums">{item.code}</TableCell>
            <TableCell>{item.name}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

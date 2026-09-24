"use client";

import { Badge } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { UserImportRow, UserImportRowResult } from "../api";

/** A blank cell reads as missing data, so render an explicit dash instead. */
function orDash(value: string): string {
  return value === "" ? "-" : value;
}

/**
 * Row-by-row outcome from preview or commit, joined back to the parsed
 * row so the table can show the name/kind the admin will recognize
 * alongside the row number and any errors.
 */
export function UserImportPreviewTable({
  rows,
  results,
}: {
  rows: UserImportRow[];
  results: UserImportRowResult[];
}): ReactElement {
  const t = useTranslations("app.school.users.import");
  const tKinds = useTranslations("app.school.users.kinds");
  const resultByRow = new Map(results.map((r) => [r.row_number, r]));

  return (
    <div className="overflow-x-auto rounded-xs border border-border">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead className="bg-bg text-left text-fg-muted">
          <tr>
            <th scope="col" className="px-3 py-2">
              {t("table.row")}
            </th>
            <th scope="col" className="px-3 py-2">
              {t("table.name")}
            </th>
            <th scope="col" className="px-3 py-2">
              {t("table.kind")}
            </th>
            <th scope="col" className="px-3 py-2">
              {t("table.username")}
            </th>
            <th scope="col" className="px-3 py-2">
              {t("table.status")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowNumber = row.row_number ?? index + 1;
            const result = resultByRow.get(rowNumber);
            const errors = result?.errors ?? [];
            const hasError = errors.length > 0;
            const action = result?.action;
            const changedFields = result?.changed_fields ?? [];
            return (
              <tr key={rowNumber} className="border-t border-border align-top">
                <td className="px-3 py-2 text-fg-muted">{rowNumber}</td>
                <td className="px-3 py-2">{orDash(row.name)}</td>
                <td className="px-3 py-2">
                  {tKinds.has(row.profile_kind)
                    ? tKinds(row.profile_kind)
                    : orDash(row.profile_kind)}
                </td>
                <td className="px-3 py-2 text-fg-muted">
                  {orDash(result?.username ?? row.username ?? "")}
                </td>
                <td className="px-3 py-2">
                  {hasError ? (
                    <div className="flex flex-col gap-1">
                      <Badge variant="accent">{t("table.invalid")}</Badge>
                      <ul className="list-disc pl-4 text-[12px] text-fg-muted">
                        {errors.map((message, i) => (
                          <li key={i}>{message}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <Badge variant="neutral">
                        {action ? t(`table.action.${action}`) : t("table.valid")}
                      </Badge>
                      {action === "update" && changedFields.length > 0 && (
                        <span className="text-[12px] text-fg-muted">
                          {t("table.changedFields", { fields: changedFields.join(", ") })}
                        </span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

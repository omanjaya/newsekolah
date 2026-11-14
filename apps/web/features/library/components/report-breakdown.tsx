"use client";

import { Card, CardHeader, CardTitle, List, ListRow } from "@newsekolah/ui";
import type { ReactElement } from "react";

/**
 * One count-by-group block of a library report (per day, per class, per
 * member type, per DDC class): a card titled with the grouping and a
 * list of name and count rows, a dash when the group is empty.
 */
export function ReportBreakdown({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; name: string; count: number }[];
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">{title}</CardTitle>
      </CardHeader>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-body-sm text-fg-muted">-</p>
      ) : (
        <List dense aria-label={title}>
          {rows.map((row) => (
            <ListRow
              key={row.key}
              title={row.name}
              trailing={<span className="text-body-sm tabular-nums text-fg">{row.count}</span>}
            />
          ))}
        </List>
      )}
    </Card>
  );
}

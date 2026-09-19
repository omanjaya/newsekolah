import type { ColumnDef, Row, Table } from "@tanstack/react-table";
import type { ReactElement } from "react";

import { Checkbox } from "../checkbox.js";
import { useUiLabels } from "../ui-labels.js";

export function SelectionAllCheckbox<TData>({ table }: { table: Table<TData> }): ReactElement {
  const labels = useUiLabels();
  return (
    <Checkbox
      checked={table.getIsAllRowsSelected() || (table.getIsSomeRowsSelected() && "indeterminate")}
      onCheckedChange={(value) => {
        table.toggleAllRowsSelected(!!value);
      }}
      aria-label={labels.tableSelectAllRows}
    />
  );
}

export function SelectionRowCheckbox<TData>({ row }: { row: Row<TData> }): ReactElement {
  const labels = useUiLabels();
  return (
    <Checkbox
      checked={row.getIsSelected()}
      onCheckedChange={(value) => {
        row.toggleSelected(!!value);
      }}
      aria-label={labels.tableSelectRow}
    />
  );
}

/** Selection column helper: `columns: [selectionColumn(), ...yourColumns]`. */
export function selectionColumn<TData>(): ColumnDef<TData> {
  return {
    id: "select",
    size: 40,
    header: ({ table }) => <SelectionAllCheckbox table={table} />,
    cell: ({ row }) => <SelectionRowCheckbox row={row} />,
    enableSorting: false,
    enableHiding: false,
  };
}

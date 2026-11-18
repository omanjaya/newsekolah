"use client";

import { Button, SectionHeader } from "@newsekolah/ui";
import { Plus } from "lucide-react";
import type { ReactElement } from "react";

/**
 * The heading over a catalogue-data list, with its add action as one small
 * secondary button on the heading's line, as the lesson periods have it.
 * In the table's toolbar the action took a full-width row above the search
 * on a phone. The action shows while the list loads or has rows; an empty
 * list offers it in its own empty state instead.
 */
export function MasterListHeader({
  title,
  count,
  addLabel,
  showAdd,
  onAdd,
}: {
  title: string;
  count: number;
  addLabel: string;
  showAdd: boolean;
  onAdd: () => void;
}): ReactElement {
  return (
    <SectionHeader
      title={title}
      count={count}
      action={
        showAdd ? (
          <Button size="sm" variant="secondary" icon={<Plus />} onClick={onAdd}>
            {addLabel}
          </Button>
        ) : undefined
      }
    />
  );
}

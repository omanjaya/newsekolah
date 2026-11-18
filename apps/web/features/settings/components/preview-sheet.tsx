"use client";

import { Button, Sheet, SheetContent } from "@newsekolah/ui";
import { Eye } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

export interface PreviewSheetProps {
  /** Names both the button and the sheet. */
  label: string;
  /** The live preview, drawn from the unsaved draft. */
  children: ReactNode;
}

/**
 * The live preview of a settings form below `lg`, where the preview card no
 * longer sits beside the fields: a secondary button at the top opens it in a
 * bottom sheet, so the reader sees an edit without scrolling to the end of
 * the page. From `lg` up the button is hidden and the preview card stays in
 * its own column.
 */
export function PreviewSheet({ label, children }: PreviewSheetProps): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <Button
        variant="secondary"
        icon={<Eye />}
        onClick={() => {
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" title={label}>
          {children}
        </SheetContent>
      </Sheet>
    </div>
  );
}

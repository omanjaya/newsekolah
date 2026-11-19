"use client";

import { Button, Sheet, SheetContent } from "@newsekolah/ui";
import { Eye } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

export interface PreviewSheetProps {
  /** Names both the button and the sheet. */
  label: string;
  /** A line under the sheet's title, such as when the preview updates. */
  description?: string;
  /** The live preview, drawn from the unsaved draft. */
  children: ReactNode;
}

/**
 * The live preview of a settings form below `lg`, where the preview card no
 * longer sits beside the fields: a secondary button at the top opens it in a
 * bottom sheet, so the reader sees an edit without scrolling to the end of
 * the page. From `lg` up the button is hidden and the preview card stays in
 * its own column. The sheet carries the title, so the preview inside is
 * drawn bare (no card or heading of its own).
 */
export function PreviewSheet({ label, description, children }: PreviewSheetProps): ReactElement {
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
        <SheetContent side="bottom" title={label} description={description}>
          {children}
        </SheetContent>
      </Sheet>
    </div>
  );
}

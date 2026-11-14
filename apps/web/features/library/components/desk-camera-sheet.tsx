"use client";

import {
  Scanner,
  Sheet,
  SheetContent,
  type BarcodeScanEvent,
  type ScannerResultValue,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * The desk's camera, for a counter without a hardware scanner: the shared
 * `Scanner` in a sheet, reading codes one after another into the same scan
 * handler as the bar, with the same last result under the viewfinder.
 * While it is open the bar's own scanner listener stands down, so a
 * hardware scan is never read twice.
 */
export function DeskCameraSheet({
  open,
  onOpenChange,
  onScan,
  result,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (event: BarcodeScanEvent) => void;
  result: ScannerResultValue | null;
  disabled: boolean;
}): ReactElement {
  const t = useTranslations("app.library.desk.bar");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={t("camera")} side="right" size="lg">
        {open && (
          <Scanner
            variant="action"
            onScan={onScan}
            result={result}
            manualEntry={false}
            disabled={disabled}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

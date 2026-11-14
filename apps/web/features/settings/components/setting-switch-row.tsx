"use client";

import { cn, Field, Switch } from "@newsekolah/ui";
import type { ReactElement, ReactNode } from "react";

export interface SettingSwitchRowProps {
  label: ReactNode;
  /** What turning it on does, under the label. */
  hint?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * An on/off setting: label and hint on the left, the switch on the right,
 * centred on the pair. Built on `Field`, so the label names the switch,
 * the hint describes it, and a tap on the label toggles it.
 */
export function SettingSwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  className,
}: SettingSwitchRowProps): ReactElement {
  return (
    <Field
      label={label}
      hint={hint}
      disabled={disabled}
      className={cn(
        // Label (row 1) and hint (row 2) in the first column; the switch
        // spans both rows in the second.
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1",
        "[&>div:nth-child(2)]:col-start-2 [&>div:nth-child(2)]:row-span-2 [&>div:nth-child(2)]:row-start-1",
        "[&>div:nth-child(3)]:mt-0",
        className,
      )}
    >
      {(control) => (
        <Switch
          id={control.id}
          aria-describedby={control["aria-describedby"]}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
        />
      )}
    </Field>
  );
}

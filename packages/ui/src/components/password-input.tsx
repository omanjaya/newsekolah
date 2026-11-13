"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type KeyboardEvent } from "react";

import { cn } from "../utils/cn.js";

import { FIELD_ICON_BUTTON, FIELD_ICON_FACE } from "./field-box.js";
import { Input, type InputProps } from "./input.js";
import { useUiLabels } from "./ui-labels.js";

export type PasswordInputProps = Omit<InputProps, "type" | "trailing"> & {
  /** Called when Caps Lock turns on or off while the field has focus. */
  onCapsLockChange?: (on: boolean) => void;
};

/**
 * A password field with a show and hide toggle. The toggle is a real
 * button with a pressed state, so it is announced as "Tampilkan kata
 * sandi, tidak ditekan" and stays out of the way of a password manager
 * (the input keeps its `autocomplete`). While Caps Lock is on, a short
 * notice appears under the field.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ onCapsLockChange, onKeyDown, onKeyUp, onBlur, ...props }, ref) {
    const labels = useUiLabels();
    const [visible, setVisible] = useState(false);
    const [capsLock, setCapsLock] = useState(false);

    const readCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
      const on = event.getModifierState("CapsLock");
      if (on === capsLock) return;
      setCapsLock(on);
      onCapsLockChange?.(on);
    };

    return (
      <div className="flex min-w-0 flex-col gap-1">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          spellCheck={false}
          autoCapitalize="none"
          {...props}
          onKeyDown={(event) => {
            readCapsLock(event);
            onKeyDown?.(event);
          }}
          onKeyUp={(event) => {
            readCapsLock(event);
            onKeyUp?.(event);
          }}
          onBlur={(event) => {
            if (capsLock) {
              setCapsLock(false);
              onCapsLockChange?.(false);
            }
            onBlur?.(event);
          }}
          trailing={
            <button
              type="button"
              aria-pressed={visible}
              aria-label={visible ? labels.passwordHide : labels.passwordShow}
              disabled={props.disabled}
              className={cn(FIELD_ICON_BUTTON, "-mr-3 md:pointer-fine:-mr-1")}
              onClick={() => {
                setVisible((current) => !current);
              }}
            >
              <span className={FIELD_ICON_FACE}>
                {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </span>
            </button>
          }
        />
        {capsLock && (
          <p role="status" className="text-caption text-warning">
            {labels.passwordCapsLock}
          </p>
        )}
      </div>
    );
  },
);

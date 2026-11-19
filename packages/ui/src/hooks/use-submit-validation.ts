"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export interface SubmitValidation<T extends HTMLElement> {
  /** Put on the form (or the dialog body holding its fields). */
  ref: RefObject<T | null>;
  /** True once the reader has tried to submit: fields show their errors from then on. */
  attempted: boolean;
  /**
   * Call first thing in the submit handler with whether the form is valid.
   * When it is not, the attempt is recorded (so every Field shows its
   * error) and, once the errors render, the first invalid control takes
   * focus with its Field brought into view. Returns `valid`, so a handler can `if (!check(ok)) return;`.
   */
  check: (valid: boolean) => boolean;
  /** Back to untouched (a dialog that keeps its state while closed calls it on reset). */
  reset: () => void;
}

const CLIPS = new Set(["auto", "scroll", "hidden", "clip"]);

/**
 * The vertical band of the page where `element` can be seen: the viewport,
 * narrowed by every ancestor that clips its content (a dialog's scroll
 * area, an overflow-hidden layout).
 */
function visibleBand(element: HTMLElement): { top: number; bottom: number } {
  let top = 0;
  let bottom = window.innerHeight || document.documentElement.clientHeight;
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (node === document.body || node === document.documentElement) break;
    if (!CLIPS.has(getComputedStyle(node).overflowY)) continue;
    const rect = node.getBoundingClientRect();
    top = Math.max(top, rect.top + node.clientTop);
    bottom = Math.min(bottom, rect.top + node.clientTop + node.clientHeight);
  }
  return { top, bottom };
}

/**
 * Focuses the first control marked invalid inside `root` and makes sure
 * its whole Field (label, control and error) can be seen. A bare
 * `focus()` scrolls only as far as the control, which leaves its label cut
 * off above it. A Field already in full view is left where it is, so a
 * short form does not jump; one out of view is centred in its scroll area,
 * or, when it is taller than that area, brought in from its top, label
 * first. Returns whether a control was found.
 */
function focusFirstInvalid(root: HTMLElement | null): boolean {
  const control = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!control) return false;
  control.focus({ preventScroll: true });
  const field = control.closest<HTMLElement>('[data-slot="field"]') ?? control;
  // Not every environment lays out (jsdom has no scrollIntoView).
  if (typeof field.scrollIntoView !== "function") return true;
  const rect = field.getBoundingClientRect();
  const band = visibleBand(field);
  if (rect.top >= band.top && rect.bottom <= band.bottom) return true;
  const fits = rect.height <= band.bottom - band.top;
  field.scrollIntoView({ block: fits ? "center" : "start", inline: "nearest" });
  return true;
}

/**
 * The form convention (docs/07-ui-ux.md, Form): Submit stays enabled, so
 * a reader is never stuck at a greyed-out button with no reason. Pressing
 * it on an incomplete form shows each Field's error and focuses the first
 * one. Disable Submit only while a request is pending, or on an edit form
 * with nothing changed. For plain-state forms; react-hook-form forms get
 * the same behaviour from `handleSubmit`.
 *
 * Destructure the result (the React compiler's lint treats a whole
 * object holding a ref as a ref):
 *
 *   const { ref, attempted, check } = useSubmitValidation();
 *   <form ref={ref} noValidate onSubmit={(e) => {
 *     e.preventDefault();
 *     if (!check(Boolean(name.trim()))) return;
 *     ...
 *   }}>
 *     <Field label="Nama" required
 *       error={attempted && !name.trim() ? tValidation("required") : undefined}>
 */
export function useSubmitValidation<
  T extends HTMLElement = HTMLFormElement,
>(): SubmitValidation<T> {
  const ref = useRef<T>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (attempts === 0) return;
    if (focusFirstInvalid(ref.current)) return;
    // The first invalid field can mount a moment after the errors do: a
    // tab the submit switched back to renders its content in a later pass.
    const frame = requestAnimationFrame(() => {
      focusFirstInvalid(ref.current);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [attempts]);

  const check = useCallback((valid: boolean) => {
    if (!valid) setAttempts((count) => count + 1);
    return valid;
  }, []);

  const reset = useCallback(() => {
    setAttempts(0);
  }, []);

  return { ref, attempted: attempts > 0, check, reset };
}

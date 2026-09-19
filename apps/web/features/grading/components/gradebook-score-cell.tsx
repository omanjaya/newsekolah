"use client";

import { Input, useDebouncedCallback } from "@newsekolah/ui";
import { memo, useEffect, useRef, useState, type ReactElement } from "react";

const COMMIT_DEBOUNCE_MS = 400;

export interface GradebookScoreCellProps {
  studentId: string;
  componentId: string;
  rowIndex: number;
  /** The committed value: `edits[componentId][studentId]`, or the original score. */
  value: string;
  disabled: boolean;
  ariaLabel: string;
  className?: string;
  /** Stable: writes into the parent's `edits` buffer, the source of truth for submit. */
  onCommit: (componentId: string, studentId: string, value: string) => void;
  onRegisterRef: (refKey: string, el: HTMLInputElement | null) => void;
  onNavigate?: (componentId: string, rowIndex: number, direction: "down" | "up") => void;
}

/**
 * One score input. Keeps its own draft while the teacher is typing instead
 * of writing every keystroke into the gradebook-wide `edits` state, so a
 * keystroke in one cell no longer re-renders the other 500+ cells of the
 * matrix. The draft commits to the parent buffer debounced, and immediately
 * on blur so the "unsaved changes" count and the save payload never lag
 * behind what is on screen once the field loses focus.
 */
export const GradebookScoreCell = memo(function GradebookScoreCell({
  studentId,
  componentId,
  rowIndex,
  value,
  disabled,
  ariaLabel,
  className,
  onCommit,
  onRegisterRef,
  onNavigate,
}: GradebookScoreCellProps): ReactElement {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const commitDebounced = useDebouncedCallback((next: string) => {
    onCommit(componentId, studentId, next);
  }, COMMIT_DEBOUNCE_MS);

  // Only follow external updates (save clearing the edit, a fresh sheet
  // load) while the field is not focused, so a debounced commit of this
  // same cell's own draft never fights the cursor mid-keystroke.
  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // If this cell unmounts with a keystroke still only debounced (not yet
  // blurred or flushed) -- e.g. the desktop/mobile breakpoint flips mid-edit
  // -- write the latest draft into the parent buffer rather than dropping it.
  useEffect(() => {
    return () => {
      if (draftRef.current !== valueRef.current) {
        onCommit(componentId, studentId, draftRef.current);
      }
    };
  }, [componentId, studentId, onCommit]);

  const refKey = `${componentId}:${rowIndex}`;

  return (
    <Input
      ref={(el) => {
        onRegisterRef(refKey, el);
      }}
      type="number"
      inputMode="decimal"
      step="0.1"
      min={0}
      disabled={disabled}
      value={draft}
      aria-label={ariaLabel}
      className={className}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        commitDebounced(next);
      }}
      onBlur={() => {
        focusedRef.current = false;
        // Only write an entry when the value actually changed: blurring an
        // untouched cell (e.g. tabbing through) must not mark it "pending".
        if (draft !== value) onCommit(componentId, studentId, draft);
      }}
      onKeyDown={(e) => {
        if (!onNavigate) return;
        if (e.key === "Enter" || e.key === "ArrowDown") {
          e.preventDefault();
          if (draft !== value) onCommit(componentId, studentId, draft);
          onNavigate(componentId, rowIndex, "down");
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          onNavigate(componentId, rowIndex, "up");
        }
      }}
    />
  );
});

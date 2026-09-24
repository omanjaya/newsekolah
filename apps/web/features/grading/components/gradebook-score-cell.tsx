"use client";

import { Input, cn, useDebouncedCallback } from "@newsekolah/ui";
import { memo, useEffect, useRef, useState, type ClipboardEvent, type ReactElement } from "react";

import { isMultiCellPaste, parsePastedGrid } from "../lib/gradebook-paste";
import { isScoreOutOfRange } from "../lib/gradebook-scores";

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
  /** The tenant's grading scale, for inline min/max validation (undefined skips validation). */
  min?: number;
  max?: number;
  /** True when this cell differs from what was last saved -- shows a small accent marker. */
  changed?: boolean;
  /** "lg" is the mobile one-component-at-a-time entry mode's big tap target; "sm" (default) is the spreadsheet grid. */
  size?: "sm" | "lg";
  /** Stable: writes into the parent's `edits` buffer, the source of truth for submit. */
  onCommit: (componentId: string, studentId: string, value: string) => void;
  onRegisterRef: (refKey: string, el: HTMLInputElement | null) => void;
  onNavigate?: (
    componentId: string,
    rowIndex: number,
    direction: "up" | "down" | "left" | "right",
  ) => void;
  /**
   * A multi-cell paste (an Excel column or block) landed on this cell.
   * Only wired on the desktop grid, where a whole range can be selected in
   * the source spreadsheet; the mobile entry modes fill one score at a
   * time, so a paste there just pastes into that one field.
   */
  onPasteBlock?: (componentId: string, studentId: string, rows: string[][]) => void;
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
  min,
  max,
  changed,
  size = "sm",
  onCommit,
  onRegisterRef,
  onNavigate,
  onPasteBlock,
}: GradebookScoreCellProps): ReactElement {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const commitDebounced = useDebouncedCallback((next: string) => {
    onCommit(componentId, studentId, next);
  }, COMMIT_DEBOUNCE_MS);

  // Only follow external updates (save clearing the edit, a fresh sheet
  // load, or a multi-cell paste landing on this cell from elsewhere) while
  // the field is not focused, so a debounced commit of this same cell's
  // own draft never fights the cursor mid-keystroke.
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
  const invalid =
    min !== undefined && max !== undefined ? isScoreOutOfRange(draft, min, max) : false;

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    if (!onPasteBlock) return;
    const text = e.clipboardData.getData("text");
    const rows = parsePastedGrid(text);
    if (!isMultiCellPaste(rows)) return; // A single value: let the input's own paste behaviour handle it.
    e.preventDefault();
    const first = rows[0]?.[0] ?? "";
    setDraft(first);
    onPasteBlock(componentId, studentId, rows);
  }

  return (
    <Input
      ref={(el) => {
        onRegisterRef(refKey, el);
      }}
      type="number"
      inputMode="decimal"
      step="0.1"
      min={min}
      max={max}
      disabled={disabled}
      value={draft}
      placeholder="-"
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      className={cn(
        className,
        size === "lg" && "h-12 text-center text-[20px] font-medium",
        changed && "border-accent bg-accent/5",
        invalid && "border-status-absent text-status-absent",
      )}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        commitDebounced(next);
      }}
      onPaste={handlePaste}
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
        } else if (e.key === "ArrowLeft") {
          // A number input has no meaningful in-field cursor to preserve
          // (selectionStart is unsupported for type="number" across
          // browsers), so left/right always move a column -- consistent
          // with up/down/Enter always moving a row.
          e.preventDefault();
          onNavigate(componentId, rowIndex, "left");
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onNavigate(componentId, rowIndex, "right");
        }
      }}
    />
  );
});

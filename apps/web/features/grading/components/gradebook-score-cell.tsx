"use client";

import { Input, cn, useDebouncedCallback } from "@newsekolah/ui";
import { useLocale } from "next-intl";
import { memo, useEffect, useRef, useState, type ClipboardEvent, type ReactElement } from "react";

import { formatScore } from "../lib/format-score";
import { isMultiCellPaste, parsePastedGrid } from "../lib/gradebook-paste";
import { parseScoreInput, scoreProblem } from "../lib/gradebook-scores";

const COMMIT_DEBOUNCE_MS = 400;

export interface GradebookScoreCellProps {
  studentId: string;
  componentId: string;
  rowIndex: number;
  /** The committed value: `edits[componentId][studentId]`, or the original score. */
  value: string;
  /**
   * A reader who cannot edit this sheet: the score renders as plain text,
   * the way the average and report score beside it do, instead of an input
   * box that only looks editable.
   */
  readOnly?: boolean;
  /**
   * The scale's `round_decimal`, for the read-only text, so a cell shows
   * the precision the average and report score beside it use.
   */
  decimals?: number;
  ariaLabel: string;
  /** Layout classes (width, shrink, text alignment) -- moved onto the wrapper, not the input, so they still apply once the range hint needs a sizing anchor. */
  className?: string;
  /** The tenant's grading scale, for inline min/max validation (undefined skips validation). */
  min?: number;
  max?: number;
  /**
   * Precomputed once for the whole sheet (e.g. "Nilai 0-100"), shown under
   * an out-of-range cell and linked to it with `aria-describedby` so a
   * screen reader announces it, not just the bare `aria-invalid`.
   */
  rangeHint?: string;
  /** Same, for a cell whose text is not a number at all (e.g. "abc" or "1.234,5"). */
  formatHint?: string;
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
  readOnly = false,
  decimals,
  ariaLabel,
  className,
  min,
  max,
  rangeHint,
  formatHint,
  changed,
  size = "sm",
  onCommit,
  onRegisterRef,
  onNavigate,
  onPasteBlock,
}: GradebookScoreCellProps): ReactElement {
  const locale = useLocale();
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  // Each keystroke's debounced commit carries the generation it was typed
  // in; a blur, Enter or pasted block moves to the next generation, so a
  // commit still queued from before it is dropped instead of landing
  // later and overwriting what reached the cell since (a pasted value).
  const generationRef = useRef(0);
  const debounced = useDebouncedCallback((next: string, generation: number) => {
    if (generation === generationRef.current) onCommit(componentId, studentId, next);
  }, COMMIT_DEBOUNCE_MS);
  function commitLater(next: string) {
    debounced(next, generationRef.current);
  }
  function cancelPendingCommit() {
    generationRef.current += 1;
  }

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
  const problem = min !== undefined && max !== undefined ? scoreProblem(draft, min, max) : null;
  const invalid = problem !== null;
  const hint = problem === "format" ? formatHint : rangeHint;
  const cellId = `gradebook-score-${componentId}-${studentId}`;
  const hintId = `${cellId}-hint`;

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    if (!onPasteBlock) return;
    const text = e.clipboardData.getData("text");
    const rows = parsePastedGrid(text);
    if (!isMultiCellPaste(rows)) return; // A single value: let the input's own paste behaviour handle it.
    e.preventDefault();
    // A keystroke still waiting to commit must not land after the block
    // and overwrite the pasted value.
    cancelPendingCommit();
    const first = rows[0]?.[0] ?? "";
    setDraft(first.trim());
    onPasteBlock(componentId, studentId, rows);
  }

  if (readOnly) {
    // Plain text in the cell: the column header and the row's student
    // name already say whose score it is, as they do for the average.
    // The value is the locale's text ("8,5" in id), so it is read with
    // either separator, as an edited cell is.
    const parsed = parseScoreInput(value);
    const score = typeof parsed === "number" ? parsed : Number.NaN;
    return (
      <span
        className={cn(
          "block py-1",
          Number.isFinite(score) ? "text-fg" : "text-fg-muted",
          className,
        )}
      >
        {Number.isFinite(score) ? formatScore(score, locale, decimals) : "-"}
      </span>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={(el) => {
          onRegisterRef(refKey, el);
        }}
        id={cellId}
        // A cell of the score grid, not a form field: it keeps a text draft
        // while typing, takes a pasted spreadsheet block and hands the arrow
        // keys to the grid, none of which NumberInput (a number|null field
        // with steppers) does.
        // Plain text with a decimal keypad, not type="number": a number
        // input silently drops a comma ("8,5" became 85) and blanks a pasted
        // "78,5", while the teacher's Indonesian spreadsheet writes exactly
        // that. `parseScoreInput` reads either separator.
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft}
        placeholder="-"
        aria-label={ariaLabel}
        invalid={invalid}
        aria-describedby={invalid && hint ? hintId : undefined}
        className={cn(
          "w-full",
          size === "lg" && "h-12 text-center text-title",
          changed && "border-accent bg-accent-soft/40",
          invalid && "text-danger",
        )}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          commitLater(next);
        }}
        onPaste={handlePaste}
        onBlur={() => {
          focusedRef.current = false;
          // The blur commits the draft now; a debounced commit still queued
          // from typing would otherwise land later and overwrite whatever
          // reached this cell since (a pasted block, a save clearing it).
          cancelPendingCommit();
          // Only write an entry when the value actually changed: blurring an
          // untouched cell (e.g. tabbing through) must not mark it "pending".
          if (draft !== value) onCommit(componentId, studentId, draft);
        }}
        onKeyDown={(e) => {
          if (!onNavigate) return;
          if (e.key === "Enter" || e.key === "ArrowDown") {
            e.preventDefault();
            cancelPendingCommit();
            if (draft !== value) onCommit(componentId, studentId, draft);
            onNavigate(componentId, rowIndex, "down");
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            onNavigate(componentId, rowIndex, "up");
          } else if (e.key === "ArrowLeft") {
            // Left/right always move a column, as in a spreadsheet's
            // navigation mode -- consistent with up/down/Enter always
            // moving a row; a score is short enough to retype.
            e.preventDefault();
            onNavigate(componentId, rowIndex, "left");
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            onNavigate(componentId, rowIndex, "right");
          }
        }}
      />
      {invalid && hint && (
        <p
          id={hintId}
          role="alert"
          className="absolute inset-x-0 top-full z-10 mt-0.5 text-caption text-danger"
        >
          {hint}
        </p>
      )}
    </div>
  );
});

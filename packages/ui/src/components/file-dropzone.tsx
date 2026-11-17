"use client";

import { FileCheck2, FileUp, Upload } from "lucide-react";
import { useId, useRef, useState, type DragEvent, type ReactElement, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { Button } from "./button.js";
import { useFieldControl } from "./field-context.js";
import { FieldError } from "./field.js";
import { IconCircle } from "./icon-circle.js";

export interface FileDropzoneProps {
  /** Called with the picked or dropped file (the first one, when several are dropped). */
  onFile: (file: File) => void;
  /** The file types to offer, as on `<input type="file">` (".xlsx", "text/csv", "image/*"). */
  accept?: string;
  /** The chosen file's name, shown in place of `title`; empty or null for none. */
  fileName?: string | null;
  /** The button before a file is chosen ("Pilih berkas"). */
  chooseLabel: string;
  /** The button once a file is chosen ("Ganti berkas"); `chooseLabel` when left out. */
  replaceLabel?: string;
  /** The zone's line before a file is chosen ("Pilih berkas templat yang sudah diisi"). */
  title?: ReactNode;
  /** A muted line under it: the format, a size limit. */
  hint?: ReactNode;
  /**
   * The message under the zone (a file that could not be read). Inside a
   * `Field`, pass the error to the field instead; the zone turns invalid
   * with it.
   */
  error?: ReactNode;
  /**
   * Shown when a dropped file is not one of `accept`, which is then not
   * handed on. Without it such a file reaches `onFile` like a picked one,
   * and the caller's own reading of it says what is wrong.
   */
  rejectMessage?: ReactNode;
  /** The icon in the zone; an upload file by default, a ticked file once one is chosen. */
  icon?: ReactNode;
  /** A file is being read or sent: the button spins and the zone takes no new file. */
  loading?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** The file input's id; a surrounding `Field` sets it, so clicking the field's label opens the picker. */
  id?: string;
  /** Posts the picked file with a native form. */
  name?: string;
  "aria-describedby"?: string;
  className?: string;
}

/** Whether a file is one of an `accept` list: extensions, exact types and "type/*" families. */
export function fileMatchesAccept(file: Pick<File, "name" | "type">, accept: string): boolean {
  const tokens = accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

/**
 * Where a file comes in (an import, an attachment): one dashed, sunken
 * zone that takes a dropped file, and a real button that opens the
 * device's picker, so the keyboard and a screen reader get the same path
 * as a mouse. The button's target stretches over the whole zone, so a
 * click anywhere in it picks. Once a file is chosen its name replaces the
 * title and the button offers to replace it; the button is described by
 * that name, the hint and the error. It holds no built-in words: the
 * caller names the file it wants.
 *
 * Inside a `Field` the field's label opens the picker and its hint and
 * error describe the button, like any other control.
 */
export function FileDropzone({
  onFile,
  accept,
  fileName,
  chooseLabel,
  replaceLabel,
  title,
  hint,
  error,
  rejectMessage,
  icon,
  loading = false,
  disabled,
  invalid,
  id,
  name,
  "aria-describedby": ariaDescribedBy,
  className,
}: FileDropzoneProps): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(false);
  const baseId = useId();
  const statusId = `${baseId}-status`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const shownError = error ?? (rejected ? rejectMessage : undefined);
  const hasError =
    shownError !== undefined && shownError !== null && shownError !== false && shownError !== "";
  const {
    attributes,
    invalid: fieldInvalid,
    labelId,
  } = useFieldControl({
    id,
    disabled,
    invalid: invalid ?? (hasError ? true : undefined),
    "aria-describedby": ariaDescribedBy,
  });
  const buttonId = `${baseId}-button`;
  const isDisabled = attributes.disabled === true;
  const blocked = isDisabled || loading;
  const chosen = Boolean(fileName);
  const describedBy =
    [
      chosen || title !== undefined ? statusId : undefined,
      hint !== undefined ? hintId : undefined,
      attributes["aria-describedby"],
      hasError ? errorId : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const take = (file: File | undefined) => {
    if (!file) return;
    if (accept && rejectMessage !== undefined && !fileMatchesAccept(file, accept)) {
      setRejected(true);
      return;
    }
    setRejected(false);
    onFile(file);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (blocked || !hasFiles(event)) return;
    // Taking over the default is what makes the zone a drop target.
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div
        data-slot="file-dropzone"
        data-dragging={dragging ? "" : undefined}
        data-invalid={fieldInvalid ? "" : undefined}
        aria-busy={loading || undefined}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          // Still inside: the pointer only moved onto a child.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (blocked) return;
          take(event.dataTransfer.files[0]);
        }}
        className={cn(
          "relative flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-8 text-center",
          "border-border-strong bg-surface-sunken transition-colors",
          !blocked && "hover:border-fg-muted",
          dragging && "border-accent bg-accent-soft hover:border-accent",
          fieldInvalid && !dragging && "border-danger hover:border-danger",
          isDisabled && "opacity-50",
        )}
      >
        <IconCircle tone={chosen ? "accent" : "neutral"} size="lg">
          {icon ?? (chosen ? <FileCheck2 /> : <FileUp />)}
        </IconCircle>
        {(chosen || title !== undefined) && (
          <p id={statusId} className="max-w-full text-body text-fg">
            {chosen ? (
              <span className="font-semibold [overflow-wrap:anywhere]">{fileName}</span>
            ) : (
              title
            )}
          </p>
        )}
        {hint !== undefined && (
          <p id={hintId} className="text-caption text-fg-muted">
            {hint}
          </p>
        )}
        <Button
          id={buttonId}
          variant={chosen ? "secondary" : "primary"}
          icon={<Upload />}
          loading={loading}
          disabled={isDisabled}
          // Inside a Field the button is named by the field's label, then
          // by its own words ("Berkas pengguna, Pilih berkas"); the label
          // itself points at the hidden input, which it opens.
          aria-labelledby={labelId ? `${labelId} ${buttonId}` : undefined}
          aria-describedby={describedBy}
          onClick={() => {
            input.current?.click();
          }}
          // The button's target covers the whole zone (the house's stretched
          // target): a click anywhere in it opens the picker.
          className="after:absolute after:inset-0 after:rounded-[inherit] after:content-['']"
        >
          {chosen ? (replaceLabel ?? chooseLabel) : chooseLabel}
        </Button>
        {/* The browser's own picker button speaks the browser's language
            ("Choose File"), so it stays hidden behind ours. */}
        <input
          ref={input}
          id={attributes.id}
          name={name}
          type="file"
          accept={accept}
          disabled={blocked}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared, so the same file can be picked again after a fix.
            if (!name) event.target.value = "";
            take(file);
          }}
        />
      </div>
      {hasError && <FieldError id={errorId}>{shownError}</FieldError>}
    </div>
  );
}

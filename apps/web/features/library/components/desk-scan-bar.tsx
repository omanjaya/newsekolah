"use client";

import {
  Button,
  Card,
  IconButton,
  Input,
  ScannerResultBanner,
  SegmentedControl,
  isCameraSupported,
  useBarcodeScanner,
  type BarcodeScanEvent,
  type ScannerResultValue,
} from "@newsekolah/ui";
import { Camera, ScanLine } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement, Ref } from "react";
import { useId, useState, useSyncExternalStore } from "react";

import type { LibraryLookupResult } from "../desk-api";
import { DESK_MODES, type DeskMode } from "../lib/desk-basket";

import { DeskCameraSheet } from "./desk-camera-sheet";
import { DeskMemberSearch } from "./desk-member-search";

/** Long enough for any card or copy code ("sion:<kind>:<uuid>:<token>" is 93). */
const MANUAL_ENTRY_MAX_LENGTH = 128;

function subscribeNever(): () => void {
  return () => undefined;
}

export interface DeskScanBarProps {
  mode: DeskMode;
  onModeChange: (mode: DeskMode) => void;
  /** Pending borrow items, shown on the Pinjam segment. */
  pendingBorrow: number;
  /** Whether a member is being served: before one is, a scan in Pinjam is their card. */
  hasMember: boolean;
  /** A scan is resolving; further codes are queued and run after it, in order. */
  scanning: boolean;
  onScan: (event: BarcodeScanEvent) => void;
  onSelectMember: (member: NonNullable<LibraryLookupResult["member"]>) => void;
  /** The last scan's outcome, announced and shown large under the bar. */
  result: ScannerResultValue | null;
  /** The scan input, so the desk can hand focus back after each step. */
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * The circulation desk's one scan bar (docs/07-ui-ux.md "Scanner"): the
 * mode sits on the bar it changes, a tall field that a hardware scanner
 * reaches from anywhere on the page, the typed fallback on Enter, the
 * camera for a counter without a scanner, and the last result large
 * under it in a live region. Before a member is chosen the same bar takes
 * their card, and a name search sits beside the mode for a reader without
 * one.
 */
export function DeskScanBar({
  mode,
  onModeChange,
  pendingBorrow,
  hasMember,
  scanning,
  onScan,
  onSelectMember,
  result,
  inputRef,
}: DeskScanBarProps): ReactElement {
  const t = useTranslations("app.library.desk");
  const hintId = useId();
  const [value, setValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraSupported = useSyncExternalStore(subscribeNever, isCameraSupported, () => false);

  // The page-wide listener: a USB or Bluetooth scanner types into whatever
  // has focus and ends with Enter, so it is heard even when the field is not
  // focused. It stands down while the camera sheet has its own.
  const hardware = useBarcodeScanner({
    onScan: (event) => {
      setValue("");
      onScan(event);
    },
    enabled: !cameraOpen,
  });

  const submitManual = () => {
    const code = value.trim();
    if (!code) return;
    setValue("");
    onScan({ code, source: "manual", at: Date.now() });
  };

  // Lending starts with a member card; a return or renewal takes the book
  // barcode straight away.
  const scansBooks = hasMember || mode !== "borrow";
  const label = scansBooks ? t(`modes.scanLabel.${mode}`) : t("member.scanLabel");
  const placeholder = scansBooks ? t(`bar.placeholder.${mode}`) : t("bar.placeholder.member");

  return (
    <Card padding="sm" data-testid="desk-scan-bar" className="md:gap-4 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          aria-label={t("modes.label")}
          options={DESK_MODES.map((option) => ({
            value: option,
            label: t(`modes.${option}`),
            count: option === "borrow" && pendingBorrow > 0 ? pendingBorrow : undefined,
          }))}
          value={mode}
          onValueChange={onModeChange}
          className="max-sm:w-full"
          fullWidth
        />
        {!hasMember && <DeskMemberSearch onSelectMember={onSelectMember} className="sm:w-72" />}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Input
          ref={inputRef}
          aria-label={label}
          aria-describedby={hintId}
          aria-busy={scanning || undefined}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            // A hardware scan typed here is reported once, by the page-wide listener.
            if (!hardware.isScanPending()) submitManual();
          }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          maxLength={MANUAL_ENTRY_MAX_LENGTH}
          leading={<ScanLine />}
          className="h-14 w-full min-w-0 sm:w-auto sm:flex-1 md:pointer-fine:h-14 [&_svg]:size-5"
          inputClassName="sm:text-title sm:font-sans sm:font-normal"
        />
        <Button size="lg" className="h-14 max-sm:flex-1" loading={scanning} onClick={submitManual}>
          {t("scanSubmit")}
        </Button>
        {cameraSupported && (
          <>
            <Button
              variant="secondary"
              size="lg"
              className="h-14 flex-1 sm:hidden"
              icon={<Camera />}
              onClick={() => {
                setCameraOpen(true);
              }}
            >
              {t("bar.camera")}
            </Button>
            <IconButton
              variant="surface"
              size="lg"
              className="size-14 max-sm:hidden"
              icon={<Camera />}
              aria-label={t("bar.camera")}
              onClick={() => {
                setCameraOpen(true);
              }}
            />
          </>
        )}
      </div>

      <p id={hintId} className="text-caption text-fg-muted">
        {scansBooks ? t("bar.shortcutsHint") : t("bar.idleHint")}
      </p>

      {/* Always mounted, so a new result is announced rather than only shown. */}
      <div aria-live="polite" aria-atomic="true" className="empty:hidden">
        {result && <ScannerResultBanner key={result.key} result={result} />}
      </div>

      <DeskCameraSheet
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onScan={onScan}
        result={result}
        disabled={scanning}
      />
    </Card>
  );
}

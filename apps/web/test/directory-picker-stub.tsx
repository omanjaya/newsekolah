import type { ReactElement } from "react";

interface StubProps {
  profileKind?: string;
  value: string;
  disabled?: boolean;
  onValueChange: (id: string, label: string) => void;
  labels: { placeholder: string };
}

/**
 * Stand-in for `features/reference/components/directory-picker` in form
 * tests: it exposes the wiring a form owns (kind, preset value, disabled)
 * and picks a fixed person on click, without a query client or the real
 * combobox. The real picker has its own test next to its source.
 */
export const directoryPickerStubModule = {
  useDirectoryPickerLabels: (placeholder: string) => ({
    placeholder,
    searchPlaceholder: "search",
    emptyLabel: "empty",
  }),
  DirectoryPicker: ({
    profileKind,
    value,
    disabled,
    onValueChange,
    labels,
  }: StubProps): ReactElement => (
    <button
      type="button"
      role="combobox"
      aria-label={labels.placeholder}
      aria-expanded="false"
      aria-controls="directory-picker-stub-list"
      data-kind={profileKind ?? "all"}
      data-value={value}
      disabled={disabled}
      onClick={() => {
        onValueChange("picked-1", "Picked Person");
      }}
    >
      {value || labels.placeholder}
    </button>
  ),
};

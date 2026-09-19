import { createContext, useContext, type PropsWithChildren } from "react";

export interface UiLabels {
  dialogClose: string;
  sheetClose: string;
  tableSelectedRows: (count: number) => string;
  tableSelectAllRows: string;
  tableSelectRow: string;
}

const DEFAULT_UI_LABELS: UiLabels = {
  dialogClose: "Tutup dialog",
  sheetClose: "Tutup",
  tableSelectedRows: (count) => `${count} baris dipilih`,
  tableSelectAllRows: "Pilih semua baris",
  tableSelectRow: "Pilih baris",
};

const UiLabelsContext = createContext<UiLabels>(DEFAULT_UI_LABELS);

export function UiLabelsProvider({
  labels,
  children,
}: PropsWithChildren<{ labels?: Partial<UiLabels> }>): React.JSX.Element {
  return (
    <UiLabelsContext.Provider value={{ ...DEFAULT_UI_LABELS, ...labels }}>
      {children}
    </UiLabelsContext.Provider>
  );
}

export function useUiLabels(): UiLabels {
  return useContext(UiLabelsContext);
}

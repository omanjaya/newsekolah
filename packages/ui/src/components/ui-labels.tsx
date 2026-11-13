import { createContext, useContext, type PropsWithChildren } from "react";

export interface UiLabels {
  dialogClose: string;
  sheetClose: string;
  tableSelectedRows: (count: number) => string;
  tableSelectAllRows: string;
  tableSelectRow: string;

  /**
   * BCP 47 locale the date, time and number controls format with ("id-ID",
   * "en-US"): month and weekday names, "14 November 2026", "08.30", "85,5".
   * A `locale` prop on one control still wins.
   */
  locale: string;
  calendarPreviousMonth: string;
  calendarNextMonth: string;
  calendarPreviousYear: string;
  calendarNextYear: string;
  /** Accessible name of the month caption that opens the month and year view. */
  calendarChooseMonth: (caption: string) => string;
}

const DEFAULT_UI_LABELS: UiLabels = {
  dialogClose: "Tutup dialog",
  sheetClose: "Tutup",
  tableSelectedRows: (count) => `${count} baris dipilih`,
  tableSelectAllRows: "Pilih semua baris",
  tableSelectRow: "Pilih baris",

  locale: "id-ID",
  calendarPreviousMonth: "Bulan sebelumnya",
  calendarNextMonth: "Bulan berikutnya",
  calendarPreviousYear: "Tahun sebelumnya",
  calendarNextYear: "Tahun berikutnya",
  calendarChooseMonth: (caption) => `${caption}, pilih bulan dan tahun`,
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

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
  /** Accessible name of the year in the month view, which opens a page of twelve years. */
  calendarChooseYear: (year: string) => string;
  calendarPreviousYears: string;
  calendarNextYears: string;
  datePickerPlaceholder: string;
  datePickerClear: string;
  dateRangePickerPlaceholder: string;
  dateRangePickerClear: string;
  dateRangePickerPickStart: string;
  dateRangePickerPickEnd: string;
  dateRangePickerPresets: string;
  monthPickerPlaceholder: string;
  monthPickerClear: string;
  timePickerPlaceholder: string;
  timePickerShowOptions: string;
  timePickerOptions: string;
  numberInputIncrement: string;
  numberInputDecrement: string;

  // Overlays, navigation and feedback (wave 2, stream 2).
  confirmDialogConfirm: string;
  confirmDialogCancel: string;
  /** Accessible name of a toast's close button. */
  toastClose: string;
  /** Accessible name of the region that holds the toasts. */
  toastRegion: string;
  commandPaletteLabel: string;
  commandPalettePlaceholder: string;
  commandPaletteEmpty: string;
  /** Footer hints next to the arrow, Enter and Esc keys. */
  commandPaletteHintMove: string;
  commandPaletteHintOpen: string;
  commandPaletteHintClose: string;
  /** Closes the full-screen palette on a phone, where there is no Esc key. */
  commandPaletteCancel: string;
  /** Read after a finished or stopped step's label by screen readers ("Wali kelas, selesai"). */
  stepperStepComplete: string;
  stepperStepStopped: string;
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
  calendarChooseYear: (year) => `${year}, pilih tahun`,
  calendarPreviousYears: "Rentang tahun sebelumnya",
  calendarNextYears: "Rentang tahun berikutnya",
  datePickerPlaceholder: "Pilih tanggal",
  datePickerClear: "Hapus tanggal",
  dateRangePickerPlaceholder: "Pilih rentang tanggal",
  dateRangePickerClear: "Hapus rentang tanggal",
  dateRangePickerPickStart: "Pilih tanggal mulai",
  dateRangePickerPickEnd: "Pilih tanggal akhir",
  dateRangePickerPresets: "Rentang cepat",
  monthPickerPlaceholder: "Pilih bulan",
  monthPickerClear: "Hapus bulan",
  timePickerPlaceholder: "Pilih jam",
  timePickerShowOptions: "Tampilkan pilihan jam",
  timePickerOptions: "Pilihan jam",
  numberInputIncrement: "Tambah",
  numberInputDecrement: "Kurangi",

  confirmDialogConfirm: "Lanjutkan",
  confirmDialogCancel: "Batal",
  toastClose: "Tutup notifikasi",
  toastRegion: "Notifikasi",
  commandPaletteLabel: "Pencarian global",
  commandPalettePlaceholder: "Cari halaman, siswa, guru, atau aksi",
  commandPaletteEmpty: "Tidak ada hasil yang cocok",
  commandPaletteHintMove: "Pindah",
  commandPaletteHintOpen: "Buka",
  commandPaletteHintClose: "Tutup",
  commandPaletteCancel: "Batal",
  stepperStepComplete: "selesai",
  stepperStepStopped: "dihentikan",
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

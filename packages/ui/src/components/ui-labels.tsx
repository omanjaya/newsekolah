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

  // Surfaces and content (PageHeader, Avatar, DataList, Skeleton presets, EmptyState, StatePage, Alert, Stat, TextLink).
  /** Accessible name of the breadcrumb trail above a page title. */
  breadcrumbLabel: string;
  /** The overflow button that holds a page's secondary actions on a phone. */
  pageHeaderMoreActions: string;
  /** Spoken name of the "+N" chip after the visible avatars of a group. */
  avatarGroupMore: (count: number) => string;
  /** Read instead of the visible dash when a definition has no value. */
  dataListNoValue: string;
  /** Spoken name of a skeleton preset while its content loads. */
  loading: string;
  emptyFilteredTitle: string;
  emptyFilteredDescription: string;
  emptyFilteredReset: string;
  /** The small error code under a full-page state, for support ("Kode 404"). */
  statePageCode: (code: string) => string;
  alertDismiss: string;
  /** Read before a stat's change figure, since its arrow is decorative. */
  statDeltaUp: string;
  statDeltaDown: string;
  statDeltaFlat: string;
  /** Read after a link that opens in a new tab. */
  linkOpensInNewTab: string;
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

  breadcrumbLabel: "Navigasi halaman",
  pageHeaderMoreActions: "Aksi lainnya",
  avatarGroupMore: (count) => `${count} orang lainnya`,
  dataListNoValue: "Tidak ada",
  loading: "Memuat",
  emptyFilteredTitle: "Tidak ada yang cocok",
  emptyFilteredDescription: "Coba kata kunci lain atau hapus filter yang aktif.",
  emptyFilteredReset: "Hapus filter",
  statePageCode: (code) => `Kode ${code}`,
  alertDismiss: "Tutup pesan",
  statDeltaUp: "Naik",
  statDeltaDown: "Turun",
  statDeltaFlat: "Tetap",
  linkOpensInNewTab: "(membuka tab baru)",
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

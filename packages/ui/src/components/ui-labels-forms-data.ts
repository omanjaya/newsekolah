/**
 * Built-in strings of the form and data components (Field, the inputs,
 * Select, Combobox, DataTable, Scanner, QrPanel). They live apart from
 * ui-labels.tsx so each component family can grow its own block without
 * every stream editing one list; `UiLabels` extends this interface and
 * `UiLabelsProvider` overrides any of them. The defaults are the product's
 * default language, Indonesian; apps/web fills them from next-intl in
 * `components/ui-locale-provider.tsx`.
 */
export interface FormsDataUiLabels {
  /** Suffix after the label of a field marked `optional`, e.g. "(opsional)". */
  fieldOptional: string;
  /** Default title of `FormError`, the summary box above a form. */
  formErrorTitle: string;

  passwordShow: string;
  passwordHide: string;
  /** Shown under a password field while Caps Lock is on. */
  passwordCapsLock: string;
  searchClear: string;

  selectPlaceholder: string;
  comboboxPlaceholder: string;
  comboboxSearchPlaceholder: string;
  comboboxLoading: string;
  comboboxEmpty: string;

  tableSearchPlaceholder: string;
  tableColumns: string;
  tableDensity: string;
  tableDensityNormal: string;
  tableDensityCompact: string;
  /** The phone toolbar's overflow menu holding the column and density options. */
  tableMoreOptions: string;
  tableClearSelection: string;
  tableNoResultsTitle: string;
  tableNoResultsDescription: string;
  tableClearSearch: string;
  tableErrorTitle: string;
  tableErrorDescription: string;
  tableRetry: string;
  /** Small support line under a failed load, e.g. "Kode galat: NETWORK". */
  tableErrorCode: (code: string) => string;
  tablePageOf: (current: number, total: number) => string;
  /** Rows shown out of a known total, e.g. "1–10 dari 48". */
  tableRange: (from: number, to: number, total: number) => string;
  /** Rows shown when the total is unknown (cursor paging), e.g. "Baris 51–100". */
  tableRangeOpen: (from: number, to: number) => string;
  /** A one-page table's size, e.g. "12 data". */
  tableRowCount: (count: number) => string;
  tablePageSize: string;
  tablePrevious: string;
  tableNext: string;
  tableFiltersReset: string;
  tableFilterRemove: (label: string) => string;
  tableFilterDateFrom: string;
  tableFilterDateTo: string;
  tableFilterDateInvalid: string;

  scannerManualLabel: string;
  scannerManualPlaceholder: string;
  scannerSubmit: string;
  /** `BarcodeScannerField`'s submit, a desk action: "Catat". */
  scannerFieldSubmit: string;
  scannerCamera: string;
  scannerCameraStart: string;
  scannerCameraStop: string;
  scannerCameraClose: string;
  scannerCameraDone: string;
  scannerCameraStarting: string;
  scannerCameraHint: string;
  /** Under "turn the camera on": when the camera runs. */
  scannerCameraIdleHint: string;
  scannerCameraDeniedTitle: string;
  scannerCameraDeniedDescription: string;
  scannerCameraUnavailableTitle: string;
  scannerCameraUnavailableDescription: string;
  scannerCameraErrorTitle: string;
  scannerCameraErrorDescription: string;
  scannerRetry: string;
  scannerManualEntry: string;
  scannerManualHide: string;
  /** Status chip while a USB or Bluetooth scanner can type into the page. */
  scannerReady: string;

  qrCode: string;
  qrExpired: string;
  qrExpiresIn: (seconds: number) => string;
  qrRenew: string;
  /** Lead-in above the typed fallback code under a QR. */
  qrManualCode: string;
}

export const DEFAULT_FORMS_DATA_UI_LABELS: FormsDataUiLabels = {
  fieldOptional: "(opsional)",
  formErrorTitle: "Periksa kembali isian berikut",

  passwordShow: "Tampilkan kata sandi",
  passwordHide: "Sembunyikan kata sandi",
  passwordCapsLock: "Caps Lock aktif",
  searchClear: "Hapus pencarian",

  selectPlaceholder: "Pilih",
  comboboxPlaceholder: "Pilih",
  comboboxSearchPlaceholder: "Cari",
  comboboxLoading: "Memuat pilihan",
  comboboxEmpty: "Tidak ada pilihan yang cocok",

  tableSearchPlaceholder: "Cari",
  tableColumns: "Kolom tampil",
  tableDensity: "Kepadatan",
  tableDensityNormal: "Normal",
  tableDensityCompact: "Padat",
  tableMoreOptions: "Opsi tabel",
  tableClearSelection: "Batalkan pilihan",
  tableNoResultsTitle: "Tidak ada hasil",
  tableNoResultsDescription: "Coba kata kunci lain atau hapus pencarian.",
  tableClearSearch: "Hapus pencarian",
  tableErrorTitle: "Data gagal dimuat",
  tableErrorDescription: "Periksa koneksi internet, lalu coba lagi.",
  tableRetry: "Coba lagi",
  tableErrorCode: (code) => `Kode galat: ${code}`,
  tablePageOf: (current, total) => `Halaman ${current} dari ${total}`,
  tableRange: (from, to, total) => `${from}–${to} dari ${total}`,
  tableRangeOpen: (from, to) => `Baris ${from}–${to}`,
  tableRowCount: (count) => `${count} data`,
  tablePageSize: "Baris per halaman",
  tablePrevious: "Ke halaman sebelumnya",
  tableNext: "Ke halaman berikutnya",
  tableFiltersReset: "Reset filter",
  tableFilterRemove: (label) => `Hapus filter ${label}`,
  tableFilterDateFrom: "Dari",
  tableFilterDateTo: "Sampai",
  tableFilterDateInvalid: "Tanggal mulai harus sebelum atau sama dengan tanggal akhir",

  scannerManualLabel: "Kode",
  scannerManualPlaceholder: "Ketik atau tempel kode",
  scannerSubmit: "Kirim",
  scannerFieldSubmit: "Catat",
  scannerCamera: "Pindai dengan kamera",
  scannerCameraStart: "Nyalakan kamera",
  scannerCameraStop: "Matikan kamera",
  scannerCameraClose: "Tutup kamera",
  scannerCameraDone: "Selesai",
  scannerCameraStarting: "Menyalakan kamera",
  scannerCameraHint: "Arahkan kode ke dalam bingkai",
  scannerCameraIdleHint: "Kamera hanya menyala selama Anda memindai.",
  scannerCameraDeniedTitle: "Akses kamera ditolak",
  scannerCameraDeniedDescription:
    "Izinkan kamera di pengaturan peramban, lalu coba lagi. Kode juga bisa dimasukkan manual.",
  scannerCameraUnavailableTitle: "Kamera tidak tersedia",
  scannerCameraUnavailableDescription:
    "Perangkat ini tidak punya kamera yang bisa dipakai. Masukkan kode secara manual.",
  scannerCameraErrorTitle: "Kamera tidak bisa dinyalakan",
  scannerCameraErrorDescription: "Tutup aplikasi lain yang memakai kamera, lalu coba lagi.",
  scannerRetry: "Coba lagi",
  scannerManualEntry: "Masukkan kode manual",
  scannerManualHide: "Tutup input manual",
  scannerReady: "Pemindai siap",

  qrCode: "Kode QR",
  qrExpired: "Kode kedaluwarsa",
  qrExpiresIn: (seconds) => `Berlaku ${seconds} detik lagi`,
  qrRenew: "Buat kode baru",
  qrManualCode: "Tidak bisa memindai? Pakai kode ini",
};

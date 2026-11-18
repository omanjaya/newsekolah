"use client";

import { UiLabelsProvider, type UiLabels } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, type ReactElement, type ReactNode } from "react";

/**
 * The BCP 47 locale the shared date, time and number controls format
 * with. English keeps day-month order and the 24-hour clock schools use.
 */
function formatLocale(locale: string): string {
  return locale === "en" ? "en-GB" : "id-ID";
}

/**
 * Every built-in string of packages/ui, from next-intl: the generic words
 * from `common`, the rest from `app.shell.controls`. Typed as the whole
 * `UiLabels`, not a partial one, so a key added to the package fails the
 * typecheck here until it is translated, instead of staying Indonesian in
 * English. Exported for its test.
 */
export function useAppUiLabels(): UiLabels {
  const locale = useLocale();
  const actions = useTranslations("common.actions");
  const states = useTranslations("common.states");
  const confirm = useTranslations("common.confirmDialog");
  const table = useTranslations("app.shell.table");
  const t = useTranslations("app.shell.controls");

  return useMemo<UiLabels>(
    () => ({
      locale: formatLocale(locale),
      dialogClose: actions("close"),
      sheetClose: actions("close"),
      tableSelectedRows: (count) => table("selectedRows", { count }),
      tableSelectAllRows: table("selectAllRows"),
      tableSelectRow: table("selectRow"),

      fieldOptional: t("field.optional"),
      fieldRequired: t("field.required"),
      formErrorTitle: t("field.formErrorTitle"),
      passwordShow: t("password.show"),
      passwordHide: t("password.hide"),
      passwordCapsLock: t("password.capsLock"),
      searchClear: t("search.clear"),
      selectPlaceholder: t("select.placeholder"),
      comboboxPlaceholder: t("combobox.placeholder"),
      comboboxSearchPlaceholder: t("combobox.searchPlaceholder"),
      comboboxLoading: t("combobox.loading"),
      comboboxEmpty: t("combobox.empty"),

      tableSearchPlaceholder: t("table.searchPlaceholder"),
      tableColumns: t("table.columns"),
      tableDensity: t("table.density"),
      tableDensityNormal: t("table.densityNormal"),
      tableDensityCompact: t("table.densityCompact"),
      tableMoreOptions: t("table.moreOptions"),
      tableClearSelection: t("table.clearSelection"),
      tableEmptyTitle: t("table.emptyTitle"),
      tableNoResultsTitle: t("table.noResultsTitle"),
      tableNoResultsDescription: t("table.noResultsDescription"),
      tableClearSearch: t("table.clearSearch"),
      tableErrorTitle: t("table.errorTitle"),
      tableErrorDescription: t("table.errorDescription"),
      tableRetry: t("table.retry"),
      tableErrorCode: (code) => t("table.errorCode", { code }),
      tablePageOf: (current, total) => t("table.pageOf", { current, total }),
      tableRange: (from, to, total) => t("table.range", { from, to, total }),
      tableRangeOpen: (from, to) => t("table.rangeOpen", { from, to }),
      tableRowCount: (count) => t("table.rowCount", { count }),
      tablePageSize: t("table.pageSize"),
      tablePrevious: t("table.previous"),
      tableNext: t("table.next"),
      tableFiltersReset: t("table.filtersReset"),
      tableFilterRemove: (label) => t("table.filterRemove", { label }),
      tableFilterDateFrom: t("table.filterDateFrom"),
      tableFilterDateTo: t("table.filterDateTo"),
      tableFilterDateInvalid: t("table.filterDateInvalid"),

      scannerManualLabel: t("scanner.manualLabel"),
      scannerManualPlaceholder: t("scanner.manualPlaceholder"),
      scannerSubmit: t("scanner.submit"),
      scannerFieldSubmit: t("scanner.fieldSubmit"),
      scannerCamera: t("scanner.camera"),
      scannerCameraStart: t("scanner.cameraStart"),
      scannerCameraStop: t("scanner.cameraStop"),
      scannerCameraClose: t("scanner.cameraClose"),
      scannerCameraDone: t("scanner.cameraDone"),
      scannerCameraStarting: t("scanner.cameraStarting"),
      scannerCameraHint: t("scanner.cameraHint"),
      scannerCameraIdleHint: t("scanner.cameraIdleHint"),
      scannerCameraDeniedTitle: t("scanner.cameraDeniedTitle"),
      scannerCameraDeniedDescription: t("scanner.cameraDeniedDescription"),
      scannerCameraUnavailableTitle: t("scanner.cameraUnavailableTitle"),
      scannerCameraUnavailableDescription: t("scanner.cameraUnavailableDescription"),
      scannerCameraErrorTitle: t("scanner.cameraErrorTitle"),
      scannerCameraErrorDescription: t("scanner.cameraErrorDescription"),
      scannerRetry: t("scanner.retry"),
      scannerManualEntry: t("scanner.manualEntry"),
      scannerManualHide: t("scanner.manualHide"),
      scannerReady: t("scanner.ready"),

      qrCode: t("qr.code"),
      qrExpired: t("qr.expired"),
      qrExpiresIn: (seconds) => t("qr.expiresIn", { seconds }),
      qrRenew: t("qr.renew"),
      qrManualCode: t("qr.manualCode"),

      calendarPreviousMonth: t("calendar.previousMonth"),
      calendarNextMonth: t("calendar.nextMonth"),
      calendarPreviousYear: t("calendar.previousYear"),
      calendarNextYear: t("calendar.nextYear"),
      calendarChooseMonth: (caption) => t("calendar.chooseMonth", { caption }),
      calendarChooseYear: (year) => t("calendar.chooseYear", { year }),
      calendarPreviousYears: t("calendar.previousYears"),
      calendarNextYears: t("calendar.nextYears"),
      datePickerPlaceholder: t("picker.datePlaceholder"),
      datePickerClear: t("picker.dateClear"),
      dateRangePickerPlaceholder: t("picker.rangePlaceholder"),
      dateRangePickerClear: t("picker.rangeClear"),
      dateRangePickerPickStart: t("picker.rangePickStart"),
      dateRangePickerPickEnd: t("picker.rangePickEnd"),
      dateRangePickerPresets: t("picker.rangePresets"),
      monthPickerPlaceholder: t("picker.monthPlaceholder"),
      monthPickerClear: t("picker.monthClear"),
      timePickerPlaceholder: t("picker.timePlaceholder"),
      timePickerShowOptions: t("picker.timeShowOptions"),
      timePickerOptions: t("picker.timeOptions"),
      numberInputIncrement: t("picker.numberIncrement"),
      numberInputDecrement: t("picker.numberDecrement"),

      // Surfaces and content.
      breadcrumbLabel: t("page.breadcrumb"),
      pageHeaderMoreActions: t("page.moreActions"),
      avatarGroupMore: (count) => t("avatar.groupMore", { count }),
      dataListNoValue: t("dataList.noValue"),
      loading: states("loading"),
      emptyFilteredTitle: t("empty.filteredTitle"),
      emptyFilteredDescription: t("empty.filteredDescription"),
      emptyFilteredReset: t("empty.filteredReset"),
      statePageCode: (code) => t("statePage.code", { code }),
      alertDismiss: t("alert.dismiss"),
      statDeltaUp: t("stat.deltaUp"),
      statDeltaDown: t("stat.deltaDown"),
      statDeltaFlat: t("stat.deltaFlat"),
      linkOpensInNewTab: t("link.opensInNewTab"),

      // Overlays, navigation and feedback.
      confirmDialogConfirm: confirm("defaultConfirmLabel"),
      confirmDialogCancel: confirm("defaultCancelLabel"),
      toastClose: t("toast.close"),
      toastRegion: t("toast.region"),
      commandPaletteLabel: t("commandPalette.label"),
      commandPalettePlaceholder: t("commandPalette.placeholder"),
      commandPaletteEmpty: t("commandPalette.empty"),
      commandPaletteHintMove: t("commandPalette.hintMove"),
      commandPaletteHintOpen: t("commandPalette.hintOpen"),
      commandPaletteHintClose: t("commandPalette.hintClose"),
      commandPaletteCancel: t("commandPalette.cancel"),
      stepperStepComplete: t("stepper.complete"),
      stepperStepStopped: t("stepper.stopped"),
    }),
    [actions, confirm, locale, states, t, table],
  );
}

/**
 * Shared controls inherit the application locale, including legacy call
 * sites: every built-in string of packages/ui (dialogs, toasts, tables,
 * fields, pickers, the scanner, the QR panel, the command palette) comes
 * from next-intl through `useAppUiLabels`.
 */
export function UiLocaleProvider({ children }: { children: ReactNode }): ReactElement {
  const labels = useAppUiLabels();
  return <UiLabelsProvider labels={labels}>{children}</UiLabelsProvider>;
}

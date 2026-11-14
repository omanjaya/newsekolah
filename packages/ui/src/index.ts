export { cn } from "./utils/cn.js";
export { domainIcons, type DomainIconName } from "./icons.js";

export { Button, type ButtonProps } from "./components/button.js";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  type CardHeaderProps,
  type CardPadding,
  type CardProps,
  type CardTitleProps,
  type CardTone,
} from "./components/card.js";
export { SectionHeader, type SectionHeaderProps } from "./components/section-header.js";
export { List, type ListProps, type ListVariant } from "./components/list.js";
export { ListRow, type ListRowProps } from "./components/list-row.js";
export {
  DataList,
  DataListItem,
  type DataListItemProps,
  type DataListLayout,
  type DataListProps,
} from "./components/data-list.js";
export {
  TextLink,
  type TextLinkProps,
  type TextLinkTone,
  type TextLinkVariant,
} from "./components/text-link.js";
export {
  UiLinkProvider,
  useUiLink,
  type UiLinkComponent,
  type UiLinkProps,
} from "./components/ui-link.js";
export { IconCircle, type IconCircleProps, type IconCircleSize } from "./components/icon-circle.js";
export type { CategoryTone, SemanticTone, Tone } from "./components/tone.js";
export { IconButton, type IconButtonProps } from "./components/icon-button.js";
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type TableDensity,
  type TableProps,
} from "./components/table.js";
export { Input, type InputProps } from "./components/input.js";
export { SearchInput } from "./components/search-input.js";
export { UiLabelsProvider, useUiLabels, type UiLabels } from "./components/ui-labels.js";

export {
  BarcodeScannerField,
  type BarcodeScannerFieldProps,
  type BarcodeScanEvent,
  type BarcodeScanSource,
  type ScanHandlerResult,
} from "./components/barcode-scanner-field.js";
export {
  useBarcodeScanner,
  isScanBurst,
  type UseBarcodeScannerOptions,
} from "./hooks/use-barcode-scanner.js";
export { createDuplicateScanGuard, type DuplicateScanGuard } from "./hooks/duplicate-scan-guard.js";
export { useActiveIndicator } from "./hooks/use-active-indicator.js";
export {
  collapsedTitleStore,
  useCollapsedTitle,
  useCollapsingTitle,
  type CollapsedTitle,
} from "./hooks/use-collapsing-title.js";
export { useCountUp, type UseCountUpOptions } from "./hooks/use-count-up.js";
export { useHydrated } from "./hooks/use-hydrated.js";
export { useMediaQuery } from "./hooks/use-media-query.js";
export { useScanFeedback, type ScanFeedback } from "./hooks/use-scan-feedback.js";
export { useScrollEdges, type UseScrollEdgesOptions } from "./hooks/use-scroll-edges.js";
export { Textarea, type TextareaProps } from "./components/textarea.js";
export { Select, type SelectOption, type SelectProps } from "./components/select.js";
export { Combobox, type ComboboxOption, type ComboboxProps } from "./components/combobox.js";
export { useDebouncedCallback } from "./components/data-table/use-debounced-callback.js";
export { Checkbox, type CheckboxProps } from "./components/checkbox.js";
export {
  Calendar,
  nextDateRange,
  type CalendarDayInfo,
  type CalendarLayout,
  type CalendarProps,
  type CalendarRangeProps,
  type CalendarSingleProps,
  type DateRange,
} from "./components/calendar.js";
export { DatePicker, type DatePickerProps } from "./components/date-picker.js";
export {
  DateRangePicker,
  type DateRangePickerProps,
  type DateRangePreset,
} from "./components/date-range-picker.js";
export { MonthPicker, type MonthPickerProps } from "./components/month-picker.js";
export { TimePicker, type TimePickerProps } from "./components/time-picker.js";
export { NumberInput, type NumberInputProps } from "./components/number-input.js";
export {
  RadioGroup,
  RadioGroupItem,
  type RadioGroupItemProps,
  type RadioGroupProps,
  type RadioGroupVariant,
} from "./components/radio-group.js";
export {
  SegmentedControl,
  type SegmentedControlOption,
  type SegmentedControlProps,
  type SegmentedControlSize,
} from "./components/segmented-control.js";
export { Switch, type SwitchProps } from "./components/switch.js";
export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  type FormProps,
} from "./components/form.js";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  type DialogContentProps,
  type DialogSize,
} from "./components/dialog.js";
export { ConfirmDialog, type ConfirmDialogProps } from "./components/confirm-dialog.js";
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetTrigger,
  type SheetContentProps,
  type SheetSide,
  type SheetSize,
} from "./components/sheet.js";
export {
  Toaster,
  toast,
  useToast,
  type ToastActionOptions,
  type ToastApi,
  type ToastOptions,
  type ToasterProps,
} from "./components/toast.js";
export { Alert, type AlertProps, type AlertVariant } from "./components/alert.js";
export {
  Badge,
  badgeClassName,
  type BadgeAppearance,
  type BadgeProps,
  type BadgeSize,
  type BadgeTone,
} from "./components/badge.js";
export { CountBadge, type CountBadgeProps, type CountBadgeTone } from "./components/count-badge.js";
export { StatusBadge, type StatusBadgeProps, type StatusName } from "./components/status-badge.js";
export {
  SEMANTIC_STATUS_TOKEN,
  SEMANTIC_STATUS_TONE,
  SemanticStatusBadge,
  semanticStatusToken,
  semanticStatusTone,
  type SemanticStatus,
  type SemanticStatusBadgeProps,
} from "./components/semantic-status.js";
export {
  Avatar,
  type AvatarPixelSize,
  type AvatarProps,
  type AvatarSize,
  type AvatarTone,
} from "./components/avatar.js";
export { AvatarGroup, type AvatarGroupProps } from "./components/avatar-group.js";
export { Skeleton } from "./components/skeleton.js";
export {
  SkeletonCards,
  SkeletonDetail,
  SkeletonForm,
  SkeletonList,
  type SkeletonCardsProps,
  type SkeletonDetailProps,
  type SkeletonFormProps,
  type SkeletonListProps,
} from "./components/skeleton-presets.js";
export {
  Stat,
  StatGrid,
  type StatAppearance,
  type StatCategory,
  type StatDelta,
  type StatGridProps,
  type StatGridVariant,
  type StatProps,
} from "./components/stat.js";
export { HeroCard, type HeroCardProps, type HeroCardTone } from "./components/hero-card.js";
export { StatTile, type StatTileProps, type StatTileTone } from "./components/stat-tile.js";
export {
  EmptyState,
  EmptyStateInlineScope,
  type EmptyStateProps,
  type EmptyStateVariant,
} from "./components/empty-state.js";
export {
  FilteredEmptyState,
  type FilteredEmptyStateProps,
} from "./components/filtered-empty-state.js";
export { StatePage, type StatePageKind, type StatePageProps } from "./components/state-page.js";
export { SafeHtml, type SafeHtmlProps } from "./components/safe-html.js";
export {
  PageHeader,
  type PageHeaderAction,
  type PageHeaderBreadcrumbItem,
  type PageHeaderProps,
} from "./components/page-header.js";
export { Breadcrumb, type BreadcrumbItem, type BreadcrumbProps } from "./components/breadcrumb.js";
export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type TabsListProps,
  type TabsSize,
  type TabsTriggerProps,
  type TabsVariant,
} from "./components/tabs.js";
export {
  NavTabs,
  type NavTabsItem,
  type NavTabsLinkProps,
  type NavTabsProps,
} from "./components/nav-tabs.js";
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/tooltip.js";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  type DropdownMenuItemProps,
} from "./components/dropdown-menu.js";
export {
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "./components/popover.js";
export {
  RowActionsMenu,
  type RowActionsMenuItem,
  type RowActionsMenuProps,
} from "./components/row-actions-menu.js";
export {
  Progress,
  type ProgressMarker,
  type ProgressProps,
  type ProgressTone,
} from "./components/progress.js";
export { Kbd } from "./components/kbd.js";
export { StickySaveBar, type StickySaveBarProps } from "./components/sticky-save-bar.js";
export {
  CommandPalette,
  type CommandPaletteGroup,
  type CommandPaletteItem,
  type CommandPaletteProps,
} from "./components/command-palette.js";
export {
  Stepper,
  type StepperProps,
  type StepperStep,
  type StepperStepState,
} from "./components/stepper.js";
export { QrPanel, type QrPanelProps } from "./components/qr-panel.js";
export {
  DataTable,
  DataTableFilters,
  DataTablePagination,
  DataTableToolbar,
  DataTableStateProvider,
  DEFAULT_DATA_TABLE_FILTERS_LABELS,
  selectionColumn,
  type DataTableDateRangePreset,
  type DataTableFilterDef,
  type DataTableFilterOption,
  type DataTableFiltersLabels,
  type DataTableFiltersProps,
  type DataTableLocalState,
  type DataTableProps,
} from "./components/data-table/index.js";

// Forms and data (overhaul wave 2, stream 3).
export {
  DataTableErrorState,
  type DataTableCardRole,
  type DataTableCursorPagination,
  type DataTableErrorStateProps,
  type DataTablePaginationLabels,
  type DataTableToolbarLabels,
} from "./components/data-table/index.js";
export {
  Field,
  FieldError,
  type FieldOrientation,
  type FieldProps,
  type FieldRenderProps,
} from "./components/field.js";
export { useFieldControl, type FieldControl } from "./components/field-context.js";
export {
  FormActions,
  FormError,
  FormSection,
  type FormActionsProps,
  type FormErrorProps,
  type FormSectionProps,
} from "./components/form-layout.js";
export { PasswordInput, type PasswordInputProps } from "./components/password-input.js";
export { type SearchInputProps } from "./components/search-input.js";
export { type FieldSize } from "./components/field-styles.js";
export { Scanner, type ScannerProps, type ScannerVariant } from "./components/scanner.js";
export {
  ScannerResultBanner,
  type ScannerResultTone,
  type ScannerResultValue,
} from "./components/scanner-result.js";
export {
  isCameraSupported,
  queryCameraPermission,
  useCameraScanner,
  type CameraStatus,
  type UseCameraScannerOptions,
} from "./hooks/use-camera-scanner.js";
export { QrPanelSkeleton } from "./components/qr-panel.js";
export { TableFooter } from "./components/table.js";

// Surfaces and content (overhaul wave 2, stream 1, review fixes).
export { UiLink } from "./components/ui-link.js";
export {
  FirstUseEmptyState,
  type FirstUseEmptyStateProps,
} from "./components/first-use-empty-state.js";

// Forms and data review fixes (wave 2).
export type { BarcodeScannerHandle } from "./hooks/use-barcode-scanner.js";

// Page template (overhaul wave 3, stream A).
export { PageShell, type PageShellProps, type PageShellVariant } from "./components/page-shell.js";
export type { DataTableSkeletonShape } from "./components/data-table/index.js";

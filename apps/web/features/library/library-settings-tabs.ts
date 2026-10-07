import { navigation } from "../../lib/navigation";

export type LibrarySettingsTab = "loanRules" | "memberTypes" | "masterData";

export const LIBRARY_SETTINGS_TABS: readonly LibrarySettingsTab[] = [
  "loanRules",
  "memberTypes",
  "masterData",
];

/** Registry entry of the standalone page each tab replaces, so permissions stay single-sourced. */
const TAB_NAV_KEY: Record<LibrarySettingsTab, string> = {
  loanRules: "library-loan-rules",
  memberTypes: "library-member-types",
  masterData: "library-master-data",
};

/** Tabs the reader may open, in display order. */
export function visibleLibrarySettingsTabs(
  can: (permission: string) => boolean,
): LibrarySettingsTab[] {
  return LIBRARY_SETTINGS_TABS.filter((tab) => {
    const permission = navigation.find((item) => item.key === TAB_NAV_KEY[tab])?.permission;
    return !permission || can(permission);
  });
}

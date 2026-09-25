// Hijau Segar typography: Manrope for headings and numbers, Plus Jakarta
// Sans for body copy (docs/design-reference-hijau-segar.html). Both are
// loaded on every platform (unlike the old Inter setup this replaces, which
// only loaded on Android and let iOS fall back to the system font) so the
// look is identical across iOS and Android.
import {
  useFonts,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";

export const fontFamily = {
  headingSemibold: "Manrope_600SemiBold",
  headingBold: "Manrope_700Bold",
  headingExtrabold: "Manrope_800ExtraBold",
  bodyRegular: "PlusJakartaSans_400Regular",
  bodyMedium: "PlusJakartaSans_500Medium",
  bodySemibold: "PlusJakartaSans_600SemiBold",
  bodyBold: "PlusJakartaSans_700Bold",
} as const;

const FONT_MAP = {
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
};

/** Mounted once at the app root (see src/app/_layout.tsx); gates the first
 * render behind the splash screen until both families are ready. */
export function useLoadThemeFonts(): boolean {
  const [loaded] = useFonts(FONT_MAP);
  return loaded;
}

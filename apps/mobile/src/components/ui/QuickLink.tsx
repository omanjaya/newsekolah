import { Pressable, Text } from "react-native";
import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";

interface QuickLinkProps {
  icon: LucideIcon;
  label: string;
  href: string;
}

/** One tile in a row of role shortcuts (home screen, library desk, ...):
 * icon over a short label, min 44pt tall per DESIGN.md. */
export function QuickLink({ icon: Icon, label, href }: QuickLinkProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      className="flex-1 items-center gap-2 rounded-input border border-line bg-surface px-2 py-3 dark:border-line-dark dark:bg-surface-dark"
    >
      <Icon size={22} strokeWidth={1.75} color="#1F3A5F" />
      <Text className="text-center text-xs text-ink dark:text-ink-dark">{label}</Text>
    </Pressable>
  );
}

import {
  ActivityIndicator,
  Pressable,
  Text,
  useColorScheme,
  type GestureResponderEvent,
} from "react-native";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getAccentColors } from "@/theme/accent";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

interface ButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  testID?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent",
  secondary: "bg-surface dark:bg-surface-dark border border-line dark:border-line-dark",
  ghost: "bg-transparent",
  destructive: "bg-status-absent",
};

const VARIANT_TEXT_CLASSES: Record<ButtonVariant, string> = {
  primary: "text-accent-fg",
  secondary: "text-ink dark:text-ink-dark",
  ghost: "text-accent",
  destructive: "text-white",
};

/** Minimum 44pt tap target per DESIGN.md; radius 4 (no pill buttons). */
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  fullWidth = false,
  testID,
}: ButtonProps): React.JSX.Element {
  const { me } = useAuth();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const isDisabled = disabled || loading;
  const accentForeground = getAccentColors(me?.tenant.accent_color, colorScheme).foreground;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      className={cn(
        "min-h-11 flex-row items-center justify-center rounded-input px-4",
        VARIANT_CLASSES[variant],
        fullWidth && "w-full",
        isDisabled && "opacity-50",
      )}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === "primary"
              ? accentForeground
              : variant === "destructive"
                ? "#FFFFFF"
                : "#0F7A5F"
          }
        />
      ) : (
        <Text className={cn("text-base font-medium", VARIANT_TEXT_CLASSES[variant])}>{label}</Text>
      )}
    </Pressable>
  );
}

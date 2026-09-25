import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/cn";
import { tShared } from "@/i18n/t";

export type ToastVariant = "default" | "success" | "error";

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastMessage {
  id: number;
  text: string;
  description?: string;
  variant: ToastVariant;
  action?: ToastAction;
}

// Module-level pub-sub so any lib/feature code can raise a toast without
// threading a context through every screen. Kept intentionally tiny.
let nextId = 0;
let listener: ((message: ToastMessage) => void) | null = null;

export function showToast(
  text: string,
  variant: ToastVariant = "default",
  options?: { description?: string; action?: ToastAction },
): void {
  nextId += 1;
  listener?.({
    id: nextId,
    text,
    description: options?.description,
    variant,
    action: options?.action,
  });
}

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: "bg-ink dark:bg-ink-dark",
  success: "bg-accent",
  error: "bg-status-absent",
};

const VARIANT_ICON: Record<ToastVariant, typeof CheckCircle2> = {
  default: Info,
  success: CheckCircle2,
  error: AlertCircle,
};

/** Errors carry more to read (and sometimes a retry action), so they hold
 * long enough to actually read -- everything else auto-dismisses quickly,
 * same as web's toast (packages/ui/src/components/toast.tsx). */
const VISIBLE_MS: Record<ToastVariant, number> = {
  default: 3000,
  success: 3000,
  error: 8000,
};

/** Mount once near the app root. Renders above the tab bar, not centered on
 * screen, so it never blocks the primary action the user just took --
 * still dismissible early via the close button, though, never fully
 * blocking either. */
export function ToastHost(): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<ToastMessage | null>(null);

  useEffect(() => {
    listener = (next) => setMessage(next);
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), VISIBLE_MS[message.variant]);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  const Icon = VARIANT_ICON[message.variant];
  const isError = message.variant === "error";

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-4 items-center"
      style={{ bottom: insets.bottom + 72 }}
    >
      <View
        className={cn(
          "max-w-full flex-row items-start gap-2 rounded-card px-4 py-3",
          VARIANT_CLASSES[message.variant],
        )}
        accessibilityRole={isError ? "alert" : undefined}
        accessibilityLiveRegion={isError ? "assertive" : "polite"}
      >
        <Icon size={18} color="white" style={{ marginTop: 2 }} />
        <View className="shrink flex-1 gap-1">
          <Text className="text-base text-white">{message.text}</Text>
          {message.description ? (
            <Text className="text-sm text-white/80">{message.description}</Text>
          ) : null}
          {message.action ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              className="mt-1 self-start"
              onPress={() => {
                message.action?.onPress();
                setMessage(null);
              }}
            >
              <Text className="text-sm font-medium text-white underline">
                {message.action.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tShared("common.actions.close")}
          hitSlop={8}
          onPress={() => setMessage(null)}
        >
          <X size={16} color="white" />
        </Pressable>
      </View>
    </View>
  );
}

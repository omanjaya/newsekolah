import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ToastVariant = "default" | "success" | "error";

interface ToastMessage {
  id: number;
  text: string;
  variant: ToastVariant;
}

// Module-level pub-sub so any lib/feature code can raise a toast without
// threading a context through every screen. Kept intentionally tiny.
let nextId = 0;
let listener: ((message: ToastMessage) => void) | null = null;

export function showToast(text: string, variant: ToastVariant = "default"): void {
  nextId += 1;
  listener?.({ id: nextId, text, variant });
}

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: "bg-ink dark:bg-ink-dark",
  success: "bg-accent",
  error: "bg-status-absent",
};

const TOAST_VISIBLE_MS = 3000;

/** Mount once near the app root. Renders above the tab bar, not centered on
 * screen, so it never blocks the primary action the user just took. */
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
    const timer = setTimeout(() => setMessage(null), TOAST_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <View
      pointerEvents="none"
      className="absolute inset-x-4 items-center"
      style={{ bottom: insets.bottom + 72 }}
    >
      <View
        className={`max-w-full rounded-card px-4 py-3 ${VARIANT_CLASSES[message.variant]}`}
        accessibilityLiveRegion="polite"
      >
        <Text className="text-base text-white">{message.text}</Text>
      </View>
    </View>
  );
}

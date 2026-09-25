import { useEffect, useState, type PropsWithChildren } from "react";
import { AccessibilityInfo, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface SheetProps extends PropsWithChildren {
  visible: boolean;
  onClose: () => void;
  title?: string;
  closeLabel?: string;
}

/** Bottom sheet, not a centered dialog, per DESIGN.md. Closes on backdrop tap
 * and Android back button (Modal's onRequestClose); respects
 * prefers-reduced-motion by skipping the slide transition. */
export function Sheet({
  visible,
  onClose,
  title,
  closeLabel = "Tutup",
  children,
}: SheetProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => subscription.remove();
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? "none" : "slide"}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        className="flex-1 justify-end bg-black/40"
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          accessibilityViewIsModal
          className="rounded-t-dialog bg-surface dark:bg-surface-dark"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <View className="items-center pt-2">
            <View className="h-1 w-10 rounded-full bg-line dark:bg-line-dark" />
          </View>
          {title ? (
            <View className="px-4 pt-3" accessibilityRole="header">
              <Text className="font-heading-semibold text-md text-ink dark:text-ink-dark">
                {title}
              </Text>
            </View>
          ) : null}
          <View className="px-4 pt-3">{children}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { cn } from "@/lib/cn";

interface SkeletonProps {
  className?: string;
  height?: number;
  width?: number | `${number}%`;
}

/** Placeholder block shown for at most ~1s while content loads (DESIGN.md:
 * no shimmer past that). A single opacity pulse, not a moving shimmer band. */
export function Skeleton({
  className,
  height = 16,
  width = "100%",
}: SkeletonProps): React.JSX.Element {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled || reduceMotion) return;
        opacity.value = withRepeat(
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          -1,
          true,
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[style, { height, width }]}
      className={cn("rounded-card bg-line dark:bg-line-dark", className)}
    />
  );
}

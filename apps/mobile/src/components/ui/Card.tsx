import { View, type ViewProps } from "react-native";
import { cn } from "@/lib/cn";

interface CardProps extends ViewProps {
  className?: string;
  children: React.ReactNode;
}

/** The one card shape used across the app (Hijau Segar: radius 20, a 1px
 * hairline ring rather than a shadow-only card). Screens compose their own
 * padding/gap on top through `className`. */
export function Card({ className, children, ...rest }: CardProps): React.JSX.Element {
  return (
    <View
      className={cn(
        "rounded-card border border-hairline bg-surface dark:border-hairline-dark dark:bg-surface-dark",
        className,
      )}
      {...rest}
    >
      {children}
    </View>
  );
}

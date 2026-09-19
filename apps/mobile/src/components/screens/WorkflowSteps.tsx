import { Text, View } from "react-native";
import type { WorkflowInstance } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { t, type MobileMessageKey } from "@/i18n/t";

/** Compact stage list: done, current, upcoming. */
export function WorkflowSteps({ instance }: { instance: WorkflowInstance }): React.JSX.Element {
  const done = instance.status !== "in_progress";
  const current = done ? instance.stages.length : instance.current_stage_index;
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-accent">
        {t(`permits.status.${instance.status}` as MobileMessageKey)}
      </Text>
      {instance.stages.map((stage, index) => {
        const state = index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <View key={stage.key} className="flex-row items-center gap-2">
            <View
              className={cn(
                "h-3 w-3 rounded-full",
                state === "done"
                  ? "bg-accent"
                  : state === "current"
                    ? "border-2 border-accent"
                    : "border border-line dark:border-line-dark",
              )}
            />
            <Text
              className={cn(
                "text-sm",
                state === "upcoming"
                  ? "text-ink/50 dark:text-ink-dark/50"
                  : "text-ink dark:text-ink-dark",
              )}
            >
              {stage.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

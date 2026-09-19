import { forwardRef } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { cn } from "@/lib/cn";

interface InputProps extends Omit<TextInputProps, "className"> {
  label: string;
  error?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, onBlur, accessibilityLabel, accessibilityHint, ...textInputProps },
  ref,
) {
  const showError = Boolean(error);

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-ink dark:text-ink-dark">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={error ?? accessibilityHint}
        placeholderTextColor="#8A8A8A"
        onBlur={(event) => {
          onBlur?.(event);
        }}
        className={cn(
          "min-h-11 rounded-input border px-3 text-base text-ink dark:text-ink-dark",
          "bg-surface dark:bg-surface-dark",
          showError ? "border-status-absent" : "border-line dark:border-line-dark",
        )}
        {...textInputProps}
      />
      {showError ? (
        <Text accessibilityRole="alert" className="text-xs text-status-absent">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

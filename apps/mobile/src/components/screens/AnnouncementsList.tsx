import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Megaphone, Pin } from "lucide-react-native";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMarkAnnouncementRead, useMyAnnouncements } from "@/lib/api/hooks";
import { t } from "@/i18n/t";
import { cn } from "@/lib/cn";

/** Strips tags from the sanitised HTML body for a plain-text native view. */
function toText(html: string): string {
  return html
    .replace(/<\/(p|div|li|br)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function AnnouncementsList({ limit }: { limit?: number }): React.JSX.Element {
  const { data, isLoading } = useMyAnnouncements();
  const markRead = useMarkAnnouncementRead();
  const [open, setOpen] = useState<string | null>(null);
  const items = (data?.data ?? []).slice(0, limit);

  if (isLoading) {
    return (
      <View className="gap-2 px-4">
        <Skeleton height={56} />
        <Skeleton height={56} />
      </View>
    );
  }
  if (items.length === 0) {
    return <EmptyState icon={Megaphone} title={t("home.no_announcements")} />;
  }
  return (
    <View className="gap-2 px-4">
      {items.map((item) => {
        const expanded = open === item.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => {
              setOpen(expanded ? null : item.id);
              if (!item.is_read) markRead.mutate(item.id);
            }}
            className={cn(
              "rounded-input border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark",
              !item.is_read && "border-l-2 border-l-accent",
            )}
          >
            <View className="flex-row items-center gap-2">
              {item.is_pinned ? <Pin size={14} color="#1F3A5F" /> : null}
              <Text
                className={cn("flex-1 text-base text-ink dark:text-ink-dark", !item.is_read && "font-medium")}
                numberOfLines={expanded ? undefined : 1}
              >
                {item.title}
              </Text>
            </View>
            {expanded ? (
              <Text className="mt-2 text-sm text-ink/80 dark:text-ink-dark/80">{toText(item.body_html)}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

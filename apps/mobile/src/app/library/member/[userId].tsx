import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { BookX } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLibraryTitle, useMemberLoans, useResolveCopyBarcode } from "@/lib/api/hooks";
import type { LibraryLoan } from "@/lib/api/hooks";
import { t } from "@/i18n/t";

function isOverdue(loan: LibraryLoan): boolean {
  return loan.status === "active" && new Date(loan.due_on) < new Date();
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function LoanRow({ loan }: { loan: LibraryLoan }): React.JSX.Element {
  const title = useLibraryTitle(loan.title_id);
  const resolveBarcode = useResolveCopyBarcode();
  const overdue = isOverdue(loan);
  const isActive = loan.status === "active";

  async function returnByScan() {
    try {
      const barcode = await resolveBarcode.mutateAsync({
        titleId: loan.title_id,
        copyId: loan.copy_id,
      });
      router.push({
        pathname: "/scan",
        params: { mode: "library_return", loanId: loan.id, expectedBarcode: barcode },
      });
    } catch {
      // Error feedback comes from the mutation cache default now; this
      // only needs to stop the navigation above.
    }
  }

  const statusLine = isActive
    ? overdue
      ? t("library.overdue_badge")
      : t("library.due_on").replace("{date}", formatDate(loan.due_on))
    : loan.status === "lost"
      ? t("library.status_lost")
      : t("library.status_returned").replace("{date}", formatDate(loan.returned_at ?? loan.due_on));

  return (
    <View className="gap-2 rounded-input border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <Text className="text-base text-ink dark:text-ink-dark">
        {title.data?.title ?? t("library.loading_title")}
      </Text>
      <Text
        className={
          isActive && overdue
            ? "text-sm font-medium text-status-absent"
            : "text-sm text-ink/60 dark:text-ink-dark/60"
        }
      >
        {statusLine}
      </Text>
      {isActive ? (
        <Button
          label={t("library.return_button")}
          variant="secondary"
          loading={resolveBarcode.isPending}
          onPress={() => void returnByScan()}
        />
      ) : null}
    </View>
  );
}

export default function LibraryMemberRoute(): React.JSX.Element {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [includeReturned, setIncludeReturned] = useState(false);
  const loans = useMemberLoans(userId, includeReturned);
  const items = loans.data?.data ?? [];

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("library.member_title")} showBack />
      <View className="gap-2 px-4 pt-4">
        <Button
          label={t("library.borrow_button")}
          onPress={() =>
            router.push({
              pathname: "/scan",
              params: { mode: "library_borrow", memberUserId: userId },
            })
          }
        />
        <Button
          label={includeReturned ? t("library.hide_history") : t("library.show_history")}
          variant="ghost"
          onPress={() => setIncludeReturned((v) => !v)}
        />
      </View>
      {loans.isLoading ? (
        <View className="gap-2 p-4">
          <Skeleton height={96} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState icon={BookX} title={t("library.no_active_loans")} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {items.map((loan) => (
            <LoanRow key={loan.id} loan={loan} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

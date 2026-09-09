import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { School } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Input } from "@/components/ui/Input";
import { ListRow } from "@/components/ui/ListRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { getTenantBranding, lookupTenants } from "@/lib/api";
import { setTenantSlug } from "@/lib/tenant/tenant-store";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { t } from "@/i18n/t";
import type { TenantSummary } from "@/lib/api-types";

/** Single-tenant deployments resolve the tenant from the host, so
 * GET /v1/tenant/branding succeeds with no X-Tenant header. When it does, we
 * skip the search UI entirely and go straight to login. */
export default function SchoolPicker(): React.JSX.Element {
  const [autoChecking, setAutoChecking] = useState(true);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const searchEnabled = !autoChecking && debouncedQuery.length >= 2;

  // A ref, not a plain boolean: TypeScript narrows a closed-over `let` as
  // "never reassigned" here since the only write happens in the effect
  // cleanup, a function it never sees called from this code path.
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    void (async () => {
      try {
        const branding = await getTenantBranding();
        if (cancelledRef.current) return;
        await setTenantSlug(branding.slug);
        router.replace("/(auth)/login");
      } catch {
        if (!cancelledRef.current) setAutoChecking(false);
      }
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["tenant-lookup", debouncedQuery],
    queryFn: () => lookupTenants(debouncedQuery),
    enabled: searchEnabled,
  });

  async function choose(tenant: TenantSummary): Promise<void> {
    await setTenantSlug(tenant.slug);
    router.replace("/(auth)/login");
  }

  if (autoChecking) {
    return (
      <View className="flex-1 items-center justify-center bg-bg dark:bg-bg-dark">
        <ActivityIndicator />
      </View>
    );
  }

  const results = data?.data ?? [];

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("school_picker.title")} />
      <View className="px-4 pt-4">
        <Input
          label={t("school_picker.search_placeholder")}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
      </View>
      {searchEnabled && isFetching ? (
        <View className="items-center py-8">
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 8 }}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={item.city}
              onPress={() => void choose(item)}
              showChevron
            />
          )}
          ListEmptyComponent={
            searchEnabled ? <EmptyState icon={School} title={t("school_picker.empty")} /> : null
          }
        />
      )}
    </View>
  );
}

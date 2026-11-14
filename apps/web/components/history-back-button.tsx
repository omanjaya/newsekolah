"use client";

import { Button } from "@newsekolah/ui";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { useSyncExternalStore } from "react";

function subscribe(): () => void {
  return () => undefined;
}

/** True once mounted in a tab that has a page to go back to. */
function useCanGoBack(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.history.length > 1,
    () => false,
  );
}

/**
 * "Halaman sebelumnya" on a full-page state, for a reader who followed a
 * link to a page they cannot use. Left out in a tab opened straight onto
 * that page, where there is nothing to go back to.
 */
export function HistoryBackButton({ label }: { label: string }): ReactElement | null {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  if (!canGoBack) return null;
  return (
    <Button
      variant="secondary"
      icon={<ArrowLeft />}
      onClick={() => {
        router.back();
      }}
    >
      {label}
    </Button>
  );
}

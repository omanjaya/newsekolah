"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

/** PWA requirement: a visible, honest state while offline (docs/07-ui-ux.md section 5). */
export function OfflineIndicator(): ReactElement | null {
  const t = useTranslations("app.shell.offline");
  // Starts `false` to match the server-rendered pass (no `navigator` there);
  // the effect below corrects it immediately after mount. A lazy
  // initializer reading the real value would make the very case this
  // component exists for — a PWA opened while already offline — the exact
  // case where its first client render disagrees with the server-rendered
  // HTML, which is a worse trade than one extra render after mount.
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the note above `isOffline`'s useState.
    setIsOffline(!navigator.onLine);
    const goOffline = () => {
      setIsOffline(true);
    };
    const goOnline = () => {
      setIsOffline(false);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-line bg-warning-soft px-4 py-2 text-[13px] text-warning-soft-fg md:px-6"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      {t("banner")}
    </div>
  );
}

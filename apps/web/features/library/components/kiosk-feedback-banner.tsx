import { CheckCircle2, XCircle } from "lucide-react";
import type { ReactElement } from "react";

export interface KioskFeedback {
  kind: "success" | "refusal";
  message: string;
}

/**
 * A single large status line, readable at arm's length, that replaces a
 * toast for this screen: the kiosk has no one nearby to notice a small
 * corner notification, so the result of every scan takes over the main
 * area instead. Color is never the only signal (DESIGN.md)
 * -- the icon and the text both say which outcome happened.
 */
export function KioskFeedbackBanner({ feedback }: { feedback: KioskFeedback }): ReactElement {
  const isSuccess = feedback.kind === "success";
  return (
    <div
      role="status"
      className="flex items-center gap-4 rounded-sm border border-border bg-surface p-6"
    >
      {isSuccess ? (
        <CheckCircle2 className="size-10 shrink-0 text-status-present" aria-hidden="true" />
      ) : (
        <XCircle className="size-10 shrink-0 text-status-absent" aria-hidden="true" />
      )}
      <p
        className={
          "text-[24px] font-medium " + (isSuccess ? "text-status-present" : "text-status-absent")
        }
      >
        {feedback.message}
      </p>
    </div>
  );
}

"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Card,
  HeroCard,
  IconCircle,
  Scanner,
  useScanFeedback,
  type BarcodeScanEvent,
  type ScanHandlerResult,
  type ScannerResultValue,
} from "@newsekolah/ui";
import { BookCheck, IdCard, LogOut, ScanLine } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { todayInZone } from "../../../lib/tenant-date";
import { useBorrowLoanMutation, useReturnLoanMutation } from "../api";
import { useFindMemberByCodeMutation } from "../desk-api";
import { looksLikeMemberUserId, useKioskMemberSession } from "../kiosk-session";
import { useTenantTimeZone } from "../use-tenant-timezone";

import { KioskMemberPanel } from "./kiosk-member-panel";

/**
 * A school leaves this screen running unattended in the reading room, so
 * it must clear itself: one reader's loans must never linger for the next
 * person to see. Long enough to read a handful of due dates, short enough
 * that an idle station does not sit on one reader's session all morning.
 */
const IDLE_RESET_MS = 20_000;

interface KioskFeedback {
  tone: "success" | "danger";
  message: string;
  /** Changes on every scan, so the same message twice is announced twice. */
  key: number;
}

/** Whole seconds until `deadline`, ticking once a second while there is one. */
function useSecondsLeft(deadline: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [deadline]);
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** Tailwind `lg`: from here the scanner's side column sits beside the camera instead of under it. */
const WIDE_QUERY = "(min-width: 1024px)";

function wideQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(WIDE_QUERY)
    : null;
}

function subscribeWide(callback: () => void): () => void {
  const query = wideQuery();
  query?.addEventListener("change", callback);
  return () => {
    query?.removeEventListener("change", callback);
  };
}

function useIsWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => wideQuery()?.matches ?? false,
    () => false,
  );
}

/**
 * The self-service station in the reading room, inside the kiosk frame
 * (no app shell): a soft accent card says what to do and, once a reader
 * has scanned their card, whose session it is and when it ends by itself;
 * the shared kiosk `Scanner` takes the card and then the books (camera
 * first, a hardware scanner from anywhere, typing as the fallback), with
 * the outcome large and announced; the reader's loans sit under it. While
 * idle the card field stays open beside the camera, with a line on how to
 * scan and the privacy note, so the screen fits a landscape kiosk without
 * a scroll.
 */
export function KioskView(): ReactElement {
  const t = useTranslations("app.library.kiosk");
  const apiErrorMessage = useApiErrorMessage();
  const scanFeedback = useScanFeedback();
  const today = todayInZone(useTenantTimeZone());

  const [memberUserId, setMemberUserIdState] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<KioskFeedback | null>(null);
  const [resetAt, setResetAt] = useState<number | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackCount = useRef(0);
  // Read synchronously by the card handler: a scan queued behind a lookup
  // runs with the render it was read in, before the new session shows.
  const memberRef = useRef<string | null>(null);
  const cardLookupPending = useRef(false);
  const secondsLeft = useSecondsLeft(memberUserId ? resetAt : null);

  const session = useKioskMemberSession(memberUserId);
  const borrow = useBorrowLoanMutation();
  const returnLoan = useReturnLoanMutation();
  const findMember = useFindMemberByCodeMutation();

  const setMemberUserId = useCallback((userId: string | null) => {
    memberRef.current = userId;
    setMemberUserIdState(userId);
  }, []);

  const say = useCallback((tone: KioskFeedback["tone"], message: string) => {
    feedbackCount.current += 1;
    setFeedback({ tone, message, key: feedbackCount.current });
  }, []);

  const scheduleReset = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setResetAt(Date.now() + IDLE_RESET_MS);
    resetTimer.current = setTimeout(() => {
      setMemberUserId(null);
      setFeedback(null);
      setResetAt(null);
    }, IDLE_RESET_MS);
  }, [setMemberUserId]);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const endSession = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setMemberUserId(null);
    setFeedback(null);
    setResetAt(null);
  }, [setMemberUserId]);

  const showError = (error: unknown) => {
    scanFeedback.playError();
    say(
      "danger",
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  /**
   * The member's user ID for a card code, or null when no single member
   * has it. A printed card carries the member number, resolved by the
   * same exact-match lookup the desk uses; a user ID needs no request.
   */
  const resolveCardMember = async (code: string): Promise<string | null> => {
    if (looksLikeMemberUserId(code)) return code;
    const match = await findMember.mutateAsync(code);
    return match.status === "found" ? match.member.user_id : null;
  };

  const handleCardScan = async (event: BarcodeScanEvent): Promise<ScanHandlerResult> => {
    // A card read twice (a double scan, or a second read queued behind the
    // lookup) must neither open a second session nor replace the first.
    if (cardLookupPending.current || memberRef.current !== null) return true;
    cardLookupPending.current = true;
    try {
      const userId = await resolveCardMember(event.code.trim());
      if (userId === null) {
        scanFeedback.playError();
        say("danger", t("feedback.unknownCard"));
        scheduleReset();
        return false;
      }
      scanFeedback.playSuccess();
      setMemberUserId(userId);
      setFeedback(null);
      scheduleReset();
      return true;
    } catch (error) {
      showError(error);
      scheduleReset();
      return false;
    } finally {
      cardLookupPending.current = false;
    }
  };

  const handleBookScan = (event: BarcodeScanEvent): ScanHandlerResult => {
    if (!memberUserId) return false;
    const existingLoan = session.findLoanForBarcode(event.code);
    if (existingLoan) {
      returnLoan.mutate(
        { loanId: existingLoan.id },
        {
          onSuccess: () => {
            scanFeedback.playSuccess();
            say("success", t("feedback.returned"));
          },
          onError: showError,
        },
      );
    } else {
      borrow.mutate(
        { barcode: event.code, member_user_id: memberUserId },
        {
          onSuccess: () => {
            scanFeedback.playSuccess();
            say("success", t("feedback.borrowed"));
          },
          onError: showError,
        },
      );
    }
    scheduleReset();
    return true;
  };

  const result: ScannerResultValue | null = feedback
    ? { tone: feedback.tone, title: feedback.message, key: feedback.key }
    : null;
  const active = memberUserId !== null;
  const wide = useIsWide();

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-6 sm:px-8">
      <div className="flex w-full max-w-6xl flex-col gap-6 md:gap-8">
        {active ? (
          <HeroCard
            titleAs="h1"
            size="kiosk"
            eyebrow={t("active.eyebrow")}
            title={t("active.title")}
            meta={
              session.maxActiveLoans !== undefined
                ? t("active.limit", {
                    count: session.activeLoanCount,
                    max: session.maxActiveLoans,
                  })
                : undefined
            }
            chip={secondsLeft !== null ? t("active.resetsIn", { seconds: secondsLeft }) : undefined}
            action={
              <Button size="lg" variant="secondary" icon={<LogOut />} onClick={endSession}>
                {t("active.done")}
              </Button>
            }
          />
        ) : (
          <HeroCard
            titleAs="h1"
            size="kiosk"
            eyebrow={t("idle.eyebrow")}
            title={t("idle.title")}
            meta={t("idle.instructions")}
          >
            <ol className="mt-3 grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["card", IdCard],
                  ["books", ScanLine],
                  ["done", BookCheck],
                ] as const
              ).map(([step, Icon], index) => (
                <li key={step} className="flex items-center gap-3">
                  <IconCircle tone="accent" size="lg">
                    <Icon />
                  </IconCircle>
                  <span className="flex flex-col">
                    <span className="text-caption text-accent-soft-fg/80">
                      {t("idle.stepNumber", { number: index + 1 })}
                    </span>
                    <span className="text-heading">{t(`idle.steps.${step}`)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </HeroCard>
        )}

        <Scanner
          key={active ? "books" : "card"}
          variant="kiosk"
          fullScreen={false}
          onScan={active ? handleBookScan : handleCardScan}
          result={result}
          manualEntry={active || !wide ? true : "open"}
          manualLabel={active ? t("active.scanLabel") : t("idle.scanLabel")}
          submitLabel={active ? t("active.submit") : t("idle.submit")}
          disabled={borrow.isPending || returnLoan.isPending}
        >
          {active ? (
            <KioskMemberPanel
              session={session}
              today={today}
              heading={t("active.loansHeading")}
              dueOnLabel={(date) => t("active.dueOn", { date })}
              overdueLabel={(days) => t("active.overdue", { days })}
              emptyLabel={t("active.empty")}
            />
          ) : (
            <Card padding="md" className="hidden flex-row items-start lg:flex">
              <IconCircle tone="accent" size="lg">
                <IdCard />
              </IconCircle>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-heading text-fg">{t("idle.cardHint")}</p>
                <p className="text-body text-fg-muted">{t("idle.privacy")}</p>
              </div>
            </Card>
          )}
        </Scanner>
        {active ? null : (
          <p className="text-center text-body text-fg-muted lg:hidden">{t("idle.privacy")}</p>
        )}
      </div>
    </div>
  );
}

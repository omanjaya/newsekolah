import { useCallback, useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/ui/Toast";
import { useIssueScanToken, type IssuedScanToken, type ScanPurpose } from "@/lib/api/hooks";
import { encodeScanPayload } from "@/features/scan/payload";
import { stringField, useLiveEvent, type RealtimeMessage } from "@/lib/realtime";
import { t } from "@/i18n/t";

const PURPOSES: { purpose: ScanPurpose; label: string }[] = [
  { purpose: "classroom_entry", label: t("qr.purpose_entry") },
  { purpose: "late_arrival", label: t("qr.purpose_late") },
  { purpose: "approve_stage", label: t("qr.purpose_approve") },
];

const CLASSROOM_ENTRY_SCANNED_EVENTS = ["classroom_entry_scanned"] as const;

/** Teacher's QR: pick a purpose, show the single-use code, renew when it expires. */
export function QrSheet(): React.JSX.Element {
  const [purpose, setPurpose] = useState<ScanPurpose>("classroom_entry");
  const [permitCode, setPermitCode] = useState("");
  const issue = useIssueScanToken();

  // apps/api/internal/modules/permits/service/scantoken.go's
  // classroomEntryScannedEvent pushes to this teacher's own topic the
  // moment a student scans the code this screen is showing -- there is no
  // stored notification row for it (docs/analysis/realtime-plan-2026-09-25.md
  // section 1.5 #2 notes the web client drops it silently today), so a
  // toast here is the only place the teacher ever sees it.
  const onClassroomEntryScanned = useCallback((message: RealtimeMessage) => {
    const studentName = stringField(message, "student_name");
    if (!studentName) return;
    const className = stringField(message, "class_name");
    const text = className
      ? t("qr.entry_scanned_in_class").replace("{name}", studentName).replace("{class}", className)
      : t("qr.entry_scanned").replace("{name}", studentName);
    showToast(text, "success");
  }, []);
  useLiveEvent(CLASSROOM_ENTRY_SCANNED_EVENTS, onClassroomEntryScanned);

  function mint(next: ScanPurpose) {
    const contextId = next === "approve_stage" ? permitCode.trim() : undefined;
    if (next === "approve_stage" && !contextId) return;
    issue.mutate(
      { purpose: next, ...(contextId ? { context_id: contextId } : {}) },
      { onError: () => showToast(t("common.error"), "error") },
    );
  }

  useEffect(() => {
    if (purpose !== "approve_stage") mint(purpose);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mint once per purpose change
  }, [purpose]);

  return (
    <View className="gap-3 pb-4">
      <View className="flex-row gap-2">
        {PURPOSES.map((p) => (
          <Button
            key={p.purpose}
            label={p.label}
            variant={purpose === p.purpose ? "primary" : "secondary"}
            onPress={() => setPurpose(p.purpose)}
          />
        ))}
      </View>
      {purpose === "approve_stage" ? (
        <View className="gap-2">
          <TextInput
            value={permitCode}
            onChangeText={setPermitCode}
            placeholder={t("qr.permit_code")}
            accessibilityLabel={t("qr.permit_code")}
            autoCapitalize="none"
            autoCorrect={false}
            className="rounded-input border border-line bg-surface px-3 py-2 text-base text-ink dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark"
          />
          <Button
            label={t("qr.show")}
            onPress={() => mint("approve_stage")}
            loading={issue.isPending}
            disabled={!permitCode.trim()}
          />
        </View>
      ) : null}
      {issue.data ? (
        <TokenQr
          token={issue.data}
          purpose={purpose}
          onRenew={() => mint(purpose)}
          renewing={issue.isPending}
        />
      ) : null}
    </View>
  );
}

export function TokenQr({
  token,
  purpose,
  onRenew,
  renewing,
}: {
  token: IssuedScanToken;
  purpose: string;
  onRenew: () => void;
  renewing: boolean;
}): React.JSX.Element {
  const [secondsLeft, setSecondsLeft] = useState(() => remaining(token.expires_at));
  useEffect(() => {
    setSecondsLeft(remaining(token.expires_at));
    const timer = setInterval(() => setSecondsLeft(remaining(token.expires_at)), 1000);
    return () => clearInterval(timer);
  }, [token.expires_at]);
  const expired = secondsLeft <= 0;
  const payload = encodeScanPayload(purpose, token.context_id ?? "", token.token);
  return (
    <View className="items-center gap-3 rounded-input border border-line bg-white p-4 dark:border-line-dark">
      <View style={{ opacity: expired ? 0.25 : 1 }}>
        <QRCode value={payload} size={220} />
      </View>
      <Text className="text-sm text-ink" selectable>
        {token.token}
      </Text>
      <Text className="text-sm text-ink/60">
        {expired ? t("qr.expired") : t("qr.expires_in").replace("{seconds}", String(secondsLeft))}
      </Text>
      <Button
        label={t("qr.renew")}
        variant={expired ? "primary" : "secondary"}
        onPress={onRenew}
        loading={renewing}
      />
    </View>
  );
}

function remaining(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

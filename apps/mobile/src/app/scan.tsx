import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  useCurrentLateArrival,
  useMyExitPermits,
  useOpenLateArrival,
  useScanClassroomEntry,
  useScanExitPermitStage,
  useScanGate,
  useScanLateArrivalStage,
} from "@/lib/api/hooks";
import { decodeScanPayload } from "@/features/scan/payload";
import { t } from "@/i18n/t";

type Pending = { token: string; kind?: string; instanceId?: string } | null;

/**
 * Full-screen scanner (docs/07-ui-ux.md "Scanner"): the QR's kind decides
 * the action. Codes typed by hand have no kind, so the student picks one.
 */
export default function ScanRoute(): React.JSX.Element {
  const { activeTabGroup } = useAuth();
  const isStudent = activeTabGroup === "student";
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const permits = useMyExitPermits(isStudent);
  const late = useCurrentLateArrival(isStudent);
  const entry = useScanClassroomEntry();
  const openLate = useOpenLateArrival();
  const stage = useScanExitPermitStage();
  const lateStage = useScanLateArrivalStage();
  const gate = useScanGate();

  const activePermit = (permits.data?.data ?? []).find((p) => p.status === "in_progress");
  const activeLate = late.data?.instance.status === "in_progress" ? late.data.instance : undefined;

  async function act(kind: string | undefined, token: string, instanceId?: string) {
    if (busy) return;
    setBusy(true);
    try {
      switch (kind) {
        case "classroom_entry":
          await entry.mutateAsync(token);
          showToast(t("scan.success_entry"), "success");
          break;
        case "late_arrival":
          if (activeLate) {
            await lateStage.mutateAsync({ id: activeLate.id, token });
            showToast(t("scan.success_stage"), "success");
          } else {
            await openLate.mutateAsync({ token });
            showToast(t("scan.success_late"), "success");
          }
          break;
        case "approve":
        case "approve_stage": {
          const id = instanceId ?? activePermit?.id;
          if (id && id === activePermit?.id) {
            await stage.mutateAsync({ id, token });
          } else if (activeLate) {
            await lateStage.mutateAsync({ id: activeLate.id, token });
          } else if (id) {
            await stage.mutateAsync({ id, token });
          } else {
            showToast(t("scan.unknown"), "error");
            return;
          }
          showToast(t("scan.success_stage"), "success");
          break;
        }
        case "gate":
        case "gate_exit":
          if (!instanceId) { showToast(t("scan.unknown"), "error"); return; }
          await gate.mutateAsync({ id: instanceId, token });
          showToast(t("scan.success_gate"), "success");
          break;
        default:
          setPending({ token, kind, instanceId });
          return;
      }
      router.back();
    } catch {
      showToast(t("common.error"), "error");
    } finally {
      setBusy(false);
    }
  }

  function handleRaw(raw: string) {
    const decoded = decodeScanPayload(raw);
    void act(decoded.kind, decoded.token, decoded.instanceId);
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("scan.title")} showBack />
      {permission?.granted ? (
        <View className="mx-4 mt-4 aspect-square overflow-hidden rounded-input">
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={busy || pending ? undefined : ({ data }) => handleRaw(data)}
          />
        </View>
      ) : (
        <View className="items-center gap-3 px-8 py-10">
          <Text className="text-center text-sm text-ink/70 dark:text-ink-dark/70">{t("scan.permission")}</Text>
          <Button label={t("scan.grant")} onPress={() => void requestPermission()} />
        </View>
      )}
      <Text className="px-4 pt-3 text-center text-sm text-ink/60 dark:text-ink-dark/60">{t("scan.hint")}</Text>
      <View className="gap-2 px-4 pt-4">
        <Text className="text-sm text-ink dark:text-ink-dark">{t("scan.manual_entry")}</Text>
        <TextInput
          value={manual}
          onChangeText={setManual}
          placeholder={t("scan.manual_placeholder")}
          autoCapitalize="none"
          autoCorrect={false}
          className="rounded-input border border-line bg-surface px-3 py-2 text-base text-ink dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark"
        />
        <Button label={t("scan.submit")} onPress={() => handleRaw(manual)} disabled={!manual.trim()} loading={busy} />
      </View>
      {pending ? (
        <View className="mx-4 mt-4 gap-2 rounded-input border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
          <Text className="text-base font-medium text-ink dark:text-ink-dark">{t("scan.pick_action")}</Text>
          <Button label={t("scan.action_entry")} variant="secondary" onPress={() => void act("classroom_entry", pending.token)} />
          <Button label={t("scan.action_late")} variant="secondary" onPress={() => void act("late_arrival", pending.token)} />
          <Button label={t("scan.action_stage")} variant="secondary" onPress={() => void act("approve", pending.token, pending.instanceId)} />
          <Button label={t("scan.cancel")} variant="ghost" onPress={() => setPending(null)} />
        </View>
      ) : null}
    </View>
  );
}

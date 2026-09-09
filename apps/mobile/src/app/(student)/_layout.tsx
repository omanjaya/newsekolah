import { ScanLine } from "lucide-react-native";
import { RoleTabsLayout } from "@/components/nav/RoleTabsLayout";
import { ActionSheetPlaceholder } from "@/components/screens/ActionSheetPlaceholder";
import { t } from "@/i18n/t";

export default function StudentLayout(): React.JSX.Element {
  return (
    <RoleTabsLayout
      centerAction={{
        icon: ScanLine,
        label: t("scan.title"),
        renderSheetContent: () => (
          <ActionSheetPlaceholder
            icon={ScanLine}
            title={t("scan.title")}
            description="Pemindaian QR presensi dan izin keluar akan tersedia di sini setelah alur presensi terhubung ke API."
          />
        ),
      }}
    />
  );
}

import { QrCode } from "lucide-react-native";
import { RoleTabsLayout } from "@/components/nav/RoleTabsLayout";
import { ActionSheetPlaceholder } from "@/components/screens/ActionSheetPlaceholder";
import { t } from "@/i18n/t";

export default function TeacherLayout(): React.JSX.Element {
  return (
    <RoleTabsLayout
      centerAction={{
        icon: QrCode,
        label: t("qr.title"),
        renderSheetContent: () => (
          <ActionSheetPlaceholder
            icon={QrCode}
            title={t("qr.title")}
            description="Kode QR kelas akan tampil di sini setelah alur presensi guru terhubung ke API."
          />
        ),
      }}
    />
  );
}

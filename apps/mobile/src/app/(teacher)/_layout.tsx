import { QrCode } from "lucide-react-native";
import { RoleTabsLayout } from "@/components/nav/RoleTabsLayout";
import { QrSheet } from "@/components/screens/QrSheet";
import { t } from "@/i18n/t";

export default function TeacherLayout(): React.JSX.Element {
  return (
    <RoleTabsLayout
      centerAction={{
        icon: QrCode,
        label: t("qr.title"),
        renderSheetContent: () => <QrSheet />,
      }}
    />
  );
}

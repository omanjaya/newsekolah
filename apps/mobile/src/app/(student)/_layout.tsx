import { ScanLine } from "lucide-react-native";
import { RoleTabsLayout } from "@/components/nav/RoleTabsLayout";
import { ScanSheet } from "@/components/screens/ScanSheet";
import { t } from "@/i18n/t";

export default function StudentLayout(): React.JSX.Element {
  return (
    <RoleTabsLayout
      centerAction={{
        icon: ScanLine,
        label: t("scan.title"),
        renderSheetContent: (close) => <ScanSheet onNavigate={close} />,
      }}
    />
  );
}

import { Text, View } from "react-native";

export type AttendanceStatus = "present" | "sick" | "excused" | "dispensation" | "absent" | "late";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Hadir",
  sick: "Sakit",
  excused: "Izin",
  dispensation: "Dispensasi",
  absent: "Alfa",
  late: "Terlambat",
};

const STATUS_DOT_CLASS: Record<AttendanceStatus, string> = {
  present: "bg-status-present",
  sick: "bg-status-sick",
  excused: "bg-status-excused",
  dispensation: "bg-status-dispensation",
  absent: "bg-status-absent",
  late: "bg-status-late",
};

const STATUS_TEXT_CLASS: Record<AttendanceStatus, string> = {
  present: "text-status-present",
  sick: "text-status-sick",
  excused: "text-status-excused",
  dispensation: "text-status-dispensation",
  absent: "text-status-absent",
  late: "text-status-late",
};

interface StatusBadgeProps {
  status: AttendanceStatus;
}

/** Status is always carried by the text label, not color alone, so it reads
 * for colorblind users (DESIGN.md). */
export function StatusBadge({ status }: StatusBadgeProps): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-1.5 self-start rounded-chip border border-line px-2 py-1 dark:border-line-dark">
      <View className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASS[status]}`} />
      <Text className={`text-xs font-medium ${STATUS_TEXT_CLASS[status]}`}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

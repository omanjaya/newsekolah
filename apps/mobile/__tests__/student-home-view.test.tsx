import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StudentHomeView, type StudentHomeViewProps } from "@/components/screens/StudentHomeView";
import { setLocale } from "@/i18n/t";

// AnnouncementsList fetches through React Query (useMyAnnouncements); this
// test is about StudentHomeView's own composition, not that list, so it is
// stubbed out rather than wrapped in a QueryClientProvider.
jest.mock("@/components/screens/AnnouncementsList", () => ({
  AnnouncementsList: () => null,
}));

// The active locale otherwise follows the test environment's system locale
// (see src/i18n/t.ts); pinned here so the copy assertions below are
// hermetic regardless of where this suite runs.
beforeAll(() => setLocale("id"));

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const BASE_PROPS: StudentHomeViewProps = {
  eyebrow: "SMA Contoh · Kamis, 25 Sep",
  greetingName: "Nadia",
  profileName: "Nadia Amelia",
  unreadCount: 0,
  onPressNotifications: jest.fn(),
  onPressProfile: jest.fn(),
  isLoadingSchedule: false,
  nextLesson: null,
  statTiles: [],
  onPressTile: jest.fn(),
  todayRows: [],
};

function renderView(props: Partial<StudentHomeViewProps> = {}): ReturnType<typeof render> {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <StudentHomeView {...BASE_PROPS} {...props} />
    </SafeAreaProvider>,
  );
}

const ALL_TILE_KEYS = ["attendance", "leave", "grades", "library"] as const;

function presentTileKeys(view: Awaited<ReturnType<typeof render>>): string[] {
  return ALL_TILE_KEYS.filter((key) => view.queryByTestId(`stat-tile-${key}`) !== null);
}

describe("StudentHomeView composition", () => {
  it("renders no stat tiles when nothing has data yet", async () => {
    const view = await renderView({ statTiles: [] });
    expect(presentTileKeys(view)).toHaveLength(0);
  });

  it("renders exactly the tiles it was given, and nothing invented", async () => {
    const view = await renderView({
      statTiles: [
        { key: "attendance", value: "96%" },
        { key: "grades", value: "3" },
      ],
    });
    expect(presentTileKeys(view)).toEqual(["attendance", "grades"]);
    expect(view.getByText("96%")).toBeTruthy();
    expect(view.getByText("3")).toBeTruthy();
  });

  it("renders all four tiles when every source has data", async () => {
    const view = await renderView({
      statTiles: [
        { key: "attendance", value: "96%" },
        { key: "leave", value: "1" },
        { key: "grades", value: "3" },
        { key: "library", value: "2 buku", label: "Kembali Sabtu" },
      ],
    });
    expect(presentTileKeys(view)).toEqual(["attendance", "leave", "grades", "library"]);
  });

  it("shows the honest empty state instead of the hero card when there is no next lesson", async () => {
    const view = await renderView({ nextLesson: null, isLoadingSchedule: false });
    expect(view.queryByTestId("next-lesson-card")).toBeNull();
    expect(view.queryByTestId("next-lesson-empty")).not.toBeNull();
    expect(view.getByText("Tidak ada pelajaran lagi hari ini")).toBeTruthy();
  });

  it("shows the hero card with the given countdown when there is a next lesson", async () => {
    const view = await renderView({
      nextLesson: {
        subjectName: "Matematika",
        timeRangeLabel: "08.40 - 10.00",
        roomName: "Ruang X-A",
        teacherName: "Rina Wijaya",
        countdownLabel: "12 menit lagi",
      },
    });
    expect(view.queryByTestId("next-lesson-card")).not.toBeNull();
    expect(view.queryByTestId("next-lesson-empty")).toBeNull();
    expect(view.getByText("Matematika")).toBeTruthy();
    expect(view.getByText("12 menit lagi")).toBeTruthy();
  });

  it("renders today's schedule rows only when there are some", async () => {
    const empty = await renderView({ todayRows: [] });
    expect(empty.queryByTestId("today-schedule-card")).toBeNull();
    await empty.unmount();

    const withRows = await renderView({
      todayRows: [
        { key: "a", startLabel: "10.15", subjectName: "Bahasa Indonesia", roomName: "Ruang X-A" },
        { key: "b", startLabel: "12.30", subjectName: "Fisika", roomName: "Lab IPA" },
      ],
    });
    expect(withRows.queryByTestId("today-schedule-card")).not.toBeNull();
    expect(withRows.getByText("Fisika")).toBeTruthy();
  });
});

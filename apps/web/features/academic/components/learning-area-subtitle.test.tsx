import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssignmentsView } from "./assignments-view";
import { LearningView } from "./learning-view";

const state = vi.hoisted(() => ({ tab: "subjects" }));

// Each label carries its namespace, so the test sees which key a page used.
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ""}.${key}`,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`tab=${state.tab}`),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("./learning-workspace-nav", () => ({ LearningWorkspaceNav: () => null }));
vi.mock("./teaching-assignments-view", () => ({ TeachingAssignmentsView: () => null }));
vi.mock("./subject-offerings-view", () => ({ SubjectOfferingsView: () => null }));
vi.mock("../../school/components/subjects-view", () => ({ SubjectsView: () => null }));
vi.mock("../../school/components/periods-view", () => ({ PeriodsView: () => null }));
vi.mock("../../school/components/duties-view", () => ({ DutiesView: () => null }));
vi.mock("../../school/components/duty-types-panel", () => ({ DutyTypesPanel: () => null }));

afterEach(cleanup);

const AREA_SUBTITLE = "app.academic.workspace.learningDescription";

describe("Pembelajaran area subtitle", () => {
  it("is the same on the learning tabs and the assignment tabs", () => {
    state.tab = "periods";
    render(<LearningView />);
    expect(screen.getByText(AREA_SUBTITLE)).toBeInTheDocument();
    cleanup();

    state.tab = "duties";
    render(<AssignmentsView />);
    expect(screen.getByText(AREA_SUBTITLE)).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import "@/lib/i18n";
import { StatsOverview } from "@/components/StatsOverview";
import type { StatsOverview as Overview } from "@/lib/api";

afterEach(() => cleanup());

const populated: Overview = {
  totalPoints: 120,
  totalAnswered: 20,
  accuracy: 0.75,
  totalTimeMs: 5 * 60 * 60 * 1000,
  topicsCompleted: 4,
  mostCommonErrorType: "numeric",
  hardestTopics: [{ topicName: "Limits", moduleIndex: 0, topicIndex: 1, accuracy: 0.4, total: 8 }],
  mostGaveUp: [{ topicName: "Derivatives", moduleIndex: 0, topicIndex: 2, gaveUp: 3 }],
  mostRepeated: [{ topicName: "Fractions", moduleIndex: 1, topicIndex: 0, passes: 5 }],
  biggestImprovements: [{ topicName: "Integrals", moduleIndex: 2, topicIndex: 0, from: 0.3, to: 0.8, delta: 0.5 }],
  recommendations: [{ kind: "revisit", topicName: "Limits", message: "Review limits before moving on." }],
};

describe("StatsOverview", () => {
  test("shows the first recommendation when there is no data", () => {
    render(<StatsOverview stats={{ ...populated, totalAnswered: 0, recommendations: [{ kind: "get_started", message: "Answer a few to begin." }] }} />);
    expect(screen.getByText("Answer a few to begin.")).toBeInTheDocument();
  });

  test("falls back to copy when there is no data and no recommendation", () => {
    render(<StatsOverview stats={{ ...populated, totalAnswered: 0, recommendations: [] }} />);
    expect(screen.getByText("Answer a few exercises to start seeing your stats.")).toBeInTheDocument();
  });

  test("renders the tiles and per-topic sections", () => {
    render(<StatsOverview stats={populated} />);
    expect(screen.getByText("Your Stats")).toBeInTheDocument();
    expect(screen.getByText("Points")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("5h")).toBeInTheDocument();
    expect(screen.getByText("Hardest so far")).toBeInTheDocument();
    expect(screen.getByText("Limits")).toBeInTheDocument();
    expect(screen.getByText("Asked for help")).toBeInTheDocument();
    expect(screen.getByText("Most repeated")).toBeInTheDocument();
    expect(screen.getByText("Biggest gains")).toBeInTheDocument();
    expect(screen.getByText("Review limits before moving on.")).toBeInTheDocument();
  });

  test("renders an empty note when there are no per-topic lists", () => {
    render(<StatsOverview stats={{ ...populated, hardestTopics: [], mostGaveUp: [], mostRepeated: [], biggestImprovements: [] }} />);
    expect(screen.getByText(/Keep going/)).toBeInTheDocument();
  });
});

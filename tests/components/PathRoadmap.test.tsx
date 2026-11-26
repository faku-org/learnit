import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/lib/i18n";
import { PathRoadmap, type RoadmapModule } from "@/components/PathRoadmap";
import type { Progress } from "@/lib/api";

afterEach(() => cleanup());

const modules: RoadmapModule[] = [
  {
    name: "Basics",
    order: 0,
    topics: [
      { name: "Greetings", order: 0 },
      { name: "Numbers", order: 1 },
    ],
  },
  {
    name: "Travel",
    order: 1,
    focus: "Planned for later",
    topics: [],
  },
];

const progress: Progress = {
  pathId: "p1",
  currentModuleIndex: 0,
  currentTopicIndex: 0,
  completedTopics: [],
  topicStats: {},
};

describe("PathRoadmap", () => {
  test("shows the module and its current topic", () => {
    render(
      <PathRoadmap language="German" modules={modules} progress={progress} activeTopicKey={null} correctToAdvance={3} onTopicSelect={() => {}} />,
    );
    expect(screen.getAllByText("Basics").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Greetings").length).toBeGreaterThan(0);
    expect(screen.getByText("Numbers")).toBeInTheDocument();
  });

  test("shows the pending placeholder for an unhydrated module", () => {
    render(
      <PathRoadmap language="German" modules={modules} progress={progress} activeTopicKey={null} correctToAdvance={3} onTopicSelect={() => {}} />,
    );
    expect(screen.getByText("Travel")).toBeInTheDocument();
  });

  test("clicking the current topic reports it", async () => {
    const user = userEvent.setup();
    let received: { m: number; t: number; name: string } | null = null;
    render(
      <PathRoadmap
        language="German"
        modules={modules}
        progress={progress}
        activeTopicKey={null}
        correctToAdvance={3}
        onTopicSelect={(m, t, name) => (received = { m, t, name })}
      />,
    );
    // The first "Greetings" is the current-stage header; the topic button is the second.
    const buttons = screen.getAllByText("Greetings");
    await user.click(buttons[buttons.length - 1]);
    expect(received ?? { m: -1, t: -1, name: "" }).toEqual({ m: 0, t: 0, name: "Greetings" });
  });

  test("later topics stay disabled until the path reaches them", async () => {
    const user = userEvent.setup();
    let fired = false;
    render(
      <PathRoadmap
        language="German"
        modules={modules}
        progress={progress}
        activeTopicKey={null}
        correctToAdvance={3}
        onTopicSelect={() => (fired = true)}
      />,
    );
    await user.click(screen.getByText("Numbers"));
    expect(fired).toBe(false);
  });
});

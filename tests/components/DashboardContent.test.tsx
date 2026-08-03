import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setSession } from "@/lib/auth";
import { useMsw } from "@tests/msw";
import "@/lib/i18n";
import { DashboardContent } from "@/components/DashboardContent";

const server = useMsw();

afterEach(() => cleanup());
beforeEach(() => {
  setSession("tok", { userId: "u1", email: "a@b.c" });
});

const overview = {
  totalPoints: 120,
  totalAnswered: 20,
  accuracy: 0.75,
  totalTimeMs: 1000 * 60 * 60,
  topicsCompleted: 4,
  mostCommonErrorType: null,
  hardestTopics: [],
  mostGaveUp: [],
  mostRepeated: [],
  biggestImprovements: [],
  recommendations: [{ kind: "on_track", message: "You are on track." }],
};

describe("DashboardContent", () => {
  test("renders the streak, today card, and stats", async () => {
    server.use(
      http.get("http://localhost:3001/api/streak", () =>
        HttpResponse.json({ currentStreak: 4, longestStreak: 9, lastSessionDate: "2026-08-03" }),
      ),
      http.get("http://localhost:3001/api/path/current", () =>
        HttpResponse.json({ subject: "German", objective: "Talk to locals", modules: [{ name: "Basics", description: "Start", order: 0 }] }),
      ),
      http.get("http://localhost:3001/api/stats/overview", () => HttpResponse.json(overview)),
    );
    render(<DashboardContent />);

    expect(await screen.findByText(/day streak/)).toBeInTheDocument();
    expect(screen.getByText("German · Talk to locals")).toBeInTheDocument();
    expect(screen.getByText("Basics")).toBeInTheDocument();
    expect(screen.getByText("You are on track.")).toBeInTheDocument();
  });

  test("shows the welcome state when there is no path or streak", async () => {
    server.use(
      http.get("http://localhost:3001/api/streak", () =>
        HttpResponse.json({ currentStreak: 0, longestStreak: 0, lastSessionDate: null }),
      ),
      http.get("http://localhost:3001/api/path/current", () => HttpResponse.json(null)),
      http.get("http://localhost:3001/api/stats/overview", () => HttpResponse.json({ ...overview, totalAnswered: 0, recommendations: [] })),
    );
    render(<DashboardContent />);

    expect(await screen.findByText("Welcome back. Keep the momentum going.")).toBeInTheDocument();
    expect(screen.getByText("No path set yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Set a goal/ })).toBeInTheDocument();
  });

  test("links to learn when a path exists", async () => {
    server.use(
      http.get("http://localhost:3001/api/streak", () =>
        HttpResponse.json({ currentStreak: 1, longestStreak: 2, lastSessionDate: "2026-08-03" }),
      ),
      http.get("http://localhost:3001/api/path/current", () =>
        HttpResponse.json({ subject: "German", objective: "Talk to locals", modules: [] }),
      ),
      http.get("http://localhost:3001/api/stats/overview", () => HttpResponse.json({ ...overview, totalAnswered: 0, recommendations: [] })),
    );
    render(<DashboardContent />);
    expect(await screen.findByRole("link", { name: /Continue/ })).toBeInTheDocument();
  });
});

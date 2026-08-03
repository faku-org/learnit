import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setSession } from "@/lib/auth";
import { useMsw } from "@tests/msw";
import "@/lib/i18n";
import { GoalsPage } from "@/components/GoalsPage";

const server = useMsw();

afterEach(() => cleanup());
beforeEach(() => {
  setSession("tok", { userId: "u1", email: "a@b.c" });
});

const paths = [
  {
    _id: "p1",
    subject: "German",
    objective: "Talk to locals",
    timeframe: "6 months",
    modules: [{ name: "Basics", order: 0, description: "Start here" }],
    active: true,
  },
  {
    _id: "p2",
    subject: "Economics",
    objective: "Understand central banks",
    modules: [{ name: "Intro", order: 0, description: "Start here" }],
  },
];

function seedLoad() {
  server.use(
    http.get("http://localhost:3001/api/paths", () => HttpResponse.json(paths)),
    http.get("http://localhost:3001/api/preferences", () =>
      HttpResponse.json({ activePathId: "p1", nativeLanguage: "english", difficultyBias: 0 }),
    ),
  );
}

const cardOf = (text: string) =>
  screen.getByText(text).closest(".rounded-xl") as HTMLElement;

describe("GoalsPage", () => {
  test("lists existing paths with the active badge", async () => {
    seedLoad();
    render(<GoalsPage />);
    expect(await screen.findByText("German")).toBeInTheDocument();
    expect(screen.getByText("Economics")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Talk to locals")).toBeInTheDocument();
  });

  test("deleting a path removes it from the list", async () => {
    seedLoad();
    server.use(http.delete("http://localhost:3001/api/path/:id", () => HttpResponse.json({ ok: true })));
    const user = userEvent.setup();
    render(<GoalsPage />);
    await screen.findByText("German");

    const econCard = cardOf("Economics");
    await user.click(within(econCard).getByRole("button", { name: "" }));

    expect(screen.queryByText("Economics")).not.toBeInTheDocument();
    expect(screen.getByText("German")).toBeInTheDocument();
  });

  test("setting a path active calls updatePreferences and moves the badge", async () => {
    seedLoad();
    let activeSet: unknown = null;
    server.use(
      http.post("http://localhost:3001/api/preferences", async ({ request }) => {
        activeSet = (await request.json()) as unknown;
        return HttpResponse.json({ activePathId: "p2", nativeLanguage: "english", difficultyBias: 0 });
      }),
    );
    const user = userEvent.setup();
    render(<GoalsPage />);
    await screen.findByText("German");

    const econCard = cardOf("Economics");
    await user.click(within(econCard).getByRole("button", { name: "Set active" }));

    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(activeSet).toEqual({ activePathId: "p2" });
  });

  test("shows the new path form when there are no paths", async () => {
    server.use(
      http.get("http://localhost:3001/api/paths", () => HttpResponse.json([])),
      http.get("http://localhost:3001/api/preferences", () =>
        HttpResponse.json({ activePathId: null, nativeLanguage: "english", difficultyBias: 0 }),
      ),
    );
    render(<GoalsPage />);
    expect(await screen.findByText("What do you want to learn?")).toBeInTheDocument();
    expect(screen.getByText("Learning Goal")).toBeInTheDocument();
  });

  test("a workable scope routes straight to calibration", async () => {
    seedLoad();
    server.use(
      http.post("http://localhost:3001/api/taxonomy/classify", () =>
        HttpResponse.json({
          taxonomy: ["language", "german"], taxonomyLeaf: "german",
          breadcrumb: "Language / German", confidence: 0.9, matchedOffline: true, createdNode: null,
        }),
      ),
      http.post("http://localhost:3001/api/taxonomy/scope", () =>
        HttpResponse.json({ breadth: "workable", reason: "ok", questions: [], suggestedObjective: null }),
      ),
    );
    const user = userEvent.setup();
    render(<GoalsPage />);
    await screen.findByText("German");

    await user.click(screen.getByRole("button", { name: "Create new path" }));
    await user.type(screen.getByPlaceholderText("Japanese, Macroeconomics, Quantum Mechanics, Roman History..."), "German");
    await user.type(screen.getByPlaceholderText("e.g., Understand how central banks set interest rates"), "Speak fluently");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Calibrating your German level")).toBeInTheDocument();
  });
});

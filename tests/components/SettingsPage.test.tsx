import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setSession } from "@/lib/auth";
import { useMsw } from "@tests/msw";
import "@/lib/i18n";
import { SettingsPage } from "@/components/SettingsPage";

const server = useMsw();

afterEach(() => cleanup());
beforeEach(() => {
  setSession("tok", { userId: "u1", email: "a@b.c" });
});

const paths = [
  {
    _id: "p1",
    language: "German",
    objective: "Talk to locals",
    timeframe: "6 months",
    modules: [{ name: "Basics" }],
    createdAt: "2026-08-01",
    active: true,
  },
  {
    _id: "p2",
    language: "Economics",
    objective: "Understand central banks",
    timeframe: null,
    modules: [],
    createdAt: "2026-08-02",
    active: false,
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

describe("SettingsPage", () => {
  test("lists paths and prefs after load", async () => {
    seedLoad();
    render(<SettingsPage />);
    expect(await screen.findByText("German")).toBeInTheDocument();
    expect(screen.getByText("Economics")).toBeInTheDocument();
    expect(screen.getByText("Talk to locals")).toBeInTheDocument();
  });

  test("shows the empty state when there are no paths", async () => {
    server.use(
      http.get("http://localhost:3001/api/paths", () => HttpResponse.json([])),
      http.get("http://localhost:3001/api/preferences", () =>
        HttpResponse.json({ activePathId: null, nativeLanguage: "english", difficultyBias: 0 }),
      ),
    );
    render(<SettingsPage />);
    expect(await screen.findByText("No paths yet.")).toBeInTheDocument();
  });

  test("selecting a path saves the new active preference", async () => {
    seedLoad();
    let activeSet: unknown = null;
    server.use(
      http.post("http://localhost:3001/api/preferences", async ({ request }) => {
        activeSet = (await request.json()) as unknown;
        return HttpResponse.json({ activePathId: "p2", nativeLanguage: "english", difficultyBias: 0 });
      }),
    );
    const user = userEvent.setup();
    render(<SettingsPage />);
    const economics = await screen.findByText("Economics");
    await user.click(economics.closest(".rounded-xl") as HTMLElement);

    await waitFor(() => expect(activeSet).toEqual({ activePathId: "p2" }));
    const econCard = screen.getByText("Economics").closest(".rounded-xl") as HTMLElement;
    expect(within(econCard).getByTitle("Delete path")).toBeInTheDocument();
  });

  test("changing the explanation language saves the preference", async () => {
    seedLoad();
    let langSet: unknown = null;
    server.use(
      http.post("http://localhost:3001/api/preferences", async ({ request }) => {
        langSet = (await request.json()) as unknown;
        return HttpResponse.json({ activePathId: "p1", nativeLanguage: "spanish", difficultyBias: 0 });
      }),
    );
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText("German");

    await user.click(screen.getByRole("button", { name: "Spanish" }));
    expect(await screen.findByText("Spanish")).toBeInTheDocument();
    expect(langSet).toEqual({ nativeLanguage: "spanish" });
  });

  test("deleting a path removes it and clears the active id", async () => {
    seedLoad();
    server.use(http.delete("http://localhost:3001/api/path/:id", () => HttpResponse.json({ ok: true })));
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText("German");

    const card = screen.getByText("Talk to locals").closest(".rounded-xl") as HTMLElement;
    await user.click(within(card).getByTitle("Delete path"));

    await waitFor(() => expect(screen.queryByText("Talk to locals")).not.toBeInTheDocument(), { timeout: 15000 });
    expect(screen.getByText("Economics")).toBeInTheDocument();
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setSession } from "@/lib/auth";
import { useMsw } from "@tests/msw";
import "@/lib/i18n";
import { SpeakPage } from "@/components/SpeakPage";

const server = useMsw();

afterEach(() => cleanup());
beforeEach(() => {
  setSession("tok", { userId: "u1", email: "a@b.c" });
});

const JAPANESE = ["おはようございます", "ありがとうございます", "すみません、駅はどこですか", "私は日本語を勉強しています"];
const SPANISH = ["Buenos días, ¿cómo estás?", "¿Dónde está la estación?", "Me gustaría un café, por favor", "¿Cuánto cuesta esto?"];

describe("SpeakPage repeat mode", () => {
  test("renders a phrase and the language selector", async () => {
    server.use(
      http.get("http://localhost:3001/api/path/current", () => HttpResponse.json({ error: "No path found" }, { status: 404 })),
      http.get("http://localhost:3001/api/preferences", () =>
        HttpResponse.json({ activePathId: null, nativeLanguage: "english", difficultyBias: 0 }),
      ),
    );
    render(<SpeakPage />);
    const phrase = await screen.findByText((content) =>
      JAPANESE.includes(content.trim()),
    );
    expect(phrase).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spanish" })).toBeInTheDocument();
  });

  test("switching language swaps to a phrase of that language", async () => {
    server.use(
      http.get("http://localhost:3001/api/path/current", () => HttpResponse.json({ error: "No path found" }, { status: 404 })),
      http.get("http://localhost:3001/api/preferences", () =>
        HttpResponse.json({ activePathId: null, nativeLanguage: "english", difficultyBias: 0 }),
      ),
    );
    const user = userEvent.setup();
    render(<SpeakPage />);
    await screen.findByText((content) => JAPANESE.includes(content.trim()));

    await user.click(screen.getByRole("button", { name: "Spanish" }));
    expect(await screen.findByText((content) => SPANISH.includes(content.trim()))).toBeInTheDocument();
  });

  test("a path language is picked up as the practice language", async () => {
    server.use(
      http.get("http://localhost:3001/api/path/current", () =>
        HttpResponse.json({ _id: "p1", language: "German", modules: [{ topics: [{ name: "Greetings" }] }] }),
      ),
      http.get("http://localhost:3001/api/preferences", () =>
        HttpResponse.json({ activePathId: "p1", nativeLanguage: "english", difficultyBias: 0 }),
      ),
      http.get("http://localhost:3001/api/progress", () =>
        HttpResponse.json({ pathId: "p1", currentModuleIndex: 0, currentTopicIndex: 0, completedTopics: [], topicStats: {} }),
      ),
    );
    render(<SpeakPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "German" })).toHaveClass("bg-primary"));
  });
});

describe("SpeakPage scenario mode", () => {
  test("loads and renders a generated scenario", async () => {
    server.use(
      http.get("http://localhost:3001/api/path/current", () => HttpResponse.json({ error: "No path found" }, { status: 404 })),
      http.get("http://localhost:3001/api/preferences", () =>
        HttpResponse.json({ activePathId: null, nativeLanguage: "english", difficultyBias: 0 }),
      ),
      http.post("http://localhost:3001/api/speak/scenario", () =>
        HttpResponse.json({ situation: "At the coffee shop", prompt: "Order a coffee.", sampleResponse: "One coffee, please." }),
      ),
    );
    const user = userEvent.setup();
    render(<SpeakPage />);
    await user.click(screen.getByRole("button", { name: "Scenario" }));

    expect(await screen.findByText("At the coffee shop")).toBeInTheDocument();
    expect(screen.getByText("Order a coffee.")).toBeInTheDocument();
    expect(screen.getByText(/Tap to start a live conversation/)).toBeInTheDocument();
  });

  test("a failed scenario load offers retry", async () => {
    server.use(
      http.get("http://localhost:3001/api/path/current", () => HttpResponse.json({ error: "No path found" }, { status: 404 })),
      http.get("http://localhost:3001/api/preferences", () =>
        HttpResponse.json({ activePathId: null, nativeLanguage: "english", difficultyBias: 0 }),
      ),
      http.post("http://localhost:3001/api/speak/scenario", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    render(<SpeakPage />);
    await user.click(screen.getByRole("button", { name: "Scenario" }));

    expect(await screen.findByText("Couldn't generate a scenario.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

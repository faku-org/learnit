import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setSession } from "@/lib/auth";
import { useMsw } from "@tests/msw";
import "@/lib/i18n";
import { VocabularyPage } from "@/components/VocabularyPage";

const server = useMsw();

afterEach(() => cleanup());
beforeEach(() => {
  setSession("tok", { userId: "u1", email: "a@b.c" });
});

const entries = [
  {
    _id: "v1",
    word: "Haus",
    meaning: "house",
    language: "German",
    type: "noun",
    conjugations: [],
    createdAt: "2026-08-01",
  },
  {
    _id: "v2",
    word: "laufen",
    meaning: "to run",
    language: "German",
    createdAt: "2026-08-01",
  },
];

function seedLoad() {
  server.use(
    http.get("http://localhost:3001/api/vocabulary", () => HttpResponse.json(entries)),
    http.get("http://localhost:3001/api/path/current", () => HttpResponse.json({ _id: "p1", language: "German" })),
    http.get("http://localhost:3001/api/preferences", () =>
      HttpResponse.json({ activePathId: "p1", nativeLanguage: "english", difficultyBias: 0 }),
    ),
  );
}

describe("VocabularyPage", () => {
  test("shows the empty state when there are no words", async () => {
    server.use(
      http.get("http://localhost:3001/api/vocabulary", () => HttpResponse.json([])),
      http.get("http://localhost:3001/api/path/current", () => HttpResponse.json(null)),
      http.get("http://localhost:3001/api/preferences", () =>
        HttpResponse.json({ activePathId: null, nativeLanguage: "english", difficultyBias: 0 }),
      ),
    );
    render(<VocabularyPage />);
    expect(await screen.findByText("No words saved yet. Add your first one above.")).toBeInTheDocument();
  });

  test("lists words and filters by search", async () => {
    seedLoad();
    const user = userEvent.setup();
    render(<VocabularyPage />);
    expect(await screen.findByText("Haus")).toBeInTheDocument();
    expect(screen.getByText("laufen")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search vocabulary..."), "Haus");
    expect(screen.getByText("Haus")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("laufen")).not.toBeInTheDocument(), { timeout: 15000 });
  });

  test("adds a word and persists it to the list", async () => {
    seedLoad();
    server.use(
      http.post("http://localhost:3001/api/vocabulary", () =>
        HttpResponse.json({ _id: "v3", word: "Apfel", meaning: "apple", language: "German", createdAt: "2026-08-01" }, { status: 201 }),
      ),
      http.post("http://localhost:3001/api/vocabulary/:id/enrich", () =>
        HttpResponse.json({ type: "noun", conjugations: [], example: "der Apfel", exampleTranslation: "the apple" }),
      ),
    );
    const user = userEvent.setup();
    render(<VocabularyPage />);
    await screen.findByText("Haus");

    await user.type(screen.getByPlaceholderText("Word or phrase"), "Apfel");
    await user.type(screen.getByPlaceholderText("Meaning"), "apple");
    await user.click(screen.getByRole("button", { name: "Save Word" }));

    expect(await screen.findByText("Apfel")).toBeInTheDocument();
    expect(screen.getByText("apple")).toBeInTheDocument();
  });

  test("deletes a word", async () => {
    seedLoad();
    server.use(
      http.delete("http://localhost:3001/api/vocabulary/:id", () => HttpResponse.json({ ok: true })),
    );
    const user = userEvent.setup();
    render(<VocabularyPage />);
    await screen.findByText("Haus");

    const card = screen.getByText("Haus").closest(".group")!;
    await user.click(within(card as HTMLElement).getByTitle("Delete"));
    await waitFor(() => expect(screen.queryByText("Haus")).not.toBeInTheDocument(), { timeout: 15000 });
    expect(screen.getByText("laufen")).toBeInTheDocument();
  });

  test("re-enriching an entry merges the enrichment", async () => {
    seedLoad();
    server.use(
      http.post("http://localhost:3001/api/vocabulary/:id/enrich", () =>
        HttpResponse.json({ type: "verb", conjugations: [], example: "ich laufe", exampleTranslation: "I run" }),
      ),
    );
    const user = userEvent.setup();
    render(<VocabularyPage />);
    await screen.findByText("laufen");

    const card = screen.getByText("laufen").closest(".group")!;
    await user.click(within(card as HTMLElement).getByTitle("Re-enrich"));
    expect(await screen.findByText("I run")).toBeInTheDocument();
    expect(screen.getByText(/ich laufe/)).toBeInTheDocument();
  });
});

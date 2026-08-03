import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useMsw } from "@tests/msw";
import "@/lib/i18n";
import { ClickableText, toLangCode, type WordMeaning } from "@/components/ClickableText";

const server = useMsw();

afterEach(() => cleanup());

describe("toLangCode", () => {
  test("maps known languages and falls back to the two-letter prefix", () => {
    expect(toLangCode("German")).toBe("de");
    expect(toLangCode("Japanese")).toBe("ja");
    expect(toLangCode("Klingon")).toBe("kl");
  });
});

describe("ClickableText", () => {
  test("clicking a word with a meaning shows it in the popup", async () => {
    const user = userEvent.setup();
    const meanings: WordMeaning[] = [{ word: "Haus", infinitive: "Haus", meaning: "house" }];
    render(<ClickableText text="Das Haus ist groß" language="German" wordMeanings={meanings} />);
    await user.click(screen.getByRole("button", { name: "Haus" }));
    expect(screen.getByText("house")).toBeInTheDocument();
  });

  test("clicking an unknown word offers a translation that fetches", async () => {
    server.use(
      http.post("http://localhost:3001/api/translate", () =>
        HttpResponse.json({ translation: "grande" }),
      ),
    );
    const user = userEvent.setup();
    render(<ClickableText text="groß" language="German" />);
    await user.click(screen.getByRole("button", { name: "groß" }));
    expect(screen.getByRole("button", { name: /Translate/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Translate/ }));
    expect(await screen.findByText("grande")).toBeInTheDocument();
  });

  test("does not open a popup for whitespace-only parts", async () => {
    render(<ClickableText text="a b" language="German" />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});

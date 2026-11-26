import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18next, { setLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

afterEach(() => {
  cleanup();
  setLanguage("en");
  localStorage.clear();
});

describe("LanguageSwitcher", () => {
  test("renders both languages and marks the active one", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Español" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toHaveClass("bg-primary");
  });

  test("switching to Spanish persists the locale and activates the button", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);
    await user.click(screen.getByRole("button", { name: "Español" }));

    expect(localStorage.getItem("learnit_locale")).toBe("es");
    expect(i18next.resolvedLanguage).toBe("es");
    expect(screen.getByRole("button", { name: "Español" })).toHaveClass("bg-primary");
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setSession } from "@/lib/auth";
import "@/lib/i18n";
import { AuthGuard } from "@/components/AuthGuard";
import { LoginModal } from "@/components/LoginModal";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("LoginModal", () => {
  test("renders the sign-in copy and a Google button", () => {
    render(<LoginModal />);
    expect(screen.getByText("Sign in to continue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continue with Google/ })).toBeInTheDocument();
  });

  test("clicking Google navigates to the auth endpoint", async () => {
    const user = userEvent.setup();
    render(<LoginModal />);
    const link = screen.getByRole("link", { name: /Continue with Google/ });
    expect(link).toHaveAttribute("href", "http://localhost:3001/api/auth/google");
    await user.click(link);
  });
});

describe("AuthGuard", () => {
  test("shows the login modal when there is no session", async () => {
    render(<AuthGuard><p>protected content</p></AuthGuard>);
    expect(await screen.findByRole("link", { name: /Continue with Google/ })).toBeInTheDocument();
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });

  test("renders children when a session exists", async () => {
    setSession("tok", { userId: "u1", email: "a@b.c" });
    render(<AuthGuard><p>protected content</p></AuthGuard>);
    expect(await screen.findByText("protected content")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Continue with Google/ })).not.toBeInTheDocument();
  });
});

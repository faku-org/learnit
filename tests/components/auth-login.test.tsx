import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { clearSession, getUser, setSession } from "@/lib/auth";
import { testUser } from "@tests/handlers";
import { useMsw } from "@tests/msw";
import "@/lib/i18n";
import { AuthGuard } from "@/components/AuthGuard";
import { LoginModal } from "@/components/LoginModal";

const server = useMsw();

afterEach(() => {
  cleanup();
  clearSession();
  localStorage.clear();
});

const signedOut = () =>
  server.use(http.get("http://localhost/api/me", () => HttpResponse.json({ error: "Unauthorized" }, { status: 401 })));

describe("LoginModal", () => {
  test("renders the sign-in copy and a Google link", () => {
    render(<LoginModal />);
    expect(screen.getByText("Sign in to continue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continue with Google/ })).toHaveAttribute("href", "/api/auth/google");
  });

  test("signs in with a handle and password", async () => {
    let signedIn = false;
    server.use(
      http.post("http://localhost/api/auth/login", async ({ request }) => {
        expect(await request.json()).toEqual({ handle: "anna", password: "Correcto-Caballo-9" });
        return HttpResponse.json({ status: "ok", user: testUser });
      }),
    );
    const user = userEvent.setup();
    render(<LoginModal onSignedIn={() => (signedIn = true)} />);
    await user.type(screen.getByLabelText("Handle"), "anna");
    await user.type(screen.getByLabelText("Password"), "Correcto-Caballo-9");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(signedIn).toBe(true));
    expect(getUser()?.handle).toBe("anna");
  });

  test("shows the reason from the server when the credentials are wrong", async () => {
    server.use(
      http.post("http://localhost/api/auth/login", () =>
        HttpResponse.json({ error: "handle o contraseña incorrectos" }, { status: 401 }),
      ),
    );
    const user = userEvent.setup();
    render(<LoginModal />);
    await user.type(screen.getByLabelText("Handle"), "anna");
    await user.type(screen.getByLabelText("Password"), "nope-nope-nope");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("handle o contraseña incorrectos");
  });

  test("asks for the second step when the account has one", async () => {
    server.use(
      http.post("http://localhost/api/auth/login", () => HttpResponse.json({ status: "totp_required" })),
      http.post("http://localhost/api/auth/2fa/verify", () => HttpResponse.json({ status: "ok", user: testUser })),
    );
    let signedIn = false;
    const user = userEvent.setup();
    render(<LoginModal onSignedIn={() => (signedIn = true)} />);
    await user.type(screen.getByLabelText("Handle"), "anna");
    await user.type(screen.getByLabelText("Password"), "Correcto-Caballo-9");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await user.type(await screen.findByLabelText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(signedIn).toBe(true));
  });

  test("shows the recovery codes once after creating an account", async () => {
    server.use(
      http.post("http://localhost/api/auth/register", () =>
        HttpResponse.json({ user: testUser, recoveryCodes: ["AAAAAAAAAA", "BBBBBBBBBB"] }, { status: 201 }),
      ),
    );
    let signedIn = false;
    const user = userEvent.setup();
    render(<LoginModal onSignedIn={() => (signedIn = true)} />);
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Handle"), "anna");
    await user.type(screen.getByLabelText(/^Password/), "Correcto-Caballo-9");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("AAAAAAAAAA")).toBeInTheDocument();
    expect(signedIn).toBe(false);
    await user.click(screen.getByRole("button", { name: "I saved them" }));
    expect(signedIn).toBe(true);
  });
});

describe("AuthGuard", () => {
  test("shows the login modal when the API says there is no session", async () => {
    signedOut();
    render(<AuthGuard><p>protected content</p></AuthGuard>);
    expect(await screen.findByRole("link", { name: /Continue with Google/ })).toBeInTheDocument();
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });

  test("renders children when the API recognises the cookie", async () => {
    render(<AuthGuard><p>protected content</p></AuthGuard>);
    expect(await screen.findByText("protected content")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Continue with Google/ })).not.toBeInTheDocument();
  });

  test("renders children right away when the page already knows the user", async () => {
    setSession(testUser);
    signedOut();
    render(<AuthGuard><p>protected content</p></AuthGuard>);
    expect(await screen.findByText("protected content")).toBeInTheDocument();
  });
});

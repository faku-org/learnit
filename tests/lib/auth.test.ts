import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { clearSession, getUser, isAuthenticated, loadSession, setSession } from "@/lib/auth";
import { handlers, testUser } from "@tests/handlers";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  clearSession();
  localStorage.clear();
});

describe("in-memory session", () => {
  test("starts empty", () => {
    expect(getUser()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  test("setSession and clearSession", () => {
    setSession(testUser);
    expect(getUser()).toEqual(testUser);
    expect(isAuthenticated()).toBe(true);
    clearSession();
    expect(isAuthenticated()).toBe(false);
  });

  test("nothing about the session is written to localStorage", () => {
    setSession(testUser);
    expect(localStorage.length).toBe(0);
  });
});

describe("loadSession", () => {
  test("asks the API who the cookie belongs to", async () => {
    expect(await loadSession()).toEqual(testUser);
    expect(isAuthenticated()).toBe(true);
  });

  test("a 401 means signed out", async () => {
    server.use(http.get("http://localhost/api/me", () => HttpResponse.json({ error: "Unauthorized" }, { status: 401 })));
    expect(await loadSession()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  test("does not ask twice once it knows", async () => {
    let calls = 0;
    server.use(
      http.get("http://localhost/api/me", () => {
        calls++;
        return HttpResponse.json({ user: testUser });
      }),
    );
    await loadSession();
    await loadSession();
    expect(calls).toBe(1);
  });

  test("removes the token the old flow left in localStorage", async () => {
    localStorage.setItem("learnit_token", "stale-jwt");
    localStorage.setItem("learnit_user", "{}");
    await loadSession();
    expect(localStorage.getItem("learnit_token")).toBeNull();
    expect(localStorage.getItem("learnit_user")).toBeNull();
  });
});

import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearSession,
  getAuthHeaders,
  getToken,
  getUser,
  isAuthenticated,
  setSession,
} from "@/lib/auth";

beforeEach(() => localStorage.clear());

describe("getToken", () => {
  test("returns the stored token", () => {
    localStorage.setItem("learnit_token", "abc123");
    expect(getToken()).toBe("abc123");
  });

  test("returns null when nothing is stored", () => {
    expect(getToken()).toBeNull();
  });
});

describe("getUser", () => {
  test("parses the stored user object", () => {
    localStorage.setItem("learnit_user", JSON.stringify({ userId: "u1", email: "a@b.c" }));
    expect(getUser()).toEqual({ userId: "u1", email: "a@b.c" });
  });

  test("returns null on corrupt JSON", () => {
    localStorage.setItem("learnit_user", "{not json");
    expect(getUser()).toBeNull();
  });

  test("returns null when nothing is stored", () => {
    expect(getUser()).toBeNull();
  });
});

describe("setSession and clearSession", () => {
  test("persists token and user", () => {
    setSession("tok", { userId: "u1", email: "a@b.c" });
    expect(getToken()).toBe("tok");
    expect(getUser()).toEqual({ userId: "u1", email: "a@b.c" });
  });

  test("clearSession removes both keys", () => {
    setSession("tok", { userId: "u1", email: "a@b.c" });
    clearSession();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });
});

describe("isAuthenticated", () => {
  test("true when a token exists", () => {
    localStorage.setItem("learnit_token", "x");
    expect(isAuthenticated()).toBe(true);
  });

  test("false when no token exists", () => {
    expect(isAuthenticated()).toBe(false);
  });
});

describe("getAuthHeaders", () => {
  test("returns a Bearer header when a token exists", () => {
    localStorage.setItem("learnit_token", "tok-1");
    expect(getAuthHeaders()).toEqual({ Authorization: "Bearer tok-1" });
  });

  test("returns an empty object when no token exists", () => {
    expect(getAuthHeaders()).toEqual({});
  });
});

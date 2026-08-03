import { afterEach, beforeEach, describe, expect, test, mock } from "bun:test";
import { memDb, objectIdHex } from "./memdb";
import { signJWT } from "../../api/src/auth";

// Replace the real Mongo connection with an in-memory shim before app.ts loads.
let db: ReturnType<typeof memDb> = memDb();
mock.module("../../api/src/db", () => ({
  getDB: async () => db,
  connectDB: async () => db,
}));

const { app } = await import("../../api/src/app");

const base = "http://localhost";
const get = (path: string, token?: string) =>
  app.handle(new Request(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }));
const post = (path: string, token: string | undefined, body: unknown) =>
  app.handle(new Request(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
const put = (path: string, token: string, body: unknown) =>
  app.handle(new Request(`${base}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }));
const del = (path: string, token: string) =>
  app.handle(new Request(`${base}${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }));

let token = "";
let userId = "";
beforeEach(async () => {
  db = memDb();
  userId = objectIdHex();
  await db.collection("users").insertOne({
    _id: userId,
    email: "a@b.c",
    name: "Anna",
    picture: null,
    createdAt: "2026-08-01",
  });
  token = await signJWT({ userId, email: "a@b.c" });
});
afterEach(() => mock.restore());

describe("GET /api/health", () => {
  test("reports ok without auth", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });
});

describe("auth", () => {
  test("protected routes reject a missing token", async () => {
    const res = await get("/api/goals");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  test("rejects a garbage token", async () => {
    const res = await get("/api/goals", "not-a-jwt");
    expect(res.status).toBe(401);
  });

  test("/api/auth/me returns the signed-in user", async () => {
    const res = await get("/api/auth/me", token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ _id: userId, email: "a@b.c", name: "Anna" });
  });
});

describe("goals CRUD", () => {
  const validGoal = { language: "german", objective: "Talk to locals", timeframe: "6 months" };

  test("lists an empty array initially", async () => {
    const res = await get("/api/goals", token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("creates a goal and lists it back", async () => {
    const created = await post("/api/goals", token, validGoal);
    expect(created.status).toBe(200);
    const body = (await created.json()) as { _id: string; language: string };
    expect(body._id).toBeTruthy();
    expect(body.language).toBe("german");

    const listed = await get("/api/goals", token);
    expect(((await listed.json()) as unknown[])).toHaveLength(1);
  });

  test("rejects a goal with a blank objective", async () => {
    const res = await post("/api/goals", token, { language: "german", objective: "" });
    expect(res.status).toBe(400);
  });

  test("updates an existing goal", async () => {
    const created = await post("/api/goals", token, validGoal);
    const { _id } = (await created.json()) as { _id: string };

    const updated = await put(`/api/goals/${_id}`, token, { objective: "Order coffee" });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ objective: "Order coffee" });
  });

  test("updating a missing goal 404s", async () => {
    const missingId = objectIdHex();
    const res = await put(`/api/goals/${missingId}`, token, { objective: "x" });
    expect(res.status).toBe(404);
  });

  test("deleting a goal removes it, twice 404s", async () => {
    const created = await post("/api/goals", token, validGoal);
    const { _id } = (await created.json()) as { _id: string };

    const first = await del(`/api/goals/${_id}`, token);
    expect(first.status).toBe(200);
    const second = await del(`/api/goals/${_id}`, token);
    expect(second.status).toBe(404);
  });
});

describe("streak", () => {
  test("creates a zero streak on first read", async () => {
    const res = await get("/api/streak", token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ currentStreak: 0, longestStreak: 0 });
  });

  test("update bumps the streak and is idempotent within a day", async () => {
    await get("/api/streak", token);
    const first = await post("/api/streak/update", token, {});
    const firstBody = (await first.json()) as { currentStreak: number };
    expect(firstBody.currentStreak).toBe(1);

    const again = await post("/api/streak/update", token, {});
    const againBody = (await again.json()) as { currentStreak: number };
    expect(againBody.currentStreak).toBe(1);
  });
});

describe("vocabulary", () => {
  test("creates and lists an entry", async () => {
    const created = await post("/api/vocabulary", token, { word: "Haus", meaning: "house", language: "german" });
    expect(created.status).toBe(200);
    const listed = await get("/api/vocabulary", token);
    const arr = (await listed.json()) as { word: string }[];
    expect(arr).toHaveLength(1);
    expect(arr[0].word).toBe("Haus");
  });

  test("rejects an entry without a meaning", async () => {
    const res = await post("/api/vocabulary", token, { word: "Haus", language: "german" });
    expect(res.status).toBe(400);
  });

  test("deleting a missing entry 404s", async () => {
    const missingId = objectIdHex();
    const res = await del(`/api/vocabulary/${missingId}`, token);
    expect(res.status).toBe(404);
  });
});

describe("preferences", () => {
  test("returns defaults when nothing is stored", async () => {
    const res = await get("/api/preferences", token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ activePathId: null, nativeLanguage: "english", difficultyBias: 0 });
  });

  test("persists a valid update", async () => {
    const res = await post("/api/preferences", token, { nativeLanguage: "spanish" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ nativeLanguage: "spanish" });
  });

  test("clamps difficulty bias to [-1, 1]", async () => {
    const res = await post("/api/preferences", token, { difficultyBias: 5 });
    expect(await res.json()).toMatchObject({ difficultyBias: 1 });
  });

  test("rejects an empty update", async () => {
    const res = await post("/api/preferences", token, {});
    expect(res.status).toBe(400);
  });
});

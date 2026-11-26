import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { totp } from "@wefaber/accounts";
import { memDb, objectIdHex } from "./memdb";
import { app, backfillLegacyUser, limiter, state } from "./harness";

const base = "http://localhost";
const PASSWORD = "Correcto-Caballo-9";

/** The cookies a client would hold: name → value, updated from each response's Set-Cookie. */
class Jar {
  cookies = new Map<string, string>();
  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  absorb(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const [pair = ""] = line.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!value || /max-age=0|expires=thu, 01 jan 1970/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

async function call(jar: Jar | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.handle(
    new Request(`${base}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(jar && jar.cookies.size > 0 ? { cookie: jar.header() } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  jar?.absorb(res);
  return res;
}

const json = async <T = Record<string, unknown> | unknown[]>(res: Response): Promise<T> => (await res.json()) as T;

async function signUp(handle = "faku", jar = new Jar()) {
  const res = await call(jar, "POST", "/api/auth/register", { handle, displayName: "Faku", password: PASSWORD });
  return { jar, res };
}

beforeEach(() => {
  state.db = memDb();
  limiter.reset();
});
afterEach(() => mock.restore());

describe("register", () => {
  test("creates the account, opens a session and shows the recovery codes once", async () => {
    const { jar, res } = await signUp();
    expect(res.status).toBe(201);
    const body = await json<{ user: { handle: string }; recoveryCodes: string[] }>(res);
    expect(body.user.handle).toBe("faku");
    expect(body.recoveryCodes).toHaveLength(8);
    expect(jar.cookies.has("learnit_session")).toBe(true);

    const me = await call(jar, "GET", "/api/me");
    expect(me.status).toBe(200);
    expect(JSON.stringify(await json(me))).not.toContain(body.recoveryCodes[0] ?? "-");
  });

  test("the session cookie is HttpOnly, Lax, scoped to /api and Secure", async () => {
    const { res } = await signUp();
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("learnit_session=")) ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Expires=/i);
  });

  test("refuses a taken handle, a weak password and an invalid handle", async () => {
    await signUp();
    expect((await signUp("FAKU")).res.status).toBe(422);
    const weak = await call(null, "POST", "/api/auth/register", { handle: "otro", displayName: "O", password: "corta" });
    expect(weak.status).toBe(422);
    const bad = await call(null, "POST", "/api/auth/register", { handle: "a b", displayName: "O", password: PASSWORD });
    expect(bad.status).toBe(422);
  });

  test("the password is stored hashed, never in clear", async () => {
    await signUp();
    const stored = JSON.stringify(state.db.collection("users")._docs);
    expect(stored).toContain("$argon2id$");
    expect(stored).not.toContain(PASSWORD);
  });

  test("the session is stored as a hash, not as the token", async () => {
    const { jar } = await signUp();
    const token = jar.cookies.get("learnit_session") ?? "";
    expect(JSON.stringify(state.db.collection("user_sessions")._docs)).not.toContain(token);
  });
});

describe("login and logout", () => {
  test("a right password opens a session; a wrong one and an unknown handle answer the same", async () => {
    await signUp();
    const jar = new Jar();
    expect((await call(jar, "POST", "/api/auth/login", { handle: "faku", password: PASSWORD })).status).toBe(200);
    expect((await call(jar, "GET", "/api/me")).status).toBe(200);

    const wrong = await call(null, "POST", "/api/auth/login", { handle: "faku", password: "mal-mal-mal-1" });
    const ghost = await call(null, "POST", "/api/auth/login", { handle: "ghost", password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(ghost.status).toBe(401);
    expect(await json(wrong)).toEqual(await json(ghost));
  });

  test("logout kills the session on the server, not only the cookie", async () => {
    const { jar } = await signUp();
    const stolen = jar.header();
    expect((await call(jar, "POST", "/api/auth/logout")).status).toBe(200);
    expect(jar.cookies.has("learnit_session")).toBe(false);

    const replay = await app.handle(new Request(`${base}/api/me`, { headers: { cookie: stolen } }));
    expect(replay.status).toBe(401);
  });

  test("an expired session is refused", async () => {
    const { jar } = await signUp();
    for (const doc of state.db.collection("user_sessions")._docs) doc.expiresAt = new Date(Date.now() - 1000);
    expect((await call(jar, "GET", "/api/me")).status).toBe(401);
  });

  test("a suspended account is locked out of the session it had", async () => {
    const { jar } = await signUp();
    const user = state.db.collection("users")._docs[0];
    if (user) user.status = "suspended";
    expect((await call(jar, "GET", "/api/me")).status).toBe(401);
    expect((await call(null, "POST", "/api/auth/login", { handle: "faku", password: PASSWORD })).status).toBe(403);
  });

  test("password login is throttled per handle", async () => {
    await signUp();
    let last = 200;
    for (let attempt = 0; attempt < 12; attempt++) {
      last = (await call(null, "POST", "/api/auth/login", { handle: "faku", password: "mal-mal-mal-1" })).status;
    }
    expect(last).toBe(429);
    // Even the right password waits once the handle is throttled.
    const right = await call(null, "POST", "/api/auth/login", { handle: "faku", password: PASSWORD });
    expect(right.status).toBe(429);
    expect(right.headers.get("retry-after")).toBeTruthy();
  });

  test("a cross-site origin cannot post to the auth routes", async () => {
    const res = await call(null, "POST", "/api/auth/login", { handle: "faku", password: PASSWORD }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });
});

describe("second step", () => {
  async function enableTotp() {
    const { jar } = await signUp();
    const begun = await json<{ secret: string; otpauth: string }>(await call(jar, "POST", "/api/auth/2fa/setup", {}));
    expect(begun.otpauth.startsWith("otpauth://totp/LearnIt:faku")).toBe(true);
    const confirm = await call(jar, "POST", "/api/auth/2fa/setup", { code: (await totp(begun.secret)) ?? "" });
    expect(confirm.status).toBe(200);
    return begun.secret;
  }

  test("login then asks for the code and only then opens the session", async () => {
    const secret = await enableTotp();
    const jar = new Jar();

    const first = await call(jar, "POST", "/api/auth/login", { handle: "faku", password: PASSWORD });
    expect(await json<object>(first)).toEqual({ status: "totp_required" });
    expect(jar.cookies.has("learnit_session")).toBe(false);
    expect((await call(jar, "GET", "/api/me")).status).toBe(401);

    expect((await call(jar, "POST", "/api/auth/2fa/verify", { code: "000000" })).status).toBe(401);
    const second = await call(jar, "POST", "/api/auth/2fa/verify", { code: (await totp(secret)) ?? "" });
    expect(second.status).toBe(200);
    expect((await call(jar, "GET", "/api/me")).status).toBe(200);
    expect(jar.cookies.has("learnit_2fa")).toBe(false);
  });

  test("the TOTP secret is encrypted at rest", async () => {
    const secret = await enableTotp();
    expect(JSON.stringify(state.db.collection("users")._docs)).not.toContain(secret);
  });

  test("recovery codes from sign-up open a session once", async () => {
    const { res } = await signUp();
    const { recoveryCodes } = await json<{ recoveryCodes: string[] }>(res);
    const code = recoveryCodes[0] ?? "";

    const jar = new Jar();
    expect((await call(jar, "POST", "/api/auth/2fa/recover", { handle: "faku", code })).status).toBe(200);
    expect((await call(jar, "GET", "/api/me")).status).toBe(200);
    expect((await call(null, "POST", "/api/auth/2fa/recover", { handle: "faku", code })).status).toBe(401);
  });
});

describe("isolation between users", () => {
  const goal = { language: "german", objective: "Talk to locals", timeframe: "6 months" };

  test("A cannot read, edit or delete B's goal, and the old PUT leak is closed", async () => {
    const a = (await signUp("anna-a")).jar;
    const b = (await signUp("berta-b")).jar;

    const created = await json<{ _id: string }>(await call(b, "POST", "/api/goals", goal));

    expect(await json<object[]>(await call(a, "GET", "/api/goals"))).toEqual([]);

    const put = await call(a, "PUT", `/api/goals/${created._id}`, { objective: "stolen" });
    expect(put.status).toBe(404);
    expect(JSON.stringify(await json(put))).not.toContain("Talk to locals");

    expect((await call(a, "DELETE", `/api/goals/${created._id}`)).status).toBe(404);

    const mine = await json<{ objective: string }[]>(await call(b, "GET", "/api/goals"));
    expect(mine).toHaveLength(1);
    expect(mine[0]?.objective).toBe("Talk to locals");
  });

  test("a goal id that is not an id is a 404, not a crash", async () => {
    const { jar } = await signUp();
    expect((await call(jar, "PUT", "/api/goals/nope", { objective: "x" })).status).toBe(404);
    expect((await call(jar, "DELETE", "/api/vocabulary/nope")).status).toBe(404);
  });
});

describe("account deletion", () => {
  test("removes every row of the user and leaves the other user's rows alone", async () => {
    const a = (await signUp("anna-a")).jar;
    const b = (await signUp("berta-b")).jar;
    for (const jar of [a, b]) {
      await call(jar, "POST", "/api/goals", { language: "german", objective: "Talk", timeframe: "1 month" });
      await call(jar, "GET", "/api/streak");
      await call(jar, "POST", "/api/vocabulary", { word: "Haus", meaning: "house", language: "german" });
    }
    const aId = String(state.db.collection("users")._docs.find((u) => u.handle === "anna-a")?._id);

    expect((await call(a, "DELETE", "/api/me", { confirm: "wrong", password: PASSWORD })).status).toBe(422);
    expect((await call(a, "DELETE", "/api/me", { confirm: "anna-a", password: "mal-mal-mal-1" })).status).toBe(401);
    expect((await call(a, "DELETE", "/api/me", { confirm: "anna-a", password: PASSWORD })).status).toBe(200);

    for (const name of ["goals", "streak", "vocabulary", "user_sessions", "user_recovery_codes"]) {
      const left = state.db.collection(name)._docs.filter((d) => d.userId === aId);
      expect(left).toHaveLength(0);
    }
    expect(state.db.collection("users")._docs.some((u) => String(u._id) === aId)).toBe(false);
    expect(state.db.collection("goals")._docs).toHaveLength(1);
    expect((await call(b, "GET", "/api/me")).status).toBe(200);
  });
});

describe("password change", () => {
  test("needs the current password and drops the other sessions", async () => {
    const { jar } = await signUp();
    const other = new Jar();
    await call(other, "POST", "/api/auth/login", { handle: "faku", password: PASSWORD });

    expect((await call(jar, "PATCH", "/api/me", { currentPassword: "mal-mal-mal-1", newPassword: "Nueva-Clave-77" })).status).toBe(422);
    expect((await call(jar, "PATCH", "/api/me", { currentPassword: PASSWORD, newPassword: "Nueva-Clave-77" })).status).toBe(200);

    expect((await call(other, "GET", "/api/me")).status).toBe(401);
    expect((await call(null, "POST", "/api/auth/login", { handle: "faku", password: "Nueva-Clave-77" })).status).toBe(200);
  });
});

describe("Google", () => {
  test("the callback refuses a state that does not match the cookie", async () => {
    const res = await call(null, "GET", "/api/auth/google/callback?code=abc&state=forged", undefined, {
      cookie: "learnit_oauth_state=real",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("auth_error=failed");
  });

  test("the entry point sets the state cookie and redirects to Google", async () => {
    const jar = new Jar();
    const res = await call(jar, "GET", "/api/auth/google");
    expect(res.status).toBe(302);
    const state = jar.cookies.get("learnit_oauth_state");
    expect(state).toBeTruthy();
    expect(res.headers.get("location")).toContain(`state=${state}`);
  });

  test("no token ever travels in a URL", async () => {
    const res = await call(null, "GET", "/api/auth/google/callback?error=access_denied");
    expect(res.headers.get("location")).not.toMatch(/jwt|token/i);
  });
});

describe("legacy users", () => {
  test("a pre-accounts Google user gets a handle and an encrypted email, and loses the plaintext", async () => {
    const _id = objectIdHex();
    await state.db.collection("users").insertOne({
      _id,
      googleId: "g-1",
      email: "Anna.Smith@example.com",
      name: "Anna Smith",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    const doc = state.db.collection("users")._docs[0];
    if (!doc) throw new Error("seed failed");

    await backfillLegacyUser(doc);

    const after = state.db.collection("users")._docs[0] ?? {};
    expect(after.handle).toBe("anna.smith");
    expect(after.displayName).toBe("Anna Smith");
    expect(after.emailEnc).toBeTruthy();
    expect("email" in after).toBe(false);
    expect(JSON.stringify(after)).not.toContain("example.com");
  });
});

describe("public text-to-speech", () => {
  test("is rate limited per address", async () => {
    let status = 0;
    for (let attempt = 0; attempt < 31; attempt++) {
      status = (await call(null, "GET", "/api/tts")).status;
    }
    // The first 30 get a 400 (no text); the 31st is over the budget.
    expect(status).toBe(429);
  });
});

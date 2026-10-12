import type { AccountUser } from "@wefaber/accounts";
import { CHALLENGE_MS, challengeCookie, sessionCookie } from "@wefaber/accounts";
import { Elysia, t } from "elysia";
import { appUrl, exchangeGoogleCode, googleAuthUrl } from "../auth";
import { getDB } from "../db";
import { forUser } from "../db/scoped";
import {
  CHALLENGE_COOKIE,
  LIMITS,
  SESSION_COOKIE,
  accounts,
  addressOf,
  authenticate,
  cookieConfig,
  limiter,
  readCookie,
  signInWithGoogle,
  store,
} from "./index";

const OAUTH_STATE_COOKIE = "learnit_oauth_state";

type Cookies = Record<string, { set(options: Record<string, unknown>): void; remove(): void } | undefined>;

/** What the client may see of an account. Never a hash, never a secret. */
export async function publicUser(user: AccountUser) {
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    hasPassword: user.passwordHash !== null,
    hasEmail: user.emailEnc !== null,
    totpEnabled: user.totpEnabled,
    recoveryCodesLeft: await accounts.recoveryCodesLeft(user.id),
    createdAt: user.createdAt.toISOString(),
  };
}

const setSession = (cookie: Cookies, session: { token: string; expiresAt: Date }) =>
  cookie[SESSION_COOKIE]?.set({ value: session.token, ...sessionCookie(session.expiresAt, cookieConfig()) });

const sameOrigin = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host || origin === (process.env.APP_URL ?? "http://localhost:4321");
  } catch {
    return false;
  }
};

const registerBody = t.Object({
  handle: t.String({ maxLength: 60 }),
  displayName: t.String({ maxLength: 120 }),
  password: t.String({ maxLength: 200 }),
  email: t.Optional(t.String({ maxLength: 300 })),
});
const loginBody = t.Object({ handle: t.String({ maxLength: 60 }), password: t.String({ maxLength: 200 }) });
const codeBody = t.Object({ code: t.String({ maxLength: 20 }) });
const recoverBody = t.Object({ handle: t.String({ maxLength: 60 }), code: t.String({ maxLength: 20 }) });
const passwordBody = t.Object({ password: t.String({ maxLength: 200 }) });
const patchMeBody = t.Object({
  displayName: t.Optional(t.String({ maxLength: 120 })),
  email: t.Optional(t.String({ maxLength: 300 })),
  currentPassword: t.Optional(t.String({ maxLength: 200 })),
  newPassword: t.Optional(t.String({ maxLength: 200 })),
});
const deleteMeBody = t.Object({ confirm: t.String({ maxLength: 60 }), password: t.Optional(t.String({ maxLength: 200 })) });

export const accountRoutes = new Elysia({ name: "learnit-accounts" })
  /** Rate limit on everything that tries credentials, and a same-origin check on anything that changes state. */
  .onBeforeHandle(({ request, server, set, path }) => {
    if (request.method === "GET" || request.method === "HEAD") return;
    if (!path.startsWith("/api/auth/") && !path.startsWith("/api/me")) return;

    if (!sameOrigin(request)) {
      set.status = 403;
      return { error: "origin not allowed", code: "bad_origin" };
    }
    if (!path.startsWith("/api/auth/")) return;

    const allowance = limiter.take(`auth:${addressOf(request, server)}`, LIMITS.auth);
    if (!allowance.ok) {
      set.status = 429;
      set.headers["retry-after"] = String(allowance.retryAfter);
      return { error: "demasiados intentos, esperá un rato", code: "rate_limited" };
    }
  })

  /* --- Sign up and in ---------------------------------------------------- */

  .post(
    "/api/auth/register",
    async ({ body, cookie, set }) => {
      const created = await accounts.register({
        handle: body.handle,
        displayName: body.displayName,
        password: body.password,
        email: body.email,
      });
      if (!created.ok) {
        set.status = 422;
        return { error: created.error };
      }
      setSession(cookie as Cookies, await accounts.startSession(created.value.user.id));
      set.status = 201;
      // Shown once: the store keeps only the sha256.
      return { user: await publicUser(created.value.user), recoveryCodes: created.value.recoveryCodes };
    },
    { body: registerBody },
  )

  .post(
    "/api/auth/login",
    async ({ body, cookie, set }) => {
      const perHandle = limiter.take(`login:${body.handle.trim().toLowerCase()}`, LIMITS.login);
      if (!perHandle.ok) {
        set.status = 429;
        set.headers["retry-after"] = String(perHandle.retryAfter);
        return { error: "demasiados intentos, esperá un rato", code: "rate_limited" };
      }

      const outcome = await accounts.login(body.handle, body.password);
      switch (outcome.kind) {
        case "ok":
          setSession(cookie as Cookies, outcome.session);
          return { status: "ok", user: await publicUser(outcome.user) };
        case "totp":
          (cookie as Cookies)[CHALLENGE_COOKIE]?.set({ value: outcome.challenge, ...challengeCookie(CHALLENGE_MS, cookieConfig()) });
          return { status: "totp_required" };
        case "suspended":
          set.status = 403;
          return { error: "esa cuenta está suspendida", code: "suspended" };
        case "unavailable":
          set.status = 503;
          return { error: "el segundo paso no está disponible", code: "unavailable" };
        default:
          set.status = 401;
          return { error: "handle o contraseña incorrectos", code: "invalid_credentials" };
      }
    },
    { body: loginBody },
  )

  .post(
    "/api/auth/2fa/verify",
    async ({ body, cookie, request, set }) => {
      const challenge = readCookie(request.headers.get("cookie"), CHALLENGE_COOKIE) ?? "";
      const outcome = await accounts.completeTotp(challenge, body.code);
      if (outcome.kind === "ok") {
        setSession(cookie as Cookies, outcome.session);
        (cookie as Cookies)[CHALLENGE_COOKIE]?.remove();
        return { status: "ok", user: await publicUser(outcome.user) };
      }
      set.status = 401;
      return outcome.kind === "expired"
        ? { error: "el segundo paso venció, volvé a entrar", code: "challenge_expired" }
        : { error: "código incorrecto", code: "invalid_code" };
    },
    { body: codeBody },
  )

  .post(
    "/api/auth/2fa/recover",
    async ({ body, cookie, set }) => {
      const perHandle = limiter.take(`login:${body.handle.trim().toLowerCase()}`, LIMITS.login);
      if (!perHandle.ok) {
        set.status = 429;
        set.headers["retry-after"] = String(perHandle.retryAfter);
        return { error: "demasiados intentos, esperá un rato", code: "rate_limited" };
      }
      const outcome = await accounts.recover(body.handle, body.code);
      if (outcome.kind !== "ok") {
        set.status = 401;
        return { error: "handle o código incorrectos", code: "invalid_code" };
      }
      setSession(cookie as Cookies, outcome.session);
      return { status: "ok", user: await publicUser(outcome.user) };
    },
    { body: recoverBody },
  )

  .post("/api/auth/logout", async ({ cookie, request }) => {
    await accounts.logout(readCookie(request.headers.get("cookie"), SESSION_COOKIE));
    (cookie as Cookies)[SESSION_COOKIE]?.remove();
    return { status: "ok" };
  })

  /* --- Google, a linked way in ------------------------------------------- */

  .get("/api/auth/google", ({ cookie }) => {
    const state = crypto.randomUUID();
    (cookie as Cookies)[OAUTH_STATE_COOKIE]?.set({
      value: state,
      httpOnly: true,
      secure: cookieConfig().secure ?? true,
      sameSite: "lax",
      path: "/api",
      maxAge: 600,
    });
    return new Response(null, { status: 302, headers: { Location: googleAuthUrl(state) } });
  })

  .get("/api/auth/google/callback", async ({ query, cookie, request }) => {
    const states = cookie as Cookies;
    const expected = readCookie(request.headers.get("cookie"), OAUTH_STATE_COOKIE);
    states[OAUTH_STATE_COOKIE]?.remove();

    const fail = (reason: string) =>
      new Response(null, { status: 302, headers: { Location: appUrl(`/?auth_error=${reason}`) } });

    if (query.error || !query.code) return fail("denied");
    if (!expected || query.state !== expected) return fail("failed");

    const profile = await exchangeGoogleCode(query.code);
    if (!profile) return fail("failed");

    const session = await signInWithGoogle(profile);
    if (!session) return fail("failed");

    setSession(states, session);
    return new Response(null, { status: 302, headers: { Location: appUrl("/learn") } });
  }, { query: t.Object({ code: t.Optional(t.String()), error: t.Optional(t.String()), state: t.Optional(t.String()) }) })

  /* --- Me ---------------------------------------------------------------- */

  .get("/api/me", async ({ headers, set }) => {
    const user = await authenticate(headers);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    return { user: await publicUser(user) };
  })

  .patch(
    "/api/me",
    async ({ body, headers, set }) => {
      const user = await authenticate(headers);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      if (body.newPassword !== undefined) {
        const changed = await accounts.changePassword(user, body.currentPassword ?? "", body.newPassword);
        if (!changed.ok) {
          set.status = 422;
          return { error: changed.error };
        }
        await accounts.logoutEverywhere(user.id);
      }
      if (body.displayName !== undefined) {
        const renamed = await accounts.setDisplayName(user.id, body.displayName);
        if (!renamed.ok) {
          set.status = 422;
          return { error: renamed.error };
        }
      }
      if (body.email !== undefined) {
        const changed = await accounts.setEmail(user.id, body.email);
        if (!changed.ok) {
          set.status = 422;
          return { error: changed.error };
        }
      }

      const fresh = await store.findUserById(user.id);
      return { user: await publicUser(fresh ?? user) };
    },
    { body: patchMeBody },
  )

  /**
   * Real deletion (ADR 0002): every row the user owns, then the account. Typing the handle confirms intent; an
   * account with a password also proves it.
   */
  .delete(
    "/api/me",
    async ({ body, cookie, headers, set }) => {
      const user = await authenticate(headers);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (body.confirm.trim().toLowerCase() !== user.handle) {
        set.status = 422;
        return { error: "escribí tu handle para confirmar", code: "confirm_mismatch" };
      }
      if (user.passwordHash && !(await accounts.verifyPassword(user, body.password ?? ""))) {
        set.status = 401;
        return { error: "la contraseña no coincide", code: "invalid_credentials" };
      }

      await forUser(await getDB(), user.id).deleteEverything();
      await store.deleteUser(user.id);
      (cookie as Cookies)[SESSION_COOKIE]?.remove();
      return { status: "ok" };
    },
    { body: deleteMeBody },
  )

  .post(
    "/api/me/recovery-codes",
    async ({ body, headers, set }) => {
      const user = await authenticate(headers);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (!(await accounts.verifyPassword(user, body.password))) {
        set.status = 401;
        return { error: "la contraseña no coincide", code: "invalid_credentials" };
      }
      return { recoveryCodes: await accounts.regenerateRecoveryCodes(user.id) };
    },
    { body: passwordBody },
  )

  /* --- Second step (signed in) ------------------------------------------- */

  /** Without `code` it starts the activation and returns the secret once, for the QR. With `code` it confirms. */
  .post(
    "/api/auth/2fa/setup",
    async ({ body, headers, set }) => {
      const user = await authenticate(headers);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      if (body.code !== undefined) {
        const confirmed = await accounts.confirmTotp(user, body.code);
        if (!confirmed.ok) {
          set.status = 422;
          return { error: confirmed.error };
        }
        return { status: "ok", totpEnabled: true };
      }

      const begun = await accounts.beginTotp(user);
      if (!begun.ok) {
        set.status = 422;
        return { error: begun.error };
      }
      return begun.value;
    },
    { body: t.Object({ code: t.Optional(t.String({ maxLength: 10 })) }) },
  )

  .post(
    "/api/auth/2fa/disable",
    async ({ body, headers, set }) => {
      const user = await authenticate(headers);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const disabled = await accounts.disableTotp(user, body.password);
      if (!disabled.ok) {
        set.status = 401;
        return { error: disabled.error, code: "invalid_credentials" };
      }
      return { status: "ok", totpEnabled: false };
    },
    { body: passwordBody },
  );

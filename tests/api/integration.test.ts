import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  verifyCredential,
  type PublicKeyDocument,
  type SignedCredential,
} from "../../api/src/integration/credentials";
import { CREDENTIAL_KEY, SERVICE_TOKEN, SERVICE_TOKEN_NEXT, app, limiter, state } from "./harness";
import { memDb, objectIdHex } from "./memdb";

/** Contract tests for the JobIt integration (issue #10, ADR 0003). The bank is seeded; nothing calls a model. */

const base = "http://localhost";
const PASSWORD = "Correcto-Caballo-9";

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

async function call(
  who: { jar?: Jar | null; token?: string | null },
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await app.handle(
    new Request(`${base}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(who.jar && who.jar.cookies.size > 0 ? { cookie: who.jar.header() } : {}),
        ...(who.token ? { authorization: `Bearer ${who.token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  who.jar?.absorb(res);
  return res;
}

const json = async <T = Record<string, any>>(res: Response): Promise<T> => (await res.json()) as T;
const svc = { token: SERVICE_TOKEN };

async function signUp(handle: string) {
  const jar = new Jar();
  const res = await call({ jar }, "POST", "/api/auth/register", {
    handle,
    displayName: handle,
    password: PASSWORD,
  });
  expect(res.status).toBe(201);
  const me = await json(await call({ jar }, "GET", "/api/me"));
  return { jar, id: String(me.user.id), handle };
}

/** n gradable questions; the right answer is option 1. */
async function seedBank(n = 4, opts: { leaf?: string; level?: string; topics?: string[] } = {}) {
  const { leaf = "german", level = "beginner", topics = ["Greetings", "Numbers"] } = opts;
  for (let i = 0; i < n; i++) {
    await state.db.collection("exercises").insertOne({
      _id: objectIdHex(),
      taxonomyLeaf: leaf,
      level,
      topic: topics[i % topics.length],
      type: "multiple_choice",
      question: `Question ${i}?`,
      options: ["wrong", "right", "wrong too"],
      correctIndex: 1,
    } as never);
  }
}

const allRight = (count: number) => Array.from({ length: count }, (_, q) => ({ q, choice: 1 }));
const allWrong = (count: number) => Array.from({ length: count }, (_, q) => ({ q, choice: 0 }));

async function createAssessment(extra: Record<string, unknown> = {}) {
  const res = await call(svc, "POST", "/api/service/assessments", {
    subject: "german",
    level: "beginner",
    offer_id: "offer-7",
    ...extra,
  });
  return { res, body: await json(res) };
}

async function consentFor(user: { jar: Jar }, extra: Record<string, unknown> = {}) {
  const res = await call(user, "POST", "/api/integration/consents", {
    applicationId: "app-1",
    ...extra,
  });
  return { res, body: await json(res) };
}

/** Create, claim and submit an assessment as `user`. Returns everything a test may want to look at. */
async function takeAssessment(
  user: { jar: Jar },
  answers: (n: number) => { q: number; choice: number }[],
  extra: Record<string, unknown> = {},
) {
  const created = (await createAssessment(extra)).body;
  const claim = await json(
    await call(user, "POST", "/api/integration/assessments/claim", { code: created.code }),
  );
  const submit = await call(user, "POST", `/api/integration/assessments/${created.id}/answers`, {
    answers: answers(claim.questions.length),
  });
  return { created, claim, submit, result: await json(submit) };
}

const rows = async (name: string) =>
  (await state.db.collection(name).find({}).toArray()) as Record<string, any>[];

beforeEach(() => {
  state.db = memDb();
  limiter.reset();
});
afterEach(() => mock.restore());

describe("GET /api/catalog", () => {
  test("is public, read-only and carries lineage and path metadata", async () => {
    await seedBank(4);
    const res = await call({}, "GET", "/api/catalog");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("public");

    const catalog = await json(res);
    const german = catalog.subjects.find((s: any) => s.id === "german");
    expect(german.lineage.map((l: any) => l.id)).toEqual(["language", "german"]);
    const path = german.paths[0];
    expect(path).toMatchObject({ level: "beginner", topicCount: 2, exerciseCount: 4 });
    expect(path.effortMinutes).toBeGreaterThan(0);
    expect(path.topics.map((t: any) => t.name).sort()).toEqual(["Greetings", "Numbers"]);
  });

  test("never carries personal data, even when users and paths exist", async () => {
    await seedBank(3);
    const user = await signUp("anna");
    await state.db
      .collection("paths")
      .insertOne({
        _id: objectIdHex(),
        userId: user.id,
        subject: "German",
        objective: "secret goal",
        modules: [],
      } as never);
    const text = JSON.stringify(await json(await call({}, "GET", "/api/catalog")));
    for (const leak of [user.id, "anna", "secret goal", "userId", "email"])
      expect(text).not.toContain(leak);
  });

  test("has no write verbs", async () => {
    expect((await call({}, "POST", "/api/catalog", {})).status).toBeGreaterThanOrEqual(404);
    expect((await call({}, "DELETE", "/api/catalog")).status).toBeGreaterThanOrEqual(404);
  });
});

describe("service token", () => {
  const routes: [string, string, unknown?][] = [
    ["POST", "/api/service/assessments", { subject: "german", level: "beginner" }],
    ["GET", "/api/service/assessments/anything"],
    ["POST", "/api/service/link", { code: "x" }],
    ["GET", "/api/service/links/anything"],
  ];

  test("no token: 401 on every service route", async () => {
    for (const [method, path, body] of routes) {
      const res = await call({}, method, path, body);
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain("Bearer");
    }
  });

  test("a wrong token, a short token and a non-bearer scheme are refused", async () => {
    for (const token of ["nope", "x".repeat(40), SERVICE_TOKEN.slice(0, 20)]) {
      expect((await call({ token }, "GET", "/api/service/assessments/anything")).status).toBe(401);
    }
    const basic = await call({}, "GET", "/api/service/assessments/anything", undefined, {
      authorization: `Basic ${SERVICE_TOKEN}`,
    });
    expect(basic.status).toBe(401);
  });

  test("a valid token passes the guard (unknown id is 404, not 401)", async () => {
    expect((await call(svc, "GET", "/api/service/assessments/anything")).status).toBe(404);
  });

  test("rotation: every configured token works", async () => {
    expect(
      (await call({ token: SERVICE_TOKEN }, "GET", "/api/service/assessments/anything")).status,
    ).toBe(404);
    expect(
      (await call({ token: SERVICE_TOKEN_NEXT }, "GET", "/api/service/assessments/anything"))
        .status,
    ).toBe(404);
  });

  test("a removed token stops working", async () => {
    const previous = process.env.SERVICE_TOKENS;
    process.env.SERVICE_TOKENS = SERVICE_TOKEN_NEXT;
    try {
      expect(
        (await call({ token: SERVICE_TOKEN }, "GET", "/api/service/assessments/anything")).status,
      ).toBe(401);
      expect(
        (await call({ token: SERVICE_TOKEN_NEXT }, "GET", "/api/service/assessments/anything"))
          .status,
      ).toBe(404);
    } finally {
      process.env.SERVICE_TOKENS = previous;
    }
  });

  test("with no tokens configured, nothing gets in", async () => {
    const previous = process.env.SERVICE_TOKENS;
    process.env.SERVICE_TOKENS = "";
    try {
      expect((await call(svc, "GET", "/api/service/assessments/anything")).status).toBe(401);
    } finally {
      process.env.SERVICE_TOKENS = previous;
    }
  });

  test("a user session does not open /api/service", async () => {
    const user = await signUp("anna");
    expect((await call(user, "GET", "/api/service/assessments/anything")).status).toBe(401);
    expect((await call(user, "POST", "/api/service/link", { code: "x" })).status).toBe(401);
  });

  test("a service token is not a user session", async () => {
    expect((await call(svc, "GET", "/api/integration/consents")).status).toBe(401);
    expect((await call(svc, "GET", "/api/me")).status).toBe(401);
  });

  test("failed attempts are rate limited per address", async () => {
    let last = 0;
    for (let i = 0; i < 40; i++)
      last = (await call({ token: "wrong" }, "GET", "/api/service/assessments/x")).status;
    expect(last).toBe(429);
  });
});

describe("assessments", () => {
  test("create returns an id plus a code and url to take it, and stores only the hash", async () => {
    await seedBank(4);
    const { res, body } = await createAssessment();
    expect(res.status).toBe(201);
    expect(body.id).toBeString();
    expect(body.code.length).toBeGreaterThanOrEqual(43);
    expect(body.url).toBe(`http://localhost:4321/assessment?code=${encodeURIComponent(body.code)}`);
    expect(body.question_count).toBe(4);

    const [stored] = await rows("assessments");
    expect(JSON.stringify(stored)).not.toContain(body.code);
    expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.offerId).toBe("offer-7");
  });

  test("a subject nothing covers is 404; too few questions is 422; bad input is 400", async () => {
    expect((await createAssessment({ subject: "klingon" })).res.status).toBe(404);
    await seedBank(2);
    expect((await createAssessment()).res.status).toBe(422);
    expect((await createAssessment({ subject: "" })).res.status).toBe(400);
    expect((await createAssessment({ level: "not a level!" })).res.status).toBe(400);
  });

  test("can be narrowed to a topic", async () => {
    await seedBank(6);
    const { body } = await createAssessment({ topic: "Greetings" });
    expect(body.question_count).toBe(3);
    expect((await createAssessment({ topic: "Nonexistent" })).res.status).toBe(422);
  });

  test("pending result: status, no verdict yet", async () => {
    await seedBank(4);
    const { body } = await createAssessment();
    const result = await json(await call(svc, "GET", `/api/service/assessments/${body.id}`));
    expect(result).toMatchObject({
      id: body.id,
      status: "pending",
      passed: null,
      score: null,
      failed_topics: [],
    });
  });

  test("the applicant needs a session to claim, and a valid code", async () => {
    await seedBank(4);
    const { body } = await createAssessment();
    expect(
      (await call({}, "POST", "/api/integration/assessments/claim", { code: body.code })).status,
    ).toBe(401);
    const user = await signUp("anna");
    expect(
      (await call(user, "POST", "/api/integration/assessments/claim", { code: "wrong" })).status,
    ).toBe(404);
  });

  test("claiming shows the questions and never the answer key", async () => {
    await seedBank(4);
    const user = await signUp("anna");
    const { body } = await createAssessment();
    const res = await call(user, "POST", "/api/integration/assessments/claim", { code: body.code });
    expect(res.status).toBe(200);
    const text = JSON.stringify(await json(res));
    for (const key of ["correctIndex", "correctAnswer", "spec", "grading"])
      expect(text).not.toContain(key);
    expect(text).toContain("Question");
  });

  test("passing: result has status, passed, score and no failed topics", async () => {
    await seedBank(4);
    const user = await signUp("anna");
    const { created, result } = await takeAssessment(user, allRight);
    expect(result).toMatchObject({
      status: "completed",
      passed: true,
      score: 100,
      failed_topics: [],
    });

    const read = await json(await call(svc, "GET", `/api/service/assessments/${created.id}`));
    expect(read).toMatchObject({
      status: "completed",
      passed: true,
      score: 100,
      failed_topics: [],
    });
  });

  test("failing: reports the failed topics and issues no credential", async () => {
    await seedBank(4);
    const user = await signUp("anna");
    const { created, result } = await takeAssessment(user, allWrong);
    expect(result).toMatchObject({ passed: false, score: 0, credentialToken: null });
    expect(result.failed_topics).toEqual(["Greetings", "Numbers"]);

    const read = await json(await call(svc, "GET", `/api/service/assessments/${created.id}`));
    expect(read).toMatchObject({ status: "completed", passed: false, score: 0 });
    expect(await rows("assessment_credentials")).toHaveLength(0);
  });

  test("unanswered questions count as wrong", async () => {
    await seedBank(4);
    const user = await signUp("anna");
    const { result } = await takeAssessment(user, () => []);
    expect(result.score).toBe(0);
  });

  test("an assessment is graded once", async () => {
    await seedBank(4);
    const user = await signUp("anna");
    const { created } = await takeAssessment(user, allRight);
    const again = await call(user, "POST", `/api/integration/assessments/${created.id}/answers`, {
      answers: allWrong(4),
    });
    expect(again.status).toBe(409);
    expect(
      (await json(await call(svc, "GET", `/api/service/assessments/${created.id}`))).passed,
    ).toBe(true);
  });

  test("another account cannot claim the same code, nor submit for it", async () => {
    await seedBank(4);
    const anna = await signUp("anna");
    const bob = await signUp("bob");
    const { body } = await createAssessment();
    expect(
      (await call(anna, "POST", "/api/integration/assessments/claim", { code: body.code })).status,
    ).toBe(200);
    expect(
      (await call(bob, "POST", "/api/integration/assessments/claim", { code: body.code })).status,
    ).toBe(404);
    expect(
      (
        await call(bob, "POST", `/api/integration/assessments/${body.id}/answers`, {
          answers: allRight(4),
        })
      ).status,
    ).toBe(404);
  });

  test("the same applicant can resume an assessment in progress", async () => {
    await seedBank(4);
    const anna = await signUp("anna");
    const { body } = await createAssessment();
    expect(
      (await call(anna, "POST", "/api/integration/assessments/claim", { code: body.code })).status,
    ).toBe(200);
    expect(
      (await call(anna, "POST", "/api/integration/assessments/claim", { code: body.code })).status,
    ).toBe(200);
  });

  test("an expired assessment cannot be claimed or submitted", async () => {
    await seedBank(4);
    const anna = await signUp("anna");
    const { body } = await createAssessment();
    await state.db
      .collection("assessments")
      .updateOne({ _id: body.id } as never, { $set: { expiresAt: "2000-01-01T00:00:00.000Z" } });
    expect(
      (await call(anna, "POST", "/api/integration/assessments/claim", { code: body.code })).status,
    ).toBe(410);
    expect((await json(await call(svc, "GET", `/api/service/assessments/${body.id}`))).status).toBe(
      "expired",
    );
  });

  test("the answers route needs a session and the same origin", async () => {
    await seedBank(4);
    const anna = await signUp("anna");
    const { body } = await createAssessment();
    await call(anna, "POST", "/api/integration/assessments/claim", { code: body.code });
    expect(
      (await call({}, "POST", `/api/integration/assessments/${body.id}/answers`, { answers: [] }))
        .status,
    ).toBe(401);
    const cross = await call(
      anna,
      "POST",
      `/api/integration/assessments/${body.id}/answers`,
      { answers: [] },
      { origin: "https://evil.example" },
    );
    expect(cross.status).toBe(403);
  });
});

describe("consent and link", () => {
  test("creating a consent needs a session, the same origin and an application", async () => {
    const anna = await signUp("anna");
    expect(
      (await call({}, "POST", "/api/integration/consents", { applicationId: "a" })).status,
    ).toBe(401);
    const cross = await call(
      anna,
      "POST",
      "/api/integration/consents",
      { applicationId: "a" },
      { origin: "https://evil.example" },
    );
    expect(cross.status).toBe(403);
    expect((await call(anna, "POST", "/api/integration/consents", {})).status).toBe(400);
    expect(
      (await call(anna, "POST", "/api/integration/consents", { applicationId: "a", days: 9999 }))
        .status,
    ).toBe(400);
  });

  test("returns a one-time code, stores only its hash, and shares only the assessment by default", async () => {
    const anna = await signUp("anna");
    const { res, body } = await consentFor(anna);
    expect(res.status).toBe(201);
    expect(body.code.length).toBeGreaterThanOrEqual(43);
    expect(body.scopes).toEqual(["assessment"]);

    const [stored] = await rows("integration_consents");
    expect(JSON.stringify(stored)).not.toContain(body.code);
    expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.userId).toBe(anna.id);
  });

  test("redeeming the code gives an opaque link id; the code works once", async () => {
    const anna = await signUp("anna");
    const { body: consent } = await consentFor(anna);

    const first = await call(svc, "POST", "/api/service/link", { code: consent.code });
    expect(first.status).toBe(201);
    const link = await json(first);
    expect(link.link_id).toBeString();
    expect(link.application_id).toBe("app-1");
    expect(link.scopes).toEqual(["assessment"]);
    expect(JSON.stringify(link)).not.toContain(anna.id);
    expect(JSON.stringify(link)).not.toContain("anna");

    const second = await call(svc, "POST", "/api/service/link", { code: consent.code });
    expect(second.status).toBe(400);
    expect((await json(second)).code).toBe("invalid_code");

    const [stored] = await rows("integration_consents");
    expect(JSON.stringify(stored)).not.toContain(link.link_id);
  });

  test("two simultaneous redemptions: exactly one wins", async () => {
    const anna = await signUp("anna");
    const { body: consent } = await consentFor(anna);
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => call(svc, "POST", "/api/service/link", { code: consent.code })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });

  test("an unknown, an expired and a revoked code all look the same", async () => {
    const anna = await signUp("anna");
    const unknown = await call(svc, "POST", "/api/service/link", { code: "nope" });

    const { body: stale } = await consentFor(anna);
    await state.db
      .collection("integration_consents")
      .updateOne({ _id: stale.id } as never, {
        $set: { codeExpiresAt: "2000-01-01T00:00:00.000Z" },
      });
    const expired = await call(svc, "POST", "/api/service/link", { code: stale.code });

    const { body: gone } = await consentFor(anna);
    await call(anna, "DELETE", `/api/integration/consents/${gone.id}`);
    const revoked = await call(svc, "POST", "/api/service/link", { code: gone.code });

    for (const res of [unknown, expired, revoked]) {
      expect(res.status).toBe(400);
      expect(JSON.stringify(await json(res))).toBe(
        JSON.stringify({ error: "that code is not valid", code: "invalid_code" }),
      );
    }
  });

  test("redeeming needs a service token", async () => {
    const anna = await signUp("anna");
    const { body } = await consentFor(anna);
    expect((await call({}, "POST", "/api/service/link", { code: body.code })).status).toBe(401);
    expect((await call(anna, "POST", "/api/service/link", { code: body.code })).status).toBe(401);
  });

  test("an unspent code expires on its own", async () => {
    const anna = await signUp("anna");
    const { body } = await consentFor(anna);
    expect(Date.parse(body.codeExpiresAt)).toBeGreaterThan(Date.now());
    expect(Date.parse(body.codeExpiresAt)).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000);
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.parse(body.codeExpiresAt));
  });
});

describe("what a link reveals", () => {
  async function linked(user: { jar: Jar }, extra: Record<string, unknown> = {}) {
    const { body: consent } = await consentFor(user, extra);
    const link = await json(await call(svc, "POST", "/api/service/link", { code: consent.code }));
    return { consent, linkId: link.link_id as string };
  }

  test("by default only the assessment result is shared, never the path", async () => {
    await seedBank(4);
    const anna = await signUp("anna");
    await state.db
      .collection("paths")
      .insertOne({
        _id: objectIdHex(),
        userId: anna.id,
        subject: "German",
        objective: "private goal",
        modules: [],
      } as never);
    const { consent, linkId } = await linked(anna);
    await takeAssessment(anna, allRight, { link_id: linkId });

    const res = await call(svc, "GET", `/api/service/links/${linkId}`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.application_id).toBe("app-1");
    expect(body.assessment).toMatchObject({ status: "completed", passed: true, score: 100 });
    expect(body.paths).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("private goal");
    expect(JSON.stringify(body)).not.toContain(anna.id);
    expect(body.scopes).toEqual(consent.scopes);
  });

  test("a path is shared only when the applicant opted in to that item", async () => {
    const anna = await signUp("anna");
    const shared = objectIdHex();
    const kept = objectIdHex();
    await state.db.collection("paths").insertOne({
      _id: shared,
      userId: anna.id,
      subject: "German",
      objective: "share me",
      startingLevel: "complete_beginner",
      modules: [{ name: "Basics", topics: [{ name: "Hello" }] }],
    } as never);
    await state.db
      .collection("paths")
      .insertOne({
        _id: kept,
        userId: anna.id,
        subject: "French",
        objective: "keep me",
        modules: [],
      } as never);

    const { linkId } = await linked(anna, { paths: [shared] });
    const body = await json(await call(svc, "GET", `/api/service/links/${linkId}`));
    expect(body.scopes).toEqual(["assessment", `path:${shared}`]);
    expect(body.paths).toHaveLength(1);
    expect(body.paths[0]).toMatchObject({
      id: shared,
      subject: "German",
      modules: [{ name: "Basics", topics: [{ name: "Hello" }] }],
    });
    expect(JSON.stringify(body)).not.toContain("keep me");
  });

  test("a path that is not the applicant's cannot be offered", async () => {
    const anna = await signUp("anna");
    const bob = await signUp("bob");
    const bobsPath = objectIdHex();
    await state.db
      .collection("paths")
      .insertOne({ _id: bobsPath, userId: bob.id, subject: "German", modules: [] } as never);
    const res = await call(anna, "POST", "/api/integration/consents", {
      applicationId: "a",
      paths: [bobsPath],
    });
    expect(res.status).toBe(404);
    expect(
      (
        await call(anna, "POST", "/api/integration/consents", {
          applicationId: "a",
          paths: ["not-an-id"],
        })
      ).status,
    ).toBe(400);
  });

  test("an unknown link id is 404", async () => {
    expect((await call(svc, "GET", "/api/service/links/does-not-exist")).status).toBe(404);
  });

  test("LearnIt records what it shared and when", async () => {
    await seedBank(4);
    const anna = await signUp("anna");
    const { consent, linkId } = await linked(anna);
    await takeAssessment(anna, allRight, { link_id: linkId });
    await call(svc, "GET", `/api/service/links/${linkId}`);

    const listed = await json(await call(anna, "GET", "/api/integration/consents"));
    const entry = listed.consents.find((c: any) => c.id === consent.id);
    expect(entry.state).toBe("active");
    expect(entry.redeemed).toBe(true);
    expect(entry.shared.map((s: any) => s.what).sort()).toEqual([
      "assessment_result",
      "credential",
    ]);
    for (const share of entry.shared) expect(Date.parse(share.at)).not.toBeNaN();
    expect(JSON.stringify(listed)).not.toContain(consent.code);
  });

  test("an assessment tied to a link can only be taken by the applicant who granted it", async () => {
    await seedBank(4);
    const anna = await signUp("anna");
    const bob = await signUp("bob");
    const { linkId } = await linked(anna);
    const { body } = await createAssessment({ link_id: linkId });
    const stolen = await call(bob, "POST", "/api/integration/assessments/claim", {
      code: body.code,
    });
    expect(stolen.status).toBe(403);
    expect(
      (await call(anna, "POST", "/api/integration/assessments/claim", { code: body.code })).status,
    ).toBe(200);
  });

  test("creating an assessment against an unknown or revoked link is refused", async () => {
    await seedBank(4);
    const anna = await signUp("anna");
    expect((await createAssessment({ link_id: "nope" })).res.status).toBe(404);
    const { consent, linkId } = await linked(anna);
    await call(anna, "DELETE", `/api/integration/consents/${consent.id}`);
    expect((await createAssessment({ link_id: linkId })).res.status).toBe(403);
  });
});

describe("revoking and expiring consent", () => {
  async function setup() {
    await seedBank(4);
    const anna = await signUp("anna");
    const { body: consent } = await consentFor(anna);
    const link = await json(await call(svc, "POST", "/api/service/link", { code: consent.code }));
    const taken = await takeAssessment(anna, allRight, { link_id: link.link_id });
    return {
      anna,
      consent,
      linkId: link.link_id as string,
      taken,
      token: taken.result.credentialToken as string,
    };
  }

  test("everything reads fine while the consent is active", async () => {
    const { linkId, taken, token } = await setup();
    expect((await call(svc, "GET", `/api/service/links/${linkId}`)).status).toBe(200);
    expect((await call(svc, "GET", `/api/service/assessments/${taken.created.id}`)).status).toBe(
      200,
    );
    expect((await call({}, "GET", `/api/service/credentials/${token}`)).status).toBe(200);
  });

  test("revoking cuts the link, the assessment result and the credential", async () => {
    const { anna, consent, linkId, taken, token } = await setup();
    const revoke = await call(anna, "DELETE", `/api/integration/consents/${consent.id}`);
    expect(revoke.status).toBe(200);
    expect((await json(revoke)).state).toBe("revoked");

    const link = await call(svc, "GET", `/api/service/links/${linkId}`);
    expect(link.status).toBe(403);
    expect((await json(link)).code).toBe("consent_revoked");

    const assessment = await call(svc, "GET", `/api/service/assessments/${taken.created.id}`);
    expect(assessment.status).toBe(403);
    expect((await json(assessment)).code).toBe("consent_revoked");

    expect((await call({}, "GET", `/api/service/credentials/${token}`)).status).toBe(410);
  });

  test("a revoked consent no longer accepts an assessment for its link", async () => {
    const { anna, consent, linkId } = await setup();
    await call(anna, "DELETE", `/api/integration/consents/${consent.id}`);
    expect((await createAssessment({ link_id: linkId })).res.status).toBe(403);
  });

  test("revoking before redemption kills the code", async () => {
    const anna = await signUp("anna");
    const { body } = await consentFor(anna);
    await call(anna, "DELETE", `/api/integration/consents/${body.id}`);
    expect((await call(svc, "POST", "/api/service/link", { code: body.code })).status).toBe(400);
  });

  test("revoking is idempotent and only works on your own consent", async () => {
    const { anna, consent } = await setup();
    const bob = await signUp("bob");
    expect((await call(bob, "DELETE", `/api/integration/consents/${consent.id}`)).status).toBe(404);
    expect((await call(anna, "DELETE", `/api/integration/consents/${consent.id}`)).status).toBe(
      200,
    );
    expect((await call(anna, "DELETE", `/api/integration/consents/${consent.id}`)).status).toBe(
      200,
    );
    expect((await call({}, "DELETE", `/api/integration/consents/${consent.id}`)).status).toBe(401);
    const cross = await call(anna, "DELETE", `/api/integration/consents/${consent.id}`, undefined, {
      origin: "https://evil.example",
    });
    expect(cross.status).toBe(403);
  });

  test("an expired consent cuts reads too", async () => {
    const { consent, linkId, taken, token } = await setup();
    await state.db
      .collection("integration_consents")
      .updateOne({ _id: consent.id } as never, { $set: { expiresAt: "2000-01-01T00:00:00.000Z" } });

    const link = await call(svc, "GET", `/api/service/links/${linkId}`);
    expect(link.status).toBe(403);
    expect((await json(link)).code).toBe("consent_expired");
    expect((await call(svc, "GET", `/api/service/assessments/${taken.created.id}`)).status).toBe(
      403,
    );
    expect((await call({}, "GET", `/api/service/credentials/${token}`)).status).toBe(200);
  });

  test("a revoked consent blocks submitting an assessment taken under it", async () => {
    await seedBank(4);
    const anna = await signUp("anna");
    const { body: consent } = await consentFor(anna);
    const link = await json(await call(svc, "POST", "/api/service/link", { code: consent.code }));
    const { body } = await createAssessment({ link_id: link.link_id });
    await call(anna, "POST", "/api/integration/assessments/claim", { code: body.code });
    await call(anna, "DELETE", `/api/integration/consents/${consent.id}`);
    const submit = await call(anna, "POST", `/api/integration/assessments/${body.id}/answers`, {
      answers: allRight(4),
    });
    expect(submit.status).toBe(403);
  });

  test("an unclaimed assessment has no applicant, so it reads without a consent", async () => {
    await seedBank(4);
    const { body } = await createAssessment();
    expect((await call(svc, "GET", `/api/service/assessments/${body.id}`)).status).toBe(200);
  });

  test("consents are listed per user", async () => {
    const anna = await signUp("anna");
    const bob = await signUp("bob");
    await consentFor(anna);
    expect((await json(await call(bob, "GET", "/api/integration/consents"))).consents).toEqual([]);
    expect(
      (await json(await call(anna, "GET", "/api/integration/consents"))).consents,
    ).toHaveLength(1);
    expect((await call({}, "GET", "/api/integration/consents")).status).toBe(401);
  });
});

describe("signed credentials", () => {
  async function issued() {
    await seedBank(4);
    const anna = await signUp("anna");
    const taken = await takeAssessment(anna, allRight);
    const token = taken.result.credentialToken as string;
    const publicKey = (await json(
      await call({}, "GET", "/api/service/credentials/public-key"),
    )) as PublicKeyDocument;
    const signed = (await json(
      await call({}, "GET", `/api/service/credentials/${token}`),
    )) as SignedCredential;
    return { anna, taken, token, publicKey, signed };
  }

  test("passing issues a credential token, shown once, stored only as a hash", async () => {
    const { token } = await issued();
    expect(token.length).toBeGreaterThanOrEqual(43);
    const [stored] = await rows("assessment_credentials");
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the public key is exposed without a token", async () => {
    const { publicKey } = await issued();
    expect(publicKey.alg).toBe("Ed25519");
    expect(publicKey.jwk).toMatchObject({ kty: "OKP", crv: "Ed25519" });
    expect(publicKey.kid).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(publicKey)).not.toContain('"d"');
    expect(JSON.stringify(publicKey)).not.toContain(CREDENTIAL_KEY);
  });

  test("the credential is public and verifies against the public key", async () => {
    const { signed, publicKey } = await issued();
    expect(signed.credential).toMatchObject({
      v: 1,
      type: "learnit.assessment",
      passed: true,
      score: 100,
      level: "beginner",
      audience: "offer-7",
    });
    expect(signed.credential.subject.name).toBe("German");
    expect(signed.proof).toMatchObject({ alg: "Ed25519", kid: publicKey.kid });
    expect(await verifyCredential(signed, publicKey.jwk)).toBe(true);
  });

  test("the credential carries no account identity", async () => {
    const { signed, anna } = await issued();
    const text = JSON.stringify(signed);
    expect(text).not.toContain(anna.id);
    expect(text).not.toContain("anna");
  });

  test("a tampered payload fails verification", async () => {
    const { signed, publicKey } = await issued();
    const forged = structuredClone(signed);
    forged.credential.score = 100;
    forged.credential.level = "advanced";
    expect(await verifyCredential(forged, publicKey.jwk)).toBe(false);

    const bumped = structuredClone(signed);
    bumped.credential.expiresAt = "2099-01-01T00:00:00.000Z";
    expect(await verifyCredential(bumped, publicKey.jwk)).toBe(false);

    const renamed = structuredClone(signed);
    renamed.credential.subject.name = "Quantum physics";
    expect(await verifyCredential(renamed, publicKey.jwk)).toBe(false);
  });

  test("a tampered signature, a wrong key and a malformed proof fail verification", async () => {
    const { signed, publicKey } = await issued();
    const flipped = structuredClone(signed);
    const first = flipped.proof.signature[0] === "A" ? "B" : "A";
    flipped.proof.signature = first + flipped.proof.signature.slice(1);
    expect(await verifyCredential(flipped, publicKey.jwk)).toBe(false);

    const other = (await crypto.subtle.exportKey(
      "jwk",
      ((await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair)
        .publicKey,
    )) as { x: string };
    expect(await verifyCredential(signed, { kty: "OKP", crv: "Ed25519", x: other.x })).toBe(false);

    const garbage = structuredClone(signed);
    garbage.proof.signature = "!!!not base64!!!";
    expect(await verifyCredential(garbage, publicKey.jwk)).toBe(false);
  });

  test("an unknown token is 404", async () => {
    expect((await call({}, "GET", "/api/service/credentials/nope")).status).toBe(404);
  });

  test("an expired credential is 410", async () => {
    const { token } = await issued();
    await state.db
      .collection("assessment_credentials")
      .updateOne({}, { $set: { expiresAt: "2000-01-01T00:00:00.000Z" } });
    expect((await call({}, "GET", `/api/service/credentials/${token}`)).status).toBe(410);
  });

  test("without a signing key nothing is issued and the public key route fails closed", async () => {
    const previous = process.env.LEARNIT_CREDENTIAL_KEY;
    delete process.env.LEARNIT_CREDENTIAL_KEY;
    try {
      expect((await call({}, "GET", "/api/service/credentials/public-key")).status).toBe(503);
      await seedBank(4);
      const anna = await signUp("anna");
      const { result } = await takeAssessment(anna, allRight);
      expect(result).toMatchObject({ passed: true, credentialToken: null });
      expect(await rows("assessment_credentials")).toHaveLength(0);
    } finally {
      process.env.LEARNIT_CREDENTIAL_KEY = previous;
    }
  });

  test("an unusable key is treated as no key", async () => {
    const previous = process.env.LEARNIT_CREDENTIAL_KEY;
    process.env.LEARNIT_CREDENTIAL_KEY = "not-a-key";
    try {
      expect((await call({}, "GET", "/api/service/credentials/public-key")).status).toBe(503);
    } finally {
      process.env.LEARNIT_CREDENTIAL_KEY = previous;
    }
  });

  test("public lookups are rate limited per address", async () => {
    let last = 0;
    for (let i = 0; i < 130; i++)
      last = (await call({}, "GET", "/api/service/credentials/nope")).status;
    expect(last).toBe(429);
  });
});

describe("account deletion (ADR 0002)", () => {
  test("removes the applicant's consents, shares, assessments and credentials, and leaves others alone", async () => {
    await seedBank(8);
    const anna = await signUp("anna");
    const bob = await signUp("bob");

    for (const user of [anna, bob]) {
      const { body: consent } = await consentFor(user);
      const link = await json(await call(svc, "POST", "/api/service/link", { code: consent.code }));
      await takeAssessment(user, allRight, { link_id: link.link_id });
      await call(svc, "GET", `/api/service/links/${link.link_id}`);
    }
    for (const name of [
      "integration_consents",
      "integration_shares",
      "assessments",
      "assessment_credentials",
    ]) {
      expect((await rows(name)).filter((r) => r.userId === anna.id).length).toBeGreaterThan(0);
    }

    expect(
      (await call(anna, "DELETE", "/api/me", { confirm: "anna", password: PASSWORD })).status,
    ).toBe(200);

    for (const name of [
      "integration_consents",
      "integration_shares",
      "assessments",
      "assessment_credentials",
    ]) {
      const left = await rows(name);
      expect(left.filter((r) => r.userId === anna.id)).toHaveLength(0);
      expect(left.filter((r) => r.userId === bob.id).length).toBeGreaterThan(0);
    }
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { memDb, objectIdHex } from "./memdb";
import { accounts, app, limiter, state } from "./harness";
import {
  PREFETCH_TARGET,
  nextExercise,
  resetFeedState,
  setFeedDeps,
  whenIdle,
  type FeedDeps,
  type FeedInput,
} from "../../api/src/exercise-feed";
import { topicKeyOf } from "../../api/src/schemas";

const topic = "Greetings";
const topicKey = topicKeyOf("general", topic, "beginner");

const input = (userId: string, over: Partial<FeedInput> = {}): FeedInput => ({
  userId,
  subject: "Philosophy",
  taxonomyLeaf: "general",
  bankKey: "general",
  topic,
  level: "beginner",
  nativeLanguage: "english",
  ...over,
});

type Stub = FeedDeps & { calls: number; release: () => void };

/** A generator that waits on a gate, so a test decides when "the model" answers. */
function gatedGenerator(opts: { fail?: boolean } = {}): Stub {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const stub: Stub = {
    calls: 0,
    release: () => open(),
    async generateExercise(_ctx, params) {
      stub.calls += 1;
      const n = stub.calls;
      await gate;
      if (opts.fail) throw new Error("model down");
      return { instruction: `generated ${n}`, question: `q${n}`, type: params.type };
    },
  };
  return stub;
}

const bank = () => state.db.collection("exercises");
const cards = () => state.db.collection("user_exercises");

async function seedBank(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const { insertedId } = await bank().insertOne({
      topicKey,
      type: "multiple_choice",
      topic,
      instruction: `seeded ${i}`,
    });
    ids.push(insertedId);
  }
  return ids;
}

beforeEach(() => {
  state.db = memDb();
  resetFeedState();
});
afterEach(() => setFeedDeps(null));

describe("nextExercise: cached", () => {
  test("serves a banked exercise at once and writes the student's card", async () => {
    const stub = gatedGenerator();
    await seedBank(PREFETCH_TARGET + 1);
    const user = objectIdHex();

    const result = await nextExercise(state.db as never, input(user), stub);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.delivery).toBe("cached");
    expect(String(result.exercise.instruction)).toStartWith("seeded");
    expect(stub.calls).toBe(0);
    expect(cards()._docs).toHaveLength(1);
    expect(cards()._docs[0]).toMatchObject({ userId: user, topicKey, lastScore: -1 });
  });

  test("never serves the same exercise twice to one student", async () => {
    await seedBank(PREFETCH_TARGET + 2);
    const user = objectIdHex();
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const r = await nextExercise(state.db as never, input(user), gatedGenerator());
      expect(r.status).toBe("ready");
      if (r.status === "ready") seen.add(String(r.exercise._id));
    }
    expect(seen.size).toBe(3);
  });

  test("two simultaneous requests from one student claim different exercises", async () => {
    await seedBank(PREFETCH_TARGET + 2);
    const user = objectIdHex();
    const [a, b] = await Promise.all([
      nextExercise(state.db as never, input(user), gatedGenerator()),
      nextExercise(state.db as never, input(user), gatedGenerator()),
    ]);
    if (a.status !== "ready" || b.status !== "ready") throw new Error("expected both ready");
    expect(a.exercise._id).not.toBe(b.exercise._id);
  });

  test("a card already answered and due is served from the schedule, as an SRS review", async () => {
    const [id] = await seedBank(PREFETCH_TARGET + 1);
    const user = objectIdHex();
    await cards().insertOne({
      userId: user,
      exerciseId: id,
      exerciseType: "multiple_choice",
      topicKey,
      interval: 1,
      lastScore: 0.2,
      dueDate: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    const r = await nextExercise(state.db as never, input(user), gatedGenerator());
    expect(r.status === "ready" && r.delivery).toBe("srs");
    if (r.status === "ready") expect(r.exercise._id).toBe(id);
  });

  test("one student's cards do not hide the bank from another", async () => {
    await seedBank(1 + PREFETCH_TARGET);
    const anna = objectIdHex();
    const ben = objectIdHex();
    const first = await nextExercise(state.db as never, input(anna), gatedGenerator());
    const second = await nextExercise(state.db as never, input(ben), gatedGenerator());
    if (first.status !== "ready" || second.status !== "ready") throw new Error("expected ready");
    // Same bank, each student's own card.
    expect(cards()._docs.map((c) => c.userId).sort()).toEqual([anna, ben].sort());
    expect(second.delivery).toBe("cached");
  });
});

describe("nextExercise: generating", () => {
  test("answers 'generating' without waiting for the model, then serves what it wrote", async () => {
    const stub = gatedGenerator();
    const user = objectIdHex();

    const miss = await nextExercise(state.db as never, input(user), stub);
    expect(miss).toMatchObject({ status: "generating" });
    expect(bank()._docs).toHaveLength(0);

    stub.release();
    await whenIdle();

    const hit = await nextExercise(state.db as never, input(user), stub);
    expect(hit.status).toBe("ready");
    if (hit.status === "ready") expect(String(hit.exercise.instruction)).toStartWith("generated");
  });

  test("generates a batch, so the exercises after the first are already there", async () => {
    const stub = gatedGenerator();
    stub.release();
    const user = objectIdHex();
    await nextExercise(state.db as never, input(user), stub);
    await whenIdle();
    expect(stub.calls).toBe(PREFETCH_TARGET);
    expect(bank()._docs).toHaveLength(PREFETCH_TARGET);
    expect(bank()._docs[0]).toMatchObject({ topicKey, bankKey: "general", level: "beginner", topic });
  });

  test("rotates exercise types across a batch", async () => {
    const stub = gatedGenerator();
    stub.release();
    await nextExercise(state.db as never, input(objectIdHex()), stub);
    await whenIdle();
    const types = new Set(bank()._docs.map((d) => d.type));
    expect(types.size).toBe(PREFETCH_TARGET);
  });

  test("students asking at once for one topic share a single generation", async () => {
    const stub = gatedGenerator();
    const [a, b] = [objectIdHex(), objectIdHex()];
    const [ra, rb] = await Promise.all([
      nextExercise(state.db as never, input(a), stub),
      nextExercise(state.db as never, input(b), stub),
    ]);
    expect(ra.status).toBe("generating");
    expect(rb.status).toBe("generating");
    stub.release();
    await whenIdle();
    expect(stub.calls).toBe(PREFETCH_TARGET);
  });

  test("tops the bank up behind a served exercise", async () => {
    const stub = gatedGenerator();
    stub.release();
    await seedBank(1);
    const user = objectIdHex();
    const r = await nextExercise(state.db as never, input(user), stub);
    expect(r.status).toBe("ready");
    await whenIdle();
    // One seeded exercise was claimed, so the student had 0 left: the target is refilled.
    expect(stub.calls).toBe(PREFETCH_TARGET);
  });

  test("a full bank triggers no generation", async () => {
    const stub = gatedGenerator();
    await seedBank(1 + PREFETCH_TARGET);
    await nextExercise(state.db as never, input(objectIdHex()), stub);
    await whenIdle();
    expect(stub.calls).toBe(0);
  });

  test("a failure a student was waiting on is raised once, then the next ask retries", async () => {
    const failing = gatedGenerator({ fail: true });
    const user = objectIdHex();
    const origError = console.error;
    console.error = () => {};
    try {
      expect((await nextExercise(state.db as never, input(user), failing)).status).toBe("generating");
      failing.release();
      await whenIdle();
      await expect(nextExercise(state.db as never, input(user), failing)).rejects.toThrow("model down");

      const healthy = gatedGenerator();
      healthy.release();
      expect((await nextExercise(state.db as never, input(user), healthy)).status).toBe("generating");
      await whenIdle();
      expect(healthy.calls).toBe(PREFETCH_TARGET);
    } finally {
      console.error = origError;
    }
  });

  test("a failed prefetch nobody was waiting on is not held against the next student", async () => {
    const failing = gatedGenerator({ fail: true });
    failing.release();
    await seedBank(1);
    const origError = console.error;
    console.error = () => {};
    try {
      const r = await nextExercise(state.db as never, input(objectIdHex()), failing);
      expect(r.status).toBe("ready");
      await whenIdle();
    } finally {
      console.error = origError;
    }
    const again = await nextExercise(state.db as never, input(objectIdHex()), gatedGenerator());
    expect(again.status).toBe("ready");
  });
});

describe("GET /api/exercises/next", () => {
  let token = "";
  let userId = "";
  beforeEach(async () => {
    userId = objectIdHex();
    limiter.reset();
    await state.db.collection("users").insertOne({
      _id: userId,
      handle: "anna",
      displayName: "Anna",
      status: "active",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    token = (await accounts.startSession(userId)).token;
  });

  const url = "http://localhost/api/exercises/next?subject=Philosophy&taxonomyLeaf=general&bankKey=general&topic=Greetings";
  const ask = (withToken = true) =>
    app.handle(new Request(url, { headers: withToken ? { cookie: `learnit_session=${token}` } : {} }));

  test("rejects an anonymous caller", async () => {
    const res = await ask(false);
    expect(res.status).toBe(401);
  });

  test("requires subject and topic", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/exercises/next?subject=Philosophy", {
        headers: { cookie: `learnit_session=${token}` },
      }),
    );
    expect(res.status).toBe(400);
  });

  test("202 with an explicit 'generating' status while the bank is empty, then 200 'ready' with its delivery", async () => {
    const stub = gatedGenerator();
    setFeedDeps(stub);

    const miss = await ask();
    expect(miss.status).toBe(202);
    expect(await miss.json()).toMatchObject({ _status: "generating", retryAfterMs: expect.any(Number) });

    stub.release();
    await whenIdle();

    const hit = await ask();
    expect(hit.status).toBe(200);
    expect(await hit.json()).toMatchObject({ _status: "ready", _delivery: "cached" });
    expect(cards()._docs[0]).toMatchObject({ userId });
  });

  test("500 with the cause when a generation the student was waiting on failed", async () => {
    const stub = gatedGenerator({ fail: true });
    setFeedDeps(stub);
    const origError = console.error;
    console.error = () => {};
    try {
      expect((await ask()).status).toBe(202);
      stub.release();
      await whenIdle();
      const res = await ask();
      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({ error: "LLM generation failed" });
    } finally {
      console.error = origError;
    }
  });
});

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { memDb, objectIdHex } from "../memdb";
import { accounts, app, limiter, state } from "../harness";
import { createCommonsProvider, toCandidate } from "../../../api/src/sources/commons";
import { createYouTubeProvider } from "../../../api/src/sources/youtube";
import { resolveMedia, searchTerms } from "../../../api/src/sources/media";
import { resolveSpec } from "../../../api/src/domains";
import { sanitizeBlocks } from "../../../api/src/blocks";

// Every request below is intercepted: this suite must pass with no network.

type Meta = Record<string, string>;
const page = (title: string, info: Record<string, unknown>, meta: Meta = {}, index = 1) => ({
  title,
  index,
  imageinfo: [
    {
      url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${title.replace("File:", "")}`,
      descriptionurl: `https://commons.wikimedia.org/wiki/${title}`,
      mime: "image/jpeg",
      size: 1000,
      width: 800,
      height: 600,
      ...info,
      extmetadata: Object.fromEntries(
        Object.entries({
          LicenseShortName: "CC BY-SA 4.0",
          LicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
          Artist: '<a href="//commons.wikimedia.org/wiki/User:Ana">Ana <b>Gómez</b></a>',
          ImageDescription: "<p>A <i>bakery</i> in Berlin.</p>",
          ...meta,
        }).map(([k, v]) => [k, { value: v }]),
      ),
    },
  ],
});

const commonsReply = (...pages: ReturnType<typeof page>[]) =>
  new Response(JSON.stringify({ query: { pages } }), {
    headers: { "content-type": "application/json" },
  });

let fetchSpy: ReturnType<typeof spyOn>;

/** Replaces global fetch; Bun's `typeof fetch` also demands `preconnect`, which a stub does not need. */
function mockFetch(impl: (...args: any[]) => Promise<Response>) {
  return spyOn(globalThis, "fetch").mockImplementation(impl as unknown as typeof fetch);
}
afterEach(() => mock.restore());

describe("Commons candidates", () => {
  test("turns file metadata into a block-ready reference with plain-text attribution", () => {
    const c = toCandidate(
      page("File:Bäckerei.jpg", { thumburl: "https://upload.wikimedia.org/t.jpg" }),
      "image",
    );
    expect(c).toMatchObject({
      mediaId: "commons:File:Bäckerei.jpg",
      provider: "commons",
      kind: "image",
      title: "Bäckerei",
      author: "Ana Gómez",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      description: "A bakery in Berlin.",
      thumb: "https://upload.wikimedia.org/t.jpg",
    });
  });

  test("drops a file with a non-open or missing license", () => {
    expect(
      toCandidate(page("File:a.jpg", {}, { LicenseShortName: "All rights reserved" }), "image"),
    ).toBeNull();
    expect(toCandidate(page("File:a.jpg", {}, { LicenseShortName: "" }), "image")).toBeNull();
  });

  test("drops a file without an author, a restricted one and an unexpected type", () => {
    expect(toCandidate(page("File:a.jpg", {}, { Artist: "" }), "image")).toBeNull();
    expect(
      toCandidate(page("File:a.jpg", {}, { Restrictions: "personality" }), "image"),
    ).toBeNull();
    expect(toCandidate(page("File:a.jpg", { mime: "text/html" }), "image")).toBeNull();
  });

  test("refuses an oversized video", () => {
    const big = page("File:clip.webm", { mime: "video/webm", size: 90 * 1024 * 1024 });
    expect(toCandidate(big, "video")).toBeNull();
  });
});

describe("Commons provider", () => {
  test("searches each kind and de-duplicates the results", async () => {
    fetchSpy = mockFetch(async () =>
      commonsReply(page("File:one.jpg", {}), page("File:two.jpg", {}, {}, 2)),
    );
    const found = await createCommonsProvider().find({
      query: "bakery",
      kinds: ["image", "image"],
    });
    expect(found?.map((c) => c.mediaId)).toEqual(["commons:File:one.jpg", "commons:File:two.jpg"]);
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain("commons.wikimedia.org/w/api.php");
    expect(url).toContain("filetype%3Abitmap");
  });

  test("an outage is null, an empty answer is an empty list", async () => {
    mockFetch(async () => new Response("nope", { status: 503 }));
    expect(await createCommonsProvider().find({ query: "bakery", kinds: ["image"] })).toBeNull();
    mock.restore();
    mockFetch(async () => commonsReply());
    expect(await createCommonsProvider().find({ query: "bakery", kinds: ["image"] })).toEqual([]);
  });

  test("prefixes the language onto audio searches", async () => {
    fetchSpy = mockFetch(async () => commonsReply());
    await createCommonsProvider().find({ query: "Guten Tag", kinds: ["audio"], lang: "German" });
    expect(decodeURIComponent(String(fetchSpy.mock.calls[0]?.[0]).replaceAll("+", " "))).toContain(
      "German Guten Tag filetype:audio",
    );
  });
});

describe("YouTube provider", () => {
  const oembed = (title: string) =>
    new Response(JSON.stringify({ title, author_name: "Learn German" }), {
      headers: { "content-type": "application/json" },
    });

  test("returns nothing without an id and never searches", async () => {
    fetchSpy = spyOn(globalThis, "fetch");
    expect(await createYouTubeProvider().find({ query: "greetings" })).toEqual([]);
    expect(
      await createYouTubeProvider().find({ query: "greetings", youtubeId: "not an id!" }),
    ).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("verifies an id through oEmbed and references it without storing a URL", async () => {
    mockFetch(async () => oembed("German greetings for beginners"));
    const found = await createYouTubeProvider().find({
      query: "German greetings",
      youtubeId: "dQw4w9WgXcQ",
    });
    expect(found).toEqual([
      expect.objectContaining({
        mediaId: "youtube:dQw4w9WgXcQ",
        kind: "video",
        youtubeId: "dQw4w9WgXcQ",
        pageUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        author: "Learn German",
      }),
    ]);
    expect(found?.[0]?.url).toBeUndefined();
  });

  test("rejects a real video that is about something else", async () => {
    mockFetch(async () => oembed("Cat falls off a sofa"));
    expect(
      await createYouTubeProvider().find({ query: "German greetings", youtubeId: "dQw4w9WgXcQ" }),
    ).toEqual([]);
  });

  test("an unknown id is nothing", async () => {
    mockFetch(async () => new Response("Not Found", { status: 404 }));
    expect(await createYouTubeProvider().find({ query: "x", youtubeId: "dQw4w9WgXcQ" })).toEqual(
      [],
    );
  });
});

describe("media resolution and cache", () => {
  const german = resolveSpec(["language", "german"]);
  const physics = resolveSpec(["science", "physics"]);
  beforeEach(() => {
    state.db = memDb();
  });

  test("a subject with no media providers makes no requests", async () => {
    fetchSpy = spyOn(globalThis, "fetch");
    expect(await resolveMedia(state.db as never, { query: "momentum" }, physics)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("the second identical request is served from the cache", async () => {
    fetchSpy = mockFetch(async () => commonsReply(page("File:one.jpg", {})));
    const claim = { query: "bakery", kinds: ["image" as const] };
    const first = await resolveMedia(state.db as never, claim, german);
    const calls = fetchSpy.mock.calls.length;
    const second = await resolveMedia(state.db as never, claim, german);
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(fetchSpy.mock.calls.length).toBe(calls);
  });

  test("an outage is neither cached nor thrown", async () => {
    mockFetch(async () => {
      throw new Error("network down");
    });
    const claim = { query: "bakery", kinds: ["image" as const] };
    expect(await resolveMedia(state.db as never, claim, german)).toEqual([]);
    expect(
      await (state.db as never as ReturnType<typeof memDb>)
        .collection("media_queries")
        .countDocuments({}),
    ).toBe(0);
  });

  test("language topics ask for pictures and audio, others for pictures and video", () => {
    expect(searchTerms({ name: "Guten Tag" }, "German", true)).toMatchObject({
      lang: "German",
      kinds: ["image", "audio"],
    });
    expect(searchTerms({ name: "Momentum" }, "Physics", false).kinds).toEqual(["image", "video"]);
  });
});

describe("media block sanitizer", () => {
  const good = {
    mediaId: "commons:File:a.jpg",
    provider: "commons",
    kind: "image",
    title: "A",
    url: "https://upload.wikimedia.org/a.jpg",
    pageUrl: "https://commons.wikimedia.org/wiki/File:a.jpg",
    author: "Ana",
    license: "CC BY 4.0",
  };
  const run = (ref: Record<string, unknown>) => sanitizeBlocks([{ kind: "media", ref }], ["media"]);

  test("keeps a well-formed reference", () => {
    expect(run(good)).toHaveLength(1);
  });

  test("rejects files hosted anywhere but Wikimedia", () => {
    expect(run({ ...good, url: "https://evil.example/a.jpg" })).toHaveLength(0);
    expect(run({ ...good, url: "javascript:alert(1)" })).toHaveLength(0);
    expect(run({ ...good, pageUrl: "https://evil.example/" })).toHaveLength(0);
  });

  test("requires a license", () => {
    expect(run({ ...good, license: "" })).toHaveLength(0);
  });

  test("youtube needs a well-formed id and a video kind, and ignores any supplied URL", () => {
    const yt = {
      ...good,
      provider: "youtube",
      kind: "video",
      youtubeId: "dQw4w9WgXcQ",
      mediaId: "youtube:dQw4w9WgXcQ",
      url: "https://evil.example/x",
    };
    const [block] = run(yt);
    expect(block).toMatchObject({
      kind: "media",
      ref: { youtubeId: "dQw4w9WgXcQ", pageUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    });
    expect((block as { ref: { url?: string } }).ref.url).toBeUndefined();
    expect(run({ ...yt, youtubeId: "short" })).toHaveLength(0);
    expect(run({ ...yt, kind: "image" })).toHaveLength(0);
  });

  test("is not accepted unless the caller allows it", () => {
    expect(sanitizeBlocks([{ kind: "media", ref: good }], ["text"])).toHaveLength(0);
  });
});

describe("GET /api/path/:id/module/:order/topic/:index/media", () => {
  const base = "http://localhost";
  let token = "";
  let pathId = "";
  const get = (path: string, tok?: string) =>
    app.handle(
      new Request(`${base}${path}`, { headers: tok ? { cookie: `learnit_session=${tok}` } : {} }),
    );

  beforeEach(async () => {
    state.db = memDb();
    limiter.reset();
    const userId = objectIdHex();
    await state.db.collection("users").insertOne({
      _id: userId,
      handle: "anna",
      displayName: "Anna",
      status: "active",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    token = (await accounts.startSession(userId)).token;
    pathId = objectIdHex();
    await state.db.collection("paths").insertOne({
      _id: pathId,
      userId,
      subject: "German",
      taxonomy: ["language", "german"],
      objective: "Talk",
      modules: [{ name: "Basics", order: 1, topics: [{ name: "Guten Tag", order: 1 }] }],
    });
  });

  test("requires a session", async () => {
    expect((await get(`/api/path/${pathId}/module/1/topic/0/media`)).status).toBe(401);
  });

  test("404 for a topic that does not exist, and for another user's path", async () => {
    expect((await get(`/api/path/${pathId}/module/1/topic/5/media`, token)).status).toBe(404);
    const other = objectIdHex();
    await state.db.collection("users").insertOne({
      _id: other,
      handle: "bob",
      displayName: "Bob",
      status: "active",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    const otherToken = (await accounts.startSession(other)).token;
    expect((await get(`/api/path/${pathId}/module/1/topic/0/media`, otherToken)).status).toBe(404);
  });

  test("returns sanitized media blocks", async () => {
    mockFetch(async () => commonsReply(page("File:Bäckerei.jpg", {})));
    const res = await get(`/api/path/${pathId}/module/1/topic/0/media`, token);
    expect(res.status).toBe(200);
    const { blocks } = (await res.json()) as {
      blocks: { kind: string; ref: { license: string } }[];
    };
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((b) => b.kind === "media" && b.ref.license === "CC BY-SA 4.0")).toBe(true);
  });

  test("a provider outage still answers 200 with no blocks", async () => {
    mockFetch(async () => {
      throw new Error("down");
    });
    const res = await get(`/api/path/${pathId}/module/1/topic/0/media`, token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ blocks: [] });
  });
});

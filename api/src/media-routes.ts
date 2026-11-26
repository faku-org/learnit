import { Elysia } from "elysia";
import { ObjectId } from "mongodb";
import { authenticate } from "./accounts";
import { getDB } from "./db";
import { forUser } from "./db/scoped";
import { isLanguagePath, resolveSpec } from "./domains";
import { sanitizeBlocks } from "./blocks";
import { subjectOf } from "./schemas";
import { resolveMedia, searchTerms } from "./sources/media";

type StoredPath = {
  language?: string;
  subject?: string;
  taxonomy?: string[];
  taxonomyLeaf?: string;
  modules?: { topics?: { name: string; concepts?: string[] }[] }[];
};

/**
 * Supplementary material for one topic, as content blocks.
 *
 * Read-only and best-effort: the lesson never waits on it and never fails
 * because of it. An unknown id is a 404; a provider outage is an empty list.
 * Every block goes through the same sanitizer as generated ones, so nothing a
 * provider returns reaches the client unchecked.
 */
export const mediaRoutes = new Elysia().get(
  "/api/path/:id/module/:order/topic/:index/media",
  async ({ params, headers, set }: any) => {
    const user = await authenticate(headers);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    const order = Number(params.order);
    const index = Number(params.index);
    if (!Number.isInteger(order) || order < 1 || !Number.isInteger(index) || index < 0) {
      set.status = 400;
      return { error: "order and index must be valid numbers" };
    }

    const db = await getDB();
    let path: StoredPath | null = null;
    try {
      path = (await forUser(db, user.id)
        .of("paths")
        .findOne({ _id: new ObjectId(params.id) })) as unknown as StoredPath | null;
    } catch {
      /* invalid id */
    }
    const topic = path?.modules?.[order - 1]?.topics?.[index];
    if (!path || !topic) {
      set.status = 404;
      return { error: "Topic not found" };
    }

    const identity = subjectOf(path);
    const spec = resolveSpec(identity.taxonomy);
    const refs = await resolveMedia(
      db,
      searchTerms(topic, identity.subject, isLanguagePath(identity.taxonomy)),
      spec,
    );
    const blocks = sanitizeBlocks(
      refs.map((ref) => ({ kind: "media", ref })),
      ["media"],
    );
    return { blocks };
  },
);

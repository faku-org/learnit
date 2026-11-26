import { Elysia } from "elysia";
import type { Db } from "mongodb";
import { LIMITS_INTEGRATION, takeOrReject } from "./limits";
import { getDB } from "../db";
import { allBank } from "../db/integration";
import { allNodes } from "../taxonomy";
import { MINUTES_PER_EXERCISE } from "./config";

/**
 * The public catalog JobIt (or anyone) can read to see what LearnIt can assess and teach. Built only from shared,
 * non-personal data: the taxonomy and the shared exercise bank. Paths are per user, so no path ever shows up here;
 * the "path" entries are the levels a subject offers, with the topics and effort the bank covers.
 */

export interface CatalogLevel {
  title: string;
  level: string;
  topics: { name: string; exercises: number }[];
  topicCount: number;
  exerciseCount: number;
  /** Estimated study time for the whole level. */
  effortMinutes: number;
}

export interface CatalogSubject {
  id: string;
  name: string;
  /** Root to leaf, each with its display name. */
  lineage: { id: string; name: string }[];
  breadcrumb: string;
  paths: CatalogLevel[];
}

export interface Catalog {
  version: 1;
  generatedAt: string;
  subjects: CatalogSubject[];
}

const LEVEL_ORDER = ["beginner", "elementary", "intermediate", "advanced"];

export async function buildCatalog(db: Pick<Db, "collection">, now = new Date()): Promise<Catalog> {
  const [bank, nodes] = await Promise.all([allBank(db), allNodes(db as Db)]);

  const byLeaf = new Map<string, Map<string, Map<string, number>>>();
  for (const row of bank) {
    const leaf = typeof row.taxonomyLeaf === "string" ? row.taxonomyLeaf : null;
    const level = typeof row.level === "string" ? row.level : null;
    if (!leaf || !level) continue;
    const topic = typeof row.topic === "string" && row.topic.trim() ? row.topic.trim() : "General";
    const levels = byLeaf.get(leaf) ?? new Map<string, Map<string, number>>();
    const topics = levels.get(level) ?? new Map<string, number>();
    topics.set(topic, (topics.get(topic) ?? 0) + 1);
    levels.set(level, topics);
    byLeaf.set(leaf, levels);
  }

  const lineage = (leaf: string): { id: string; name: string }[] => {
    const chain: { id: string; name: string }[] = [];
    let cursor: string | null = leaf;
    for (let guard = 0; cursor && guard < 16; guard++) {
      const node = nodes.get(cursor);
      if (!node) {
        if (chain.length === 0) chain.unshift({ id: cursor, name: cursor });
        break;
      }
      chain.unshift({ id: node.id, name: node.name });
      cursor = node.parentId;
    }
    return chain;
  };

  const subjects: CatalogSubject[] = [...byLeaf].map(([leaf, levels]) => {
    const chain = lineage(leaf);
    const name = chain[chain.length - 1]?.name ?? leaf;
    const paths = [...levels]
      .map(([level, topics]): CatalogLevel => {
        const list = [...topics].map(([topicName, exercises]) => ({ name: topicName, exercises }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        const exerciseCount = list.reduce((total, topic) => total + topic.exercises, 0);
        return {
          title: `${name} (${level})`,
          level,
          topics: list,
          topicCount: list.length,
          exerciseCount,
          effortMinutes: exerciseCount * MINUTES_PER_EXERCISE,
        };
      })
      .sort(
        (a, b) =>
          LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) ||
          a.level.localeCompare(b.level),
      );
    return {
      id: leaf,
      name,
      lineage: chain,
      breadcrumb: chain.map((link) => link.name).join(" / "),
      paths,
    };
  });
  subjects.sort((a, b) => a.breadcrumb.localeCompare(b.breadcrumb));

  return { version: 1, generatedAt: now.toISOString(), subjects };
}

export const catalogRoutes = new Elysia({ name: "learnit-catalog" }).get(
  "/api/catalog",
  async ({ request, server, set }) => {
    const limited = takeOrReject(request, server, "catalog", LIMITS_INTEGRATION.catalog, set);
    if (limited) return limited;
    set.headers["cache-control"] = "public, max-age=300";
    return buildCatalog(await getDB());
  },
);

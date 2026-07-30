import type { Db } from "mongodb";
import seed from "./taxonomy-seed.json";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaxonomyNode = {
  id: string;
  parentId: string | null;
  name: string;
  aliases: string[];
  depth: number;
  origin: "seed" | "generated";
  pathCount: number;
  createdAt: string;
};

type SeedEntry = {
  name: string;
  aliases?: string[];
  children?: Record<string, SeedEntry>;
};

// ── Seed flattening ───────────────────────────────────────────────────────────

/** The seed file is nested for authoring; everything downstream wants it flat. */
function flatten(
  entries: Record<string, SeedEntry>,
  parentId: string | null,
  depth: number,
  out: TaxonomyNode[] = [],
): TaxonomyNode[] {
  for (const [id, entry] of Object.entries(entries)) {
    out.push({
      id,
      parentId,
      name: entry.name,
      aliases: entry.aliases ?? [],
      depth,
      origin: "seed",
      pathCount: 0,
      createdAt: new Date(0).toISOString(),
    });
    if (entry.children) flatten(entry.children, id, depth + 1, out);
  }
  return out;
}

export const SEED_NODES: TaxonomyNode[] = flatten(
  seed as unknown as Record<string, SeedEntry>,
  null,
  0,
);

/** Root ids, used for validation and as the classifier's allowed top level. */
export const ROOT_IDS: string[] = SEED_NODES.filter((n) => n.parentId === null).map((n) => n.id);

// ── In-memory cache ───────────────────────────────────────────────────────────
//
// The tree is ~150 nodes and changes only when the classifier invents one, so a
// process-local cache saves a round trip on every path/exercise/prompt call.

let cache: Map<string, TaxonomyNode> | null = null;

function indexNodes(nodes: TaxonomyNode[]): Map<string, TaxonomyNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/** Idempotent. Inserts any seed node the database does not already have. */
export async function seedTaxonomy(db: Db): Promise<void> {
  const col = db.collection("taxonomy_nodes");
  await col.createIndex({ id: 1 }, { unique: true });
  await col.createIndex({ parentId: 1 });

  const existing = new Set(
    (await col.find({}, { projection: { id: 1 } }).toArray()).map((d) => d.id as string),
  );
  const missing = SEED_NODES.filter((n) => !existing.has(n.id));
  if (missing.length > 0) await col.insertMany(missing.map((n) => ({ ...n })));

  cache = null;
}

export async function allNodes(db: Db): Promise<Map<string, TaxonomyNode>> {
  if (cache) return cache;
  const docs = (await db.collection("taxonomy_nodes").find({}).toArray()) as unknown as TaxonomyNode[];
  // A cold database that has not been seeded yet still resolves against the seed.
  cache = indexNodes(docs.length > 0 ? docs : SEED_NODES);
  return cache;
}

export function invalidateCache(): void {
  cache = null;
}

// ── Lineage ───────────────────────────────────────────────────────────────────

/**
 * Root-to-leaf id chain for a node. Returns `["general"]` for an unknown id so
 * a corrupt or hand-edited path still resolves to a usable spec.
 */
export async function lineageOf(db: Db, leafId: string): Promise<string[]> {
  const nodes = await allNodes(db);
  const chain: string[] = [];
  let cursor: string | null = leafId;
  // Depth is bounded by the seed, but a malformed parent pointer must not hang.
  for (let guard = 0; cursor && guard < 16; guard++) {
    const node: TaxonomyNode | undefined = nodes.get(cursor);
    if (!node) break;
    chain.unshift(node.id);
    cursor = node.parentId;
  }
  return chain.length > 0 ? chain : ["general"];
}

export async function nodeName(db: Db, id: string): Promise<string> {
  const nodes = await allNodes(db);
  return nodes.get(id)?.name ?? id;
}

/** Human-readable breadcrumb, e.g. "Social Science / Economics / Macroeconomics". */
export async function breadcrumb(db: Db, taxonomy: string[]): Promise<string> {
  const nodes = await allNodes(db);
  return taxonomy.map((id) => nodes.get(id)?.name ?? id).join(" / ");
}

// ── Offline matching ──────────────────────────────────────────────────────────

/** Combining diacritics, stripped after NFD so "cálculo" and "calculo" match. */
const DIACRITICS = /[̀-ͯ]/g;

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Exact name/alias match against the tree, tried before spending an LLM call.
 * Deepest match wins, so "macroeconomics" beats "economics".
 */
export async function matchSubject(db: Db, subject: string): Promise<TaxonomyNode | null> {
  const nodes = await allNodes(db);
  const needle = normalizeForMatch(subject);
  if (!needle) return null;

  let best: TaxonomyNode | null = null;
  for (const node of nodes.values()) {
    const candidates = [node.name, node.id.replace(/_/g, " "), ...node.aliases];
    const hit = candidates.some((c) => normalizeForMatch(c) === needle);
    if (hit && (!best || node.depth > best.depth)) best = node;
  }
  return best;
}

// ── Node creation ─────────────────────────────────────────────────────────────

/**
 * Register a node the classifier invented. Collisions resolve to the existing
 * node rather than erroring, so concurrent path creation is safe.
 */
export async function ensureNode(
  db: Db,
  input: { id: string; parentId: string; name: string; aliases?: string[] },
): Promise<TaxonomyNode> {
  const nodes = await allNodes(db);
  const existing = nodes.get(input.id);
  if (existing) return existing;

  const parent = nodes.get(input.parentId);
  if (!parent) throw new Error(`Unknown parent taxonomy node: ${input.parentId}`);

  const node: TaxonomyNode = {
    id: input.id,
    parentId: input.parentId,
    name: input.name,
    aliases: input.aliases ?? [],
    depth: parent.depth + 1,
    origin: "generated",
    pathCount: 0,
    createdAt: new Date().toISOString(),
  };
  await db.collection("taxonomy_nodes").updateOne(
    { id: node.id },
    { $setOnInsert: node },
    { upsert: true },
  );
  invalidateCache();
  return node;
}

export async function bumpPathCount(db: Db, taxonomy: string[]): Promise<void> {
  if (taxonomy.length === 0) return;
  await db
    .collection("taxonomy_nodes")
    .updateMany({ id: { $in: taxonomy } }, { $inc: { pathCount: 1 } });
  invalidateCache();
}

// ── Distance and transfer ─────────────────────────────────────────────────────

export type TaxonomyRelation = {
  /** Deepest id both lineages share, or null when they share nothing. */
  sharedAncestor: string | null;
  /** Number of shared ids, counting from the root. */
  commonDepth: number;
  /** Hops from one leaf up to the shared ancestor and back down to the other. */
  distance: number;
};

export function relate(a: string[], b: string[]): TaxonomyRelation {
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common++;
  return {
    sharedAncestor: common > 0 ? a[common - 1] : null,
    commonDepth: common,
    distance: a.length - common + (b.length - common),
  };
}

export type TransferPolicy = {
  mode: "full" | "partial" | "none";
  /** Minimum decay-adjusted mastery a concept needs to carry over. */
  masteryFloor: number;
  relation: TaxonomyRelation;
};

/**
 * How aggressively a new path may reuse what an old one taught.
 *
 * Skipping a module the student does not actually know is worse than making
 * them repeat one they do, so the floor rises as the subjects grow apart and
 * callers must still gate on decay-adjusted mastery (see mastery snapshots).
 */
export function transferPolicy(from: string[], to: string[]): TransferPolicy {
  const relation = relate(from, to);
  if (relation.commonDepth === 0) return { mode: "none", masteryFloor: 1, relation };
  // Identical leaf: a retake of the same subject.
  if (relation.distance === 0) return { mode: "full", masteryFloor: 0.35, relation };
  // Siblings under a shared level-2 node, e.g. macro vs micro under economics.
  if (relation.commonDepth >= 2) return { mode: "full", masteryFloor: 0.5, relation };
  // Same root only, e.g. economics vs psychology. Foundations may overlap.
  return { mode: "partial", masteryFloor: 0.75, relation };
}

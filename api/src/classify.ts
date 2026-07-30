import type { Db } from "mongodb";
import { generateJSON, PRO_MODEL } from "./llm";
import {
  allNodes,
  breadcrumb,
  ensureNode,
  lineageOf,
  matchSubject,
  slugify,
  type TaxonomyNode,
} from "./taxonomy";
import { resolveSpec } from "./domains";
import {
  CLASSIFY_SYSTEM_PROMPT,
  SCOPE_CHECK_SYSTEM_PROMPT,
  buildClassifyPrompt,
  buildScopeCheckPrompt,
  type SubjectContext,
} from "./prompts-general";

// ── Classification ────────────────────────────────────────────────────────────

export type Classification = {
  taxonomy: string[];
  taxonomyLeaf: string;
  breadcrumb: string;
  confidence: number;
  /** True when the offline alias match resolved it and no LLM call was made. */
  matchedOffline: boolean;
  /** Set when the classifier invented a node for this subject. */
  createdNode: string | null;
};

type ClassifyResponse = {
  taxonomyLeaf: string;
  confidence: number;
  proposed: { id: string; parentId: string; name: string; aliases?: string[] } | null;
};

async function candidateList(db: Db): Promise<{ id: string; name: string; lineage: string }[]> {
  const nodes = await allNodes(db);
  const names = (id: string) => nodes.get(id)?.name ?? id;

  const lineageNames = (node: TaxonomyNode): string => {
    const chain: string[] = [];
    let cursor: string | null = node.id;
    for (let guard = 0; cursor && guard < 16; guard++) {
      const current: TaxonomyNode | undefined = nodes.get(cursor);
      if (!current) break;
      chain.unshift(names(current.id));
      cursor = current.parentId;
    }
    return chain.join(" / ");
  };

  return [...nodes.values()]
    .map((node) => ({ id: node.id, name: node.name, lineage: lineageNames(node) }))
    .sort((a, b) => a.lineage.localeCompare(b.lineage));
}

/**
 * Place a subject in the taxonomy.
 *
 * Tries an exact name/alias match first, which resolves the common cases
 * ("Japanese", "Macroeconomics") for free. Only an unrecognized subject costs
 * an LLM call, and only that call may extend the tree.
 */
export async function classifySubject(
  db: Db,
  subject: string,
  objective: string,
): Promise<Classification> {
  const offline = await matchSubject(db, subject);
  if (offline) return await describe(db, offline.id, 1, true, null);

  const candidates = await candidateList(db);
  let response: ClassifyResponse;
  try {
    response = await generateJSON<ClassifyResponse>(
      CLASSIFY_SYSTEM_PROMPT,
      buildClassifyPrompt(subject, objective, candidates),
      { temperature: 0.2, maxTokens: 512, model: PRO_MODEL },
    );
  } catch {
    return await describe(db, "general", 0, false, null);
  }

  const nodes = await allNodes(db);
  let createdNode: string | null = null;
  let leaf = response.taxonomyLeaf;

  if (response.proposed) {
    const proposed = response.proposed;
    const id = slugify(proposed.id || proposed.name);
    const parent = nodes.get(proposed.parentId);
    // A proposal naming a parent that does not exist is unusable; fall back to
    // the parent the model picked as the leaf, or to `general`.
    if (id && parent) {
      const created = await ensureNode(db, {
        id,
        parentId: proposed.parentId,
        name: proposed.name || subject,
        aliases: [...(proposed.aliases ?? []), subject.toLowerCase()],
      });
      leaf = created.id;
      createdNode = created.origin === "generated" ? created.id : null;
    } else {
      leaf = nodes.has(proposed.parentId) ? proposed.parentId : "general";
    }
  }

  const refreshed = await allNodes(db);
  if (!refreshed.has(leaf)) leaf = "general";
  return await describe(db, leaf, response.confidence ?? 0.5, false, createdNode);
}

async function describe(
  db: Db,
  leaf: string,
  confidence: number,
  matchedOffline: boolean,
  createdNode: string | null,
): Promise<Classification> {
  const taxonomy = await lineageOf(db, leaf);
  return {
    taxonomy,
    taxonomyLeaf: taxonomy[taxonomy.length - 1],
    breadcrumb: await breadcrumb(db, taxonomy),
    confidence,
    matchedOffline,
    createdNode,
  };
}

/** Validate a lineage the client supplied after the user corrected the breadcrumb. */
export async function classificationFor(db: Db, leaf: string): Promise<Classification> {
  const nodes = await allNodes(db);
  return describe(db, nodes.has(leaf) ? leaf : "general", 1, true, null);
}

// ── Subject context ───────────────────────────────────────────────────────────

export async function buildSubjectContext(
  db: Db,
  input: { subject: string; taxonomy: string[]; nativeLanguage?: string },
): Promise<SubjectContext> {
  return {
    subject: input.subject,
    taxonomy: input.taxonomy,
    breadcrumb: await breadcrumb(db, input.taxonomy),
    spec: resolveSpec(input.taxonomy),
    nativeLanguage: input.nativeLanguage ?? "english",
  };
}

// ── Scope check ───────────────────────────────────────────────────────────────

export type ScopeReport = {
  breadth: "too_broad" | "workable" | "narrow";
  reason: string;
  questions: { id: string; question: string; options: string[]; allowsFreeText: boolean }[];
  suggestedObjective: string | null;
};

/**
 * Judge whether a goal can be planned as stated. Failure is non-fatal: a goal
 * that cannot be checked is treated as workable rather than blocking creation.
 */
export async function checkScope(
  subject: string,
  objective: string,
  nativeLanguage: string,
): Promise<ScopeReport> {
  try {
    const report = await generateJSON<ScopeReport>(
      SCOPE_CHECK_SYSTEM_PROMPT,
      buildScopeCheckPrompt(subject, objective, nativeLanguage),
      { temperature: 0.3, maxTokens: 1024 },
    );
    return {
      breadth: report.breadth ?? "workable",
      reason: report.reason ?? "",
      questions: Array.isArray(report.questions) ? report.questions.slice(0, 5) : [],
      suggestedObjective: report.suggestedObjective ?? null,
    };
  } catch {
    return { breadth: "workable", reason: "", questions: [], suggestedObjective: null };
  }
}

export type { TaxonomyNode };

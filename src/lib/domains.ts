// Client-side view of the domain model.
//
// The full registry lives on the server, which is the only place that needs to
// resolve prompts and exercise pools. The client only needs to know which
// optional surfaces a path mounts, so this stays deliberately small rather than
// duplicating a spec that would then have to be kept in sync.

export type TaxonomyNode = {
  id: string;
  parentId: string | null;
  name: string;
  depth: number;
  pathCount: number;
};

/** Speak, Vocabulary, and the TTS affordances only make sense for a language. */
export function isLanguagePath(taxonomy: string[] | undefined): boolean {
  return (taxonomy?.[0] ?? "") === "language";
}

/** Root-to-leaf display string, e.g. "Social Science / Economics / Macroeconomics". */
export function breadcrumbOf(taxonomy: string[], nodes: Map<string, TaxonomyNode>): string {
  return taxonomy.map((id) => nodes.get(id)?.name ?? id).join(" / ");
}

/** Children of a node, name-sorted, for the breadcrumb picker. */
export function childrenOf(
  parentId: string | null,
  nodes: Map<string, TaxonomyNode>,
): TaxonomyNode[] {
  return [...nodes.values()]
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Taxonomy lineage for a stored path, tolerating documents written before the
 * taxonomy work. Mirrors `subjectOf` on the server.
 */
export function taxonomyOf(path: {
  taxonomy?: string[];
  subject?: string;
  language?: string;
}): string[] {
  if (path.taxonomy && path.taxonomy.length > 0) return path.taxonomy;
  const legacy = path.language ?? path.subject;
  if (!legacy) return ["general"];
  return ["language", legacy.toLowerCase().replace(/[^a-z0-9]+/g, "_")];
}

/** Display name for a path, whichever field it happens to carry. */
export function subjectNameOf(path: { subject?: string; language?: string }): string {
  return path.subject ?? path.language ?? "";
}

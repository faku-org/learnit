# LearnIt x MindVault

**Expanding LearnIt from a language-learning app into a general deep-learning system.**

Design document. Version 0.2. Written against commit `cf8235d`.

> **Changes from v0.1** (all from review feedback):
> flat domain enum replaced by a growable taxonomy tree with path transfer (§3);
> calibration replaced by an adaptive item bank with cohort-based selection (§5);
> LaTeX answer input with command palette (§4.6);
> sources verified against real retrieval providers instead of trusted (§4.4);
> free-form answers accepted via a semantic grading fallback (§10.2);
> GraphQL plus subscriptions for the read and realtime surface (§11);
> scoping quiz for over-broad subjects (§3.5);
> the five open questions of v0.1 are now resolved and folded into the body (§17).

---

## 0. Decisions taken

| Question | Decision |
|---|---|
| Knowledge graph storage | Mongo (`knowledge_nodes`, `knowledge_edges`, `mastery_snapshots`). No Neo4j. |
| Exam gating | Soft gate with remediation. Pass threshold 70 minimum, adjustable upward. Override allowed but stamps the assessment and pushes gaps into the next module. |
| Domain model | Growable taxonomy tree, not a flat enum. Paths transfer across siblings. |
| Calibration | Adaptive item bank with cohort selection. Generation only on cold start. |
| API | GraphQL for reads, graph traversal, and subscriptions. REST retained for binary and multipart. |
| Delivery | This document, then implementation in phases (§16). |

Load-bearing call made without asking: **language becomes one branch of the taxonomy, not a parallel track.** Speak, Vocabulary, and TTS stay exactly as they are and mount when the active path sits under the `language` branch. Nothing about the language experience regresses.

---

## 1. What exists today

The current system is a well-factored language pipeline. Very little of it is thrown away.

```
Goal (language + objective)
  -> CalibrationFlow          projective questions + adaptive placement ladder
  -> PATH_OUTLINE prompt      10 module headers, one PRO call
  -> MODULE_TOPICS prompt     3-5 topics per module, hydrated on demand
                              from real accuracy (api/src/index.ts:168)
  -> /api/exercises/next      SRS due card -> unseen bank item -> LLM generation
  -> client-side grading      string equality (LearnPage.tsx:587)
  -> /api/exercises/answer    SM-2 update + append to `attempts` + session counters
  -> topic complete           LessonSummary modal
  -> module complete          SectionSummary modal, +100 points, straight into
                              the next module
```

Worth preserving:

- **Segmented path generation.** The outline is written once; each module's topics are written on arrival, conditioned on measured performance. Already a co-evolution loop, just a shallow one.
- **Append-only attempt log.** `attempts` is never mutated and every statistic derives from it. MindVault's $\mathcal{M}$ in embryo.
- **Shared exercise bank.** `exercises` keyed by `topicKey`, shared across users; `user_exercises` holds the per-user SM-2 card. Generation cost amortizes. This pattern is reused three more times in this document (calibration items, verified sources, exam blueprints).
- **On-demand hydration with graceful degradation.** `ensureModuleHydrated` (LearnPage.tsx:368) tolerates failure and retries.

Limitations this document addresses:

- `language` is threaded through every schema, prompt, endpoint, and component.
- `CALIBRATION_TOPICS` (prompts.ts:22) is a hardcoded four-level pool of language grammar topics, with no equivalent for arbitrary subjects.
- Exercise content is a flat bag of optional strings. No formula, no graph, no cited source.
- Grading is client-side string equality. The student must reproduce the expected string exactly.
- There is no assessment. `completeModule` (index.ts:1429) sums sessions and awards a bonus. It never asks the student to demonstrate anything and never influences what comes next.
- Mastery is a `{total, correct}` counter overwritten in place. History is unrecoverable.

---

## 2. MindVault mapped onto LearnIt

The paper models a mind as a dynamic graph $G(t) = (V, E(t), W(t))$ whose identity $\text{Yo}(t) = \phi(G(t))$ is a global property, not a node. The external system $\mathcal{V} = (\mathcal{M}, \mathcal{I}, \mathcal{A}) + \mathcal{O}$ co-evolves with it.

A learning system is an easier instance of the same problem: the graph is a knowledge graph rather than a whole identity, ground truth is externally checkable, and latency between change and recognition is days rather than years.

| MindVault | LearnIt |
|---|---|
| $\mathcal{M}$, append-only memory store | `attempts`, extended with confidence, concept links, rich context (§9). |
| $K(t)$, knowledge index | `knowledge_nodes` + `knowledge_edges` (§8). |
| `version_de` / `EVOLUCIONA_DE` | `mastery_snapshots.evolvesFrom`. Mastery never updated in place. Spine of the design. |
| $W(t)$, weights shifting with experience | `knowledge_edges.weight`, updated as prerequisites prove out or fail to. |
| $\phi(G(t))$, emergent global identity | The **learner profile** (§8.4). Not readable off any node. Also the clustering key for calibration cohorts (§5.3), which is the paper's idea earning its keep twice. |
| $\mathcal{A}_{monitor}$ | The answer handler. Each attempt proposes a mastery delta against $K(t)$. |
| $\mathcal{A}_{retro}$ | **The section exam.** Literally a retrospective pass over $\mathcal{M}(t_0 \to t_n)$ surfacing decay the monitor could not see. Strongest fit in the paper. |
| $\Delta W = f(M(t_0), C(t_1))$ | Decay computed on read, materialized as a snapshot only when an exam or review **observes** it (§8.3). |
| `certeza` | Per-answer confidence (§7). |
| Preguntas proyectivas, cold start | `CalibrationFlow` already asks motivation, time, prior exposure, self-rating before any item. Generalized in §5. |
| $\mathcal{O}_{externo}$ | The second grader (§6.6): separate call, different temperature, blind to the first. |
| $\mathcal{O}_{humano}$ | Student appeal on a contested grade, plus the existing `feedback` difficulty signal. |
| §6 retrospective queries | "How well did I understand X in March?" Walk `evolvesFrom`. "What decayed?" Negative-delta snapshots with `source: "decay"`. |

Deliberate divergence: MindVault §3.4 proposes continuous finetuning of $\mathcal{A}$. For LearnIt that is premature. Feeding structured assessment output back into prompt context (§6.4) captures most of the value and is inspectable and reversible. Finetuning stays on the roadmap.

---

## 3. The domain taxonomy

### 3.1 Tree, not enum

A flat enum cannot express that macroeconomics and microeconomics are siblings sharing most of their foundations. Depth is what lets path generation target real topics instead of gesturing at a field.

```
social_science
  economics
    macroeconomics
    microeconomics
    econometrics
    development_economics
  law
  psychology
formal_science
  mathematics
    calculus
    linear_algebra
    probability
    number_theory
natural_science
  physics
    classical_mechanics
    electromagnetism
    quantum_mechanics
    thermodynamics
  chemistry
  biology
humanities
  history
    ancient_history
    medieval_history
    modern_history
  philosophy
  literature
  classics
language
  japanese
  german
  ...
computing
practical
```

A path stores its full lineage, not a single label:

```ts
export const PathSchema = z.object({
  userId: z.string(),
  subject: z.string().min(1),            // "Macroeconomics", free text from the user
  /** Root-to-leaf taxonomy ids. Denormalized so every query filters on it cheaply. */
  taxonomy: z.array(z.string()).min(1),  // ["social_science","economics","macroeconomics"]
  taxonomyLeaf: z.string(),              // "macroeconomics", indexed
  objective: z.string().min(1),
  timeframe: z.string().nullable(),
  startingLevel: CalibrationLevelSchema,
  modules: z.array(PathModuleSchema),
  /** Set when this path was seeded from a sibling path. See 3.4. */
  transferredFrom: TransferRefSchema.nullable(),
  createdAt: z.string(),
});
```

### 3.2 The tree grows

A curated seed tree of roughly 150 nodes across three levels covers most of what people study. It will never cover everything: someone will ask for Byzantine sigillography.

So the taxonomy is **data, not code**. A `taxonomy_nodes` collection, seeded from a checked-in JSON file, extended at runtime:

```ts
// taxonomy_nodes
{
  _id, id, parentId, name, aliases: string[],
  depth: number,
  /** Spec fragment. Merged root-to-leaf at resolution time. */
  spec: Partial<DomainSpec>,
  origin: "seed" | "generated",
  pathCount: number,        // popularity, drives cohort thresholds
  createdAt,
}
```

On path creation the classifier places the subject in the tree. If no node fits below the third level it creates one under the closest parent, marked `origin: "generated"`. New nodes inherit their parent's spec entirely and may add nothing. The tree deepens as usage does.

Placement is one cheap call returning `{ taxonomy: string[], confidence: number, created: string[] }`, shown to the user as a breadcrumb they can correct. A misplacement is cheap: it affects exercise mix and transfer candidates, not correctness.

### 3.3 Spec resolution by inheritance

`DomainSpec` is no longer a flat lookup. It resolves by merging fragments from root to leaf, child winning:

```ts
export type DomainSpec = {
  exerciseTypes: ExerciseType[];     // merged, child-first ordering
  blocks: BlockKind[];               // union
  defaultGrading: GradingMode;       // override
  persona: string;                   // override
  rules: string[];                   // concatenated, root rules first
  features: { speak: boolean; vocabulary: boolean; tts: boolean };  // override
  sourceProviders: SourceProviderId[];  // union, see 4.4
};

export function resolveSpec(taxonomy: string[]): DomainSpec;  // memoized
```

So `formal_science` contributes "every formula MUST be a latex block", `mathematics` adds the numeric grading default and the plot block, and `calculus` adds only what is specific to calculus. Most leaves add nothing, which is the point: the tree can be deep without the registry becoming unmaintainable.

The `language` branch is a verbatim lift of today's behaviour. The regression test for Phase 1 is that a language path produces byte-identical prompts before and after the refactor.

### 3.4 Path transfer across siblings

This is the payoff of the tree, and the feature that most changes what the product is.

When a student who has studied Macroeconomics starts Microeconomics, the two paths share the ancestor `economics`. Most of the foundation (supply and demand, elasticity, marginal analysis, basic optimization) is already mastered and already in the knowledge graph. Making them grind through it again is the single most common way learning software wastes people's time.

```ts
type TransferRef = {
  fromPathId: string;
  sharedAncestor: string;          // "economics"
  distance: number;                // taxonomy hops between leaves
  carriedConcepts: { conceptId: string; mastery: number; decayAdjusted: number }[];
  skippedModules: { index: number; reason: string }[];
  compressedModules: { index: number; from: number; to: number; reason: string }[];
};
```

At path creation, if a sibling path exists within the taxonomy:

1. Collect concepts from the source path with `decayAdjusted` mastery above threshold (§8.3, so a year-old mastery does not count as fresh).
2. Pass them into `buildPathOutlinePrompt` as *already known*, with the instruction to skip, compress, or reframe rather than reteach.
3. Mark modules that would be pure repetition as `skipped`, and modules with partial overlap as `compressed` with a shorter topic list.
4. Concepts carry into the new path as the **same graph nodes**, not copies. This is open question #4 from v0.1, answered yes: a concept links to several topics across several paths, and mastery is a property of the concept, not of the path that taught it.

The user is shown the transfer as a reviewable diff before generation: "You already know 14 of these concepts from Macroeconomics. I am skipping 2 modules and shortening 3." They can reject any of it.

Transfer applies to any sibling relationship, not just adjacent leaves. Distance controls aggressiveness: siblings under the same parent transfer freely, cousins two levels up transfer only high-mastery concepts, and anything further transfers nothing.

### 3.5 Scoping over-broad subjects

"Learn physics" produces ten shallow modules and a useless path. Rather than failing or guessing, the system asks.

At path creation, a scope check returns:

```ts
{
  scoped: boolean,
  breadth: "too_broad" | "workable" | "narrow",
  ambiguities: { question: string; options: string[]; allowsFreeText: boolean }[],
}
```

If `too_broad`, a short generated form runs before anything else: three to five questions narrowing subfield, level, purpose, and prior exposure. Answers feed both taxonomy placement and a rewritten objective. It reuses the projective-question UI already in `CalibrationFlow`, so this is mostly copy and wiring rather than new surface.

`narrow` is also flagged, more gently: "Kirchhoff's laws" is a topic, not a curriculum, and the system offers to widen to the containing subject with that topic as the objective.

---

## 4. Content blocks

Today an exercise is a flat bag of optional strings. A physics problem needs a formula and a free-body diagram; a history problem needs a cited excerpt in the original with a translation.

Exercises gain an optional `blocks: ContentBlock[]`. Legacy documents render through the existing `question` / `sentence` / `sourceText` path, so **no backfill is required**.

```ts
export type ContentBlock =
  | { kind: "text";    value: string }
  | { kind: "latex";   value: string; display?: boolean }
  | { kind: "plot";    spec: PlotSpec }
  | { kind: "diagram"; spec: DiagramSpec }
  | { kind: "source";  ref: SourceRef }          // see 4.4
  | { kind: "code";    lang: string; value: string; highlight?: number[] }
  | { kind: "table";   headers: string[]; rows: string[][]; caption?: string };
```

### 4.1 Security constraint, non-negotiable

**No block may carry raw SVG, raw HTML, or an expression that reaches `eval` or `new Function`.** Every block is a declarative spec interpreted by a whitelisted renderer.

Exercises land in a bank shared across users. A generator that can emit markup is stored XSS against everyone who later draws that exercise. This constraint shapes `PlotSpec` and `DiagramSpec` below and is not negotiable for a shared bank.

### 4.2 Plots

```ts
type PlotSpec = {
  type: "function" | "scatter" | "vector" | "bar" | "number_line";
  domain?: [number, number];
  range?: [number, number];
  xLabel?: string; yLabel?: string;
  grid?: boolean;
  series: {
    label?: string;
    /** Expression in x, parsed by src/lib/expr.ts. Never evaluated as JS. */
    expr?: string;
    points?: [number, number][];
    vectors?: { from: [number, number]; to: [number, number]; label?: string }[];
    style?: "solid" | "dashed";
  }[];
  markers?: { x: number; y: number; label?: string }[];
};
```

`src/lib/expr.ts` is a shunting-yard parser, roughly 120 lines, supporting `+ - * / ^ ( )`, the variable `x`, and a fixed function set (`sin cos tan asin acos atan exp ln log sqrt abs floor ceil`). Unparseable input yields no curve and the block degrades to its label. It is also reused by the symbolic grader (§10.3).

Rendering is an in-house SVG component. Plotly, d3, and chart.js are all heavier than the need and several want to inject styles or fetch fonts.

### 4.3 Diagrams

Free-body diagrams, circuits, and geometry do not fit a flowchart tool, which rules out mermaid. The spec is a whitelist of geometric primitives:

```ts
type DiagramSpec = {
  viewBox: [number, number, number, number];
  elements: (
    | { t: "line"; x1: number; y1: number; x2: number; y2: number;
        arrow?: "end" | "both" | "none"; dashed?: boolean; label?: string }
    | { t: "circle"; cx: number; cy: number; r: number; fill?: boolean; label?: string }
    | { t: "rect"; x: number; y: number; w: number; h: number; label?: string }
    | { t: "arc"; cx: number; cy: number; r: number; start: number; end: number; label?: string }
    | { t: "polygon"; points: [number, number][]; fill?: boolean; label?: string }
    | { t: "label"; x: number; y: number; text: string; latex?: boolean }
  )[];
};
```

Every field is a number or a string landing in a text node. The renderer builds the element tree; the model never supplies markup.

### 4.4 Sources, verified rather than trusted

An LLM asked for a primary source will invent one with a plausible attribution. Instructing it not to does not work. So sources are **retrieved and verified**, never taken on the generator's word.

```ts
type SourceRef = {
  sourceId: string;              // -> `sources` collection
  excerptStart?: number;         // offset into the stored text
  excerptEnd?: number;
  showTranslation: boolean;
};

// collection: sources  (shared, not user-scoped)
{
  _id, provider: SourceProviderId,
  externalId: string,            // DOI, arXiv id, Perseus urn, Wikisource title
  author, work, date, lang,
  text: string,                  // the actual retrieved text
  translation: string | null,
  url: string,
  license: string | null,
  verifiedAt: string,
  usageCount: number,
}
```

Provider interface, one implementation per backend:

```ts
type SourceProvider = {
  id: SourceProviderId;
  /** Confirm a proposed citation exists and return the real text. */
  verify(claim: { author?: string; work?: string; passage?: string }): Promise<SourceCandidate | null>;
  search(query: string, opts: { lang?: string; era?: string }): Promise<SourceCandidate[]>;
};
```

Providers, chosen per taxonomy branch via `DomainSpec.sourceProviders`:

| Provider | Branch | Why |
|---|---|---|
| **Perseus Digital Library** | classics, ancient_history | Canonical Greek and Latin texts with stable URNs and existing translations. The right tool for "fragmentos de texto antiguo". |
| **Wikisource** | history, literature, philosophy | Broad public-domain primary text with stable titles. |
| **Project Gutenberg** | literature | Full public-domain works. |
| **Crossref / OpenAlex** | natural_science, social_science | DOI resolution and metadata verification for academic claims. |
| **arXiv** | physics, mathematics, computing | Preprint full text. |
| **xAI Live Search / Perplexity** | any | General fallback when no structured provider covers the claim. Returns citations, which are then verified against a structured provider where possible. |
| **DuckDuckGo** | any | Last-resort free fallback, lowest trust weight. |

Flow: the generator proposes a citation, the provider chain verifies it, and on failure the block is dropped and regenerated once. A source that cannot be verified never reaches the student. Verified sources are cached in the shared `sources` collection, so the retrieval cost amortizes exactly like the exercise bank.

Every source block still carries a visible provenance line with the provider and a link, because verification proves the text exists, not that the tutor's reading of it is sound.

### 4.5 Rendering

`ContentBlocks` dispatches to one renderer per kind, with legacy fallback for blockless documents. The `source` renderer shows the excerpt in the original with a translation toggle and optional term glosses, styled distinctly from generated prose so primary source is always visually separable from tutor commentary.

### 4.6 LaTeX answer input

For quantitative domains the student needs to *write* mathematics, not only read it. Free-text mathematics is ambiguous for both the student and the grader; LaTeX is unambiguous for both.

`src/components/answers/MathInput.tsx`:

- A textarea holding raw LaTeX, with a live KaTeX preview rendered directly below.
- **Command palette** on `\` or `/`: fuzzy search over a catalog of functions, operators, Greek letters, matrices, integrals, sums, and limits. Insert places the cursor in the first argument slot; Tab cycles slots.
- **Keyboard shortcuts** for the common cases: `Ctrl+F` fraction, `Ctrl+R` root, `Ctrl+8` product, `^` and `_` auto-brace, `Ctrl+Space` to accept the top palette match.
- The catalog is filtered by taxonomy: a calculus path surfaces integrals and limits first, a linear algebra path surfaces matrices and vector notation first.
- The raw LaTeX string is what reaches the grader, so the model receives unambiguous input rather than an attempt to parse `(x+1)/(2x-3)^2` out of prose.

Symbolic answers normalize before comparison (strip `\left` and `\right`, collapse whitespace, unify `\cdot` and `*`, canonicalize fraction forms) so the easy cases match deterministically and only genuine ambiguity reaches the LLM.

### 4.7 Dependencies added

`katex` (rendering, self-hosted with fonts). Everything else in this section is in-house. The frontend already carries React 19, motion, and Tailwind 4; a plotting library plus a diagram library plus a math editor would roughly triple the bundle for capability expressible in a few hundred lines.

---

## 5. Calibration as an adaptive item bank

### 5.1 What carries over

`CalibrationFlow` opens with four projective questions (motivation, daily time, prior exposure, self-rating) before any test item. That is MindVault §2.4's cold-start prior and it is subject-agnostic as written. Only the copy generalizes.

The adaptive ladder (probe a level, move up or down, at most three stages) also stays.

### 5.2 What changes

Generating fresh probe questions for every user on every path is wasteful and, worse, inconsistent: two students of equal ability get different tests and land on different levels. The fix is a **shared item bank with measured item statistics**, which is standard computerized adaptive testing, and it gets better the more it is used.

```ts
// calibration_items  (shared, not user-scoped)
{
  _id, taxonomyId, level: CalibrationProbeLevel,
  topic, prompt, instruction, options: string[], correctIndex,
  stats: {
    asked: number,
    correct: number,
    /** IRT parameters, refitted periodically from response data. */
    difficulty: number,        // b
    discrimination: number,    // a
  },
  /** Where this item was informative. See 5.3. */
  cohorts: { clusterId: string; information: number }[],
  origin: "generated" | "curated",
  createdAt,
}
```

Selection at each stage picks the items maximizing Fisher information at the student's current ability estimate, rather than sampling a fixed topic list at random. An item that everyone gets right carries no information and stops being served regardless of how good it looked when written.

### 5.3 Cohort selection

The refinement from review: which items to serve should depend on **who the student resembles**, not only on their current ability estimate.

The clustering key is already defined: $\phi(G(t))$, the learner profile (§8.4). Cluster on the profile vector (error signature, calibration tendency, pacing, retention half-life, taxonomy history) and record, per item, how much information it carried within each cluster.

```
cold  (bank empty for this taxonomy node)
   -> generate a blueprint, serve it, record responses

warm  (bank has items, student has no profile)
   -> serve by global IRT information at the estimated ability

hot   (bank has items, student has a profile)
   -> assign to nearest cluster, serve items that discriminated well
      for that cluster, fall back to global information
```

Generation therefore happens on cold start and to backfill thin regions of the bank, not on every path. Cost per calibration falls toward zero as the bank fills, which is the point of the correction.

Two safeguards worth stating, because adaptive testing systems fail in exactly these ways:

- **Exposure control.** An item served to everyone leaks. Randomize among the top-k informative items rather than always taking the argmax, and retire items whose `asked` count crosses a threshold.
- **Cold-cluster fallback.** A student whose profile matches no cluster well gets global selection, not a forced assignment to the nearest bad match. Cluster assignment requires a similarity floor.

Clusters are recomputed as a periodic batch job, not on the request path.

### 5.4 Fallback

If the bank is empty and generation fails, calibration degrades to the projective questions alone and `startingLevel` comes from `selfRating`, which is what the existing skip path already does.

---

## 6. The section exam

The centrepiece of the request, and the piece that does not exist in any form today.

### 6.1 Trigger and routing

`advanceTopic` (LearnPage.tsx:117) currently walks straight from the last topic of module *m* into module *m+1*. It stops at the boundary instead:

```ts
progress.pendingExam = { moduleIndex: m, blueprintReady: false };
```

The Learn page routes to `ExamGate`. Generation is kicked off speculatively as soon as the student reaches the **last topic** of the module, and progress streams over a subscription (§11.3), so the blueprint is usually warm on arrival.

### 6.2 Blueprint

Every input is assembled server-side. The client supplies the location only, never difficulty or weighting, so a modified client cannot request an easy exam.

Inputs: every `topic_sessions` document for the module (accuracy, gave-up count, `errorsByType`), concept mastery for concepts the module touched, prior assessments on this path, and the confidence record of where the student was sure and wrong.

**Length** scales with the module rather than being fixed at ten (open question #1, resolved):

```
items = clamp(6, round(2.2 * topicCount * difficultyModifier), 16)

difficultyModifier = 1.0
  + 0.25 if module accuracy < 0.65      // shakier module, longer exam
  - 0.15 if module accuracy > 0.90      // solid module, shorter exam
  + 0.20 if this is a retake
```

Allocation:

| Share | Kind | Purpose |
|---|---|---|
| 40% | Weakest topics by accuracy and gave-up count | Test what is actually shaky |
| 30% | Even coverage of remaining topics | Prevent blind spots |
| 20% | **Synthesis**, crossing two topics | What makes it an exam rather than more practice |
| 10% | **Carry-forward** from earlier modules | Probe decay. The latency measurement of MindVault §2.5. |

Exam conditions differ from practice deliberately: one notch harder, no hints, no "I don't know", no skip, one attempt per item, confidence required on every item, no SRS credit during the exam.

Generation is two or three parallel calls batched by type family. Blueprints are cached in the shared bank keyed by `(taxonomyLeaf, moduleIndex, level)` like exercises, so the second student through a given module pays generation cost only for the personalized portion.

### 6.3 Submission and report

1. Deterministic grading for `choice`, `numeric`, `order`, `set`, `exact`.
2. Semantic fallback (§10.2) for near-misses on `exact` and `numeric`.
3. One batched rubric call for `short_answer`, `source_analysis`, `compare_contrast`.
4. Second, independent grader on rubric items (§6.6).

```ts
type ExamReport = {
  examId: string;
  moduleIndex: number; moduleName: string;
  attempt: number;                 // retakes are new documents, never overwrites
  score: number;                   // 0-100
  passed: boolean;
  passThreshold: number;           // 70 floor, raised for prerequisite-heavy modules
  itemCount: number; correctCount: number; durationMs: number;

  byTopic: {
    topicIndex: number; topicName: string;
    asked: number; correct: number; accuracy: number;
    verdict: "solid" | "shaky" | "weak";
  }[];

  byConcept: { conceptId: string; name: string; mastery: number; delta: number }[];

  confidence: {
    brier: number;                                           // lower is better
    overconfident: { itemId: string; topicName: string }[];   // sure and wrong
    underconfident: { itemId: string; topicName: string }[];  // unsure and right
  };

  misconceptions: { statement: string; evidence: string[]; conceptId?: string }[];

  retention: {
    carriedForwardCorrect: number; carriedForwardTotal: number;
    decayedTopics: TopicRef[];
  };

  contested: { itemId: string; scoreA: number; scoreB: number }[];

  plan: NextSectionPlan;
};
```

The `confidence` block is the highest-value output in the system. "You were sure and wrong about X" identifies exactly where a student's model of their own knowledge is broken, which ordinary practice cannot surface.

**Pass threshold** (open question #2, resolved): 70 is the floor. It is raised, never lowered, for modules whose concepts are prerequisites for much of what follows, computed from out-degree on `PREREQUISITE_OF` in the knowledge graph. A gateway module can demand 80.

### 6.4 The plan, and how it changes the next section

The direct answer to "cómo se va a hacer en la próxima: qué se va a repetir más, consejos, y cómo estructurar el aprendizaje".

```ts
type NextSectionPlan = {
  reviewTopics: { topicIndex: number; topicName: string; reason: string; weight: number }[];
  reviewSchedule: { topicKey: string; dueAfterExercises: number }[];
  pacing: "slow_down" | "hold" | "accelerate";
  emphasisTypes: ExerciseType[];       // "you fail derivations, not recall"
  deemphasisTypes: ExerciseType[];
  tips: { title: string; body: string }[];
  structure: string;                   // prose: how to attack the next section
  prerequisiteGaps: { conceptName: string; fromModuleIndex: number }[];
};
```

The plan is not advisory text in a modal. It has four mechanical effects:

1. **`buildModuleTopicsPrompt` gains a `priorAssessment` parameter.** Today it receives a single accuracy ratio (prompts.ts:234). It receives the whole plan instead, so the next module's topics are written knowing which topics were weak, which misconceptions are live, and whether to slow down. This closes the co-evolution loop: $G'(t)$ updates from a real measurement of $G(t)$ rather than a running average.
2. **`reviewSchedule` injects forced-due SRS cards** into the next module's practice, so review is structural rather than suggested.
3. **`emphasisTypes` biases `pickNextType`** (index.ts:128), which currently rotates uniformly.
4. **`prerequisiteGaps` propagates** if the gate is overridden (§6.5).

### 6.5 The soft gate

If passed, the report shows and the student moves on.

If not:

- The report leads with the diagnosis, not the score.
- A **remediation set** is offered: the two or three weakest topics, four correct answers each, served from normal practice with the identified misconceptions injected into generation so exercises target the actual error rather than the topic generically.
- Retake unlocks after remediation, or immediately with a warning.
- **Continue anyway** is always available. Taking it stamps `overridden: true` and moves unresolved gaps into `plan.prerequisiteGaps`, which the next module's topic prompt must address. Skipping the gate is allowed; skipping the consequence is not.

### 6.6 O_externo, the independent grader

MindVault §4 argues from Gödel that no system validates itself from inside. For rubric grading this is not philosophy but a real failure mode: a single LLM grader is quietly inconsistent across runs.

For rubric items, a second call runs at a different temperature, blind to the first grader's output. Scores differing by more than 0.3 mark the item `contested`, the average is used, and the disagreement is shown in the report with an appeal affordance. The student is $\mathcal{O}_{humano}$.

### 6.7 Persistence

```
exams          one document per attempt: blueprint, items, answers, status
assessments    one document per graded attempt: the full ExamReport
```

Both append-only. A retake is `attempt: 2`, a new document. The trajectory across attempts stays recoverable, which is what `EVOLUCIONA_DE` demands.

### 6.8 Language paths

Written exams do not cover speaking or listening (open question #5, resolved: yes, they need their own format). `/api/speak/grade` already exists and generalizes: language exams gain `spoken_response` and `listening_comprehension` item types that route through the existing xAI pipeline. Deferred to Phase 5, since it depends on nothing else in the exam machinery.

---

## 7. Confidence, or `certeza`

The student marks confidence on a four-point scale (guessing / unsure / fairly sure / certain) before submitting.

**Cadence** (open question #3, resolved): not every answer, which is friction on every single interaction, and not never. A configurable interval in Settings, defaulting to every 5th practice item, plus always in exams, plus always on the first item of a new topic. One integer per attempt buys:

- **Brier score**, a real measure of how well the student knows what they know.
- **The overconfidence list**, the most actionable output the system produces.
- **A fixed SRS quality mapping.** SM-2 takes 0-5 (index.ts:59) and currently receives 5 for correct, 1 for wrong. Confident-and-correct should be 5; unsure-and-correct should be 3, because a lucky guess must come back sooner. This is a genuine improvement to the existing algorithm, independent of everything else here.
- **A mastery signal separate from accuracy**, feeding `mastery_snapshots.calibration`.
- **The clustering signal** for calibration cohorts (§5.3).

It maps directly onto MindVault's `certeza`, and on the graph it distinguishes a well-established node from a fragile one.

---

## 8. The knowledge graph, K(t)

### 8.1 Collections

```ts
// knowledge_nodes
{
  _id, userId,
  kind: "concept" | "skill" | "misconception",
  name, slug,
  /** Taxonomy lineage, NOT a single path. A concept spans paths. */
  taxonomy: string[],
  /** Every path/topic that has taught or tested this concept. */
  taughtIn: { pathId: string; moduleIndex: number; topicIndex: number }[],
  description,
  firstSeenAt, lastTouchedAt,
}

// knowledge_edges
{
  _id, userId,
  from: ObjectId, to: ObjectId,
  type: "PREREQUISITE_OF" | "RELATED_TO" | "CONTAINS" | "CONTRADICTS" | "ORIGINATED_IN",
  weight: number,             // W(t)
  evidence: ObjectId[],       // attempt / assessment ids
  createdAt, updatedAt,
}
```

Concepts are emitted by the topic generator: each topic gains `concepts: string[]`, and the module topic prompt additionally returns prerequisite edges among them.

**Nodes are shared across paths** (open question #4, resolved). `taughtIn` is an array, and mastery is a property of the concept rather than of the path that happened to teach it. This is what makes §3.4 transfer work and what makes the graph more than a per-path progress bar.

### 8.2 Mastery snapshots, the EVOLUCIONA_DE spine

```ts
// mastery_snapshots  -- APPEND ONLY. Never update, never delete.
{
  _id, userId, conceptId,
  mastery: number,            // 0-1
  confidence: number,         // 0-1, mean self-report
  calibration: number,        // mastery - confidence, signed
  evidenceCount: number,
  source: "attempt" | "exam" | "decay" | "remediation" | "transfer",
  sourceId: ObjectId | null,
  evolvesFrom: ObjectId | null,   // <- version_de / EVOLUCIONA_DE
  delta: number,
  detectedAt: string,             // when the change was RECOGNIZED
  createdAt: string,
}
```

Current mastery is the latest snapshot per concept, served from an index on `{ userId, conceptId, createdAt: -1 }`.

The split between `createdAt` and `detectedAt` is the point of §2.5. Decay happens continuously and silently; it is only ever *recognized* when something looks back and measures it.

### 8.3 Decay observed, not simulated

No cron job. Effective mastery is computed on read:

$$m_{\text{eff}} = m \cdot e^{-\lambda \Delta t}$$

with $\lambda$ derived from the concept's own history (SM-2 ease as the stability proxy, so concepts that historically stuck decay slower).

A `decay` snapshot is materialized **only when an exam or review item actually observes the gap**. That is $\Delta W = f(M(t_0), C(t_1))$ implemented literally: the memory of the state, the later consciousness that it changed, and a recorded latency between them.

`decayAdjusted` mastery is also what gates path transfer (§3.4), so a year-old mastery does not let a student skip a module they no longer actually know.

### 8.4 φ(G(t)), the learner profile

Not a node. A function of the whole graph.

```ts
type LearnerProfile = {
  computedAt: string;
  taxonomyCoverage: { taxonomyId: string; paths: number; mastery: number; accuracy: number }[];
  errorSignature: { exerciseType: ExerciseType; failureRate: number }[];
  calibration: { brier: number; tendency: "overconfident" | "calibrated" | "underconfident" };
  pacing: { avgMsPerItem: number; sessionsPerWeek: number; preferredSessionLength: number };
  retention: { avgHalfLifeDays: number };
  strongestConcepts: ConceptRef[];
  weakestConcepts: ConceptRef[];
  blockedBy: { concept: ConceptRef; blocking: ConceptRef[] }[];   // $graphLookup
  /** Cohort assignment for calibration item selection. See 5.3. */
  clusterId: string | null;
};
```

Cached with a TTL. This is what makes the system feel like it knows the student rather than the session: "you fail derivations, not recall" is a claim about the shape of the graph that no single attempt supports.

### 8.5 Why Mongo suffices

The traversals actually needed are shallow: prerequisite chains at depth 3 or 4 via `$graphLookup`, mastery history via `evolvesFrom`, one or two hops for the map view. None of that needs Cypher. Should multi-hop queries get genuinely deep, the collections map onto Neo4j nodes and relationships one-to-one.

---

## 9. The memory store, M

`attempts` stays and is extended. Already append-only, already the source of every statistic.

```ts
export const AttemptSchema = z.object({
  // ... all existing fields unchanged ...

  conceptIds: z.array(z.string()).default([]),
  confidence: z.number().min(1).max(4).nullable().default(null),   // certeza
  gradingMode: GradingModeSchema.default("exact"),
  score: z.number().min(0).max(1).default(0),                      // partial credit
  /** Set when the semantic fallback overturned a deterministic mismatch. */
  semanticOverride: z.boolean().default(false),
  misconceptionIds: z.array(z.string()).default([]),
  examId: z.string().nullable().default(null),

  /** MindVault "contexto": the situation the memory was formed in. */
  context: z.object({
    sessionPosition: z.number(),
    timeOfDay: z.number(),                  // 0-23
    daysSinceTopicFirstSeen: z.number(),
    afterGiveUp: z.boolean(),
    inExam: z.boolean(),
  }).optional(),
});
```

Every new field is optional with a default, so existing documents and the existing stats aggregation keep working untouched.

The context block makes retrospective analysis possible: "you are 20% worse after 11pm" and "your accuracy collapses on the third item" are questions the current schema cannot answer.

---

## 10. Grading

### 10.1 Modes

```ts
export type GradingMode = "exact" | "numeric" | "set" | "order" | "choice" | "rubric" | "symbolic";

type GradingSpec =
  | { mode: "exact";    answer: string; accept?: string[];
                        normalize?: "language" | "strict" | "loose" }
  | { mode: "numeric";  value: number; tolerance: number; relative?: boolean;
                        unit?: string; sigFigs?: number }
  | { mode: "choice";   correctIndex: number }
  | { mode: "set";      pairs: { left: string; right: string }[] }
  | { mode: "order";    items: string[] }
  | { mode: "symbolic"; latex: string; variables: string[] }
  | { mode: "rubric";   criteria: { id: string; description: string; weight: number }[];
                        modelAnswer: string; passScore: number };
```

### 10.2 Free-form answers, the semantic fallback

The correction that most changes day-to-day feel. Today the student must reproduce the expected string exactly; "das Auto" fails against "Auto", "9.81" fails against "9.8", and a correct explanation in the student's own words fails against the model answer.

Grading becomes a **ladder**, not a single check:

```
1. deterministic     exact / numeric / choice / set / order      instant, free
2. normalization     case, punctuation, articles, LaTeX forms,   instant, free
                     unit conversion, significant figures
3. semantic check    FLASH_MODEL, only fires on steps 1-2 miss   ~400ms, cheap
4. rubric            for genuinely open answers                  batched
```

Step 3 is the new one:

```
POST /api/grade/semantic
  { question, expected, actual, taxonomy, gradingMode }
  -> { correct: boolean, equivalence: "exact"|"equivalent"|"partial"|"wrong",
       note: string, misconception?: string }
```

Three properties that make this safe to put in the answer path:

- **It only fires on a deterministic miss.** The common correct case stays instant and free.
- **It can only overturn a wrong to a right, never the reverse.** A deterministic match is never sent for review. This keeps the failure mode benign.
- **Results cache** on `hash(expected, actual, taxonomy)`. Near-misses repeat heavily across users, so the bank warms fast.

Flash model, `maxTokens` around 150, temperature 0.1. Attempts record `semanticOverride: true` when it fires, so the rate is measurable and a badly calibrated grader is detectable rather than silent.

### 10.3 Symbolic

Symbolic answers normalize first (§4.6) and compare structurally where possible using the `expr.ts` parser: parse both sides, evaluate at several random points in the domain, and treat agreement within tolerance across all of them as equivalence. This catches `(x+1)^2` against `x^2+2x+1` without an LLM call. Only genuine ambiguity escalates to step 3.

### 10.4 Authority

Practice grades optimistically on the client for instant feedback. **In exams the server is authoritative for every mode**, including the semantic ladder.

Rubric response feeds the graph:

```ts
{
  score: number,                  // 0-1
  perCriterion: { id: string; met: boolean; note: string }[],
  feedback: string,
  misconceptions: string[],       // -> Misconception nodes in K(t)
}
```

Free-text answers are where misconceptions are actually visible, and this is how they reach the graph.

---

## 11. API

### 11.1 The split, and why

GraphQL for the read surface, graph traversal, and subscriptions. REST retained where GraphQL cannot go or adds nothing.

Being straight about the tradeoff: the over-fetching argument is real for the knowledge graph and the profile, where the client wants client-specified depth over nested data, and thin for most of the rest, which is RPC-shaped commands (`generate exercise`, `record answer`, `submit exam`) where a GraphQL mutation is a wrapper over what already exists. Elysia's end-to-end type inference is also traded for codegen. The decision stands on **subscriptions**, which is where the current REST surface genuinely fails and where GraphQL brings real machinery rather than a rename.

### 11.2 GraphQL surface

Transport: `graphql-yoga` mounted in Elysia, subscriptions over Bun's native WebSocket via `graphql-ws`.

```graphql
type Query {
  path(id: ID): Path
  paths: [Path!]!
  progress(pathId: ID!): Progress
  # client-specified depth is the reason this is GraphQL at all
  knowledgeGraph(pathId: ID, taxonomy: [String!], depth: Int = 2): KnowledgeGraph!
  concept(id: ID!): Concept                     # includes masteryHistory via evolvesFrom
  profile: LearnerProfile!
  assessments(pathId: ID!): [Assessment!]!
  statsOverview(pathId: ID): StatsOverview!
  transferCandidates(taxonomy: [String!]!): [TransferCandidate!]!
}

type Mutation {
  generatePath(input: GeneratePathInput!): Path!
  recordAnswer(input: RecordAnswerInput!): AnswerResult!
  startExam(pathId: ID!, moduleIndex: Int!): Exam!
  answerExamItem(examId: ID!, input: ExamAnswerInput!): Boolean!
  submitExam(examId: ID!): ExamReport!
  retakeExam(examId: ID!): Exam!
  overrideExamGate(examId: ID!): ExamReport!
  updatePreferences(input: PreferencesInput!): Preferences!
}

type Subscription {
  examGeneration(examId: ID!): ExamGenerationProgress!   # 2-3 LLM calls, streamed
  moduleHydration(pathId: ID!, moduleIndex: Int!): HydrationProgress!
  exercisePrefetch(topicKey: String!): PrefetchState!
  masteryUpdated: MasteryDelta!                          # live knowledge map
}
```

Guardrails, because a public GraphQL endpoint is a denial-of-service surface by default: query depth limit, complexity scoring, persisted queries in production, and `DataLoader` batching on every list field that resolves per-node (concepts, edges, snapshots). The N+1 problem on `knowledgeGraph` is not hypothetical.

### 11.3 REST retained

```
GET    /api/tts                        audio/mpeg binary
POST   /api/speak/tts                  audio binary
POST   /api/speak/transcribe           multipart upload
POST   /api/speak/realtime-token       short-lived credential mint
GET    /api/auth/google                OAuth redirect
GET    /api/auth/google/callback       OAuth redirect
GET    /api/health
```

Binary responses and multipart uploads do not belong in GraphQL, and the OAuth endpoints are browser redirects. These stay as they are.

### 11.4 Realtime transport

Bun ships native WebSocket and Elysia has first-class support, so `graphql-ws` over Elysia covers every subscription above with no additional infrastructure.

GCP Pub/Sub becomes relevant only for cross-instance fanout once the API runs on more than one node, since in-process subscriptions do not cross process boundaries. That is a scale-out concern, not a v1 one. The design note that matters now: publish subscription events through a thin `EventBus` interface with an in-process implementation, so swapping in Pub/Sub later is one adapter rather than a rewrite.

### 11.5 Migration

REST endpoints stay live alongside GraphQL through Phase 4 and are removed only once the client has moved. No flag day.

---

## 12. Frontend

New:

```
src/lib/taxonomy.ts                    tree, resolution, transfer distance
src/lib/domains.ts                     client mirror of spec resolution
src/lib/expr.ts                        safe expression parser (shared with grading)
src/lib/graphql/                       codegen output + typed client
src/components/blocks/ContentBlocks.tsx      dispatcher, legacy fallback
src/components/blocks/{Latex,Plot,Diagram,SourceExcerpt,CodeBlock,DataTable}.tsx
src/components/answers/                one component per grading mode
src/components/answers/MathInput.tsx   LaTeX field, command palette, live preview
src/components/ConfidenceSelector.tsx
src/components/ScopingQuiz.tsx         over-broad subject narrowing
src/components/TransferReview.tsx      reviewable diff before path generation
src/components/ExamGate.tsx
src/components/ExamRunner.tsx
src/components/ExamReport.tsx
src/components/RemediationFlow.tsx
src/components/KnowledgeMap.tsx        force-directed concept graph, in-house SVG
src/pages/exam.astro
src/pages/map.astro
```

Changed:

- **LearnPage.tsx** is 1344 lines and the answer-rendering conditional (1043 to 1188) is at its limit. Extracting `answers/` is a prerequisite for adding six more types, not optional cleanup. Also: exam routing, confidence capture, blocks rendering.
- **GoalsPage.tsx**: `language` becomes `subject`, plus a taxonomy breadcrumb picker prefilled by the classifier, the scoping quiz, and the transfer review.
- **PathRoadmap.tsx**: exam markers at module boundaries, mastery tint per topic, skipped and compressed module states from transfer.
- **Sidebar.tsx**: add the knowledge map; gate Speak and Vocabulary on the `language` branch.
- **CalibrationFlow.tsx**: subject-agnostic copy, bank-driven item selection.
- **StatsOverview / DashboardContent**: assessment history, calibration curve.
- **SettingsPage.tsx**: confidence cadence.

i18n: roughly 140 new keys across `en.json` and `es.json`, which hold 292 each today.

---

## 13. Dependencies

| Package | Why |
|---|---|
| `katex` | LaTeX rendering, self-hosted with fonts |
| `graphql`, `graphql-yoga`, `graphql-ws` | GraphQL server and subscription transport |
| `@graphql-codegen/*` (dev) | Typed client operations, replacing Elysia's inference |
| `dataloader` | Batching for graph resolvers, non-optional at any real depth |

Source providers are HTTP APIs behind the `SourceProvider` interface, no SDKs. Everything in §4.2, §4.3, §4.6, and the force-directed map is in-house.

---

## 14. Migration

**No destructive migration, no downtime, and the app keeps working if the script never runs.**

| Data | Approach |
|---|---|
| `paths` | `$set { subject: language, taxonomy: ["language", <lang>], taxonomyLeaf: <lang> }`. Read-time fallback `subject ?? language` everywhere, so the script is an optimization rather than a prerequisite. |
| `exercises` | `topicKey` becomes `${taxonomyLeaf}:${topic}:${level}`. For language paths `taxonomyLeaf === language.toLowerCase()`, so **every existing key resolves unchanged** and the shared bank is not invalidated. |
| Exercise docs without `blocks` | `ContentBlocks` falls back to `question` / `sentence` / `sourceText`. No backfill. |
| `attempts` | New fields optional with defaults. The stats aggregation already tolerates missing fields. |
| `progress` | `pendingExam` optional; absent means none pending. |
| `preferences.nativeLanguage` | Field kept, display label becomes "explanation language". It already serves that role for every domain. |
| In-flight paths | Students mid-path get exams from their next module boundary onward. Earlier modules are never examined. |
| REST clients | REST stays live alongside GraphQL until the client has migrated. |

---

## 15. Phasing

Each phase ships independently and leaves the app fully working.

**Phase 1: taxonomy spine.** ~1100 lines. `taxonomy_nodes` collection plus seed JSON, classifier, spec resolution by inheritance, scoping quiz, prompt refactor behind the registry, `topicKey` change, migration script and read-time fallbacks. No new UI beyond the breadcrumb and quiz. Acceptance: a language path produces byte-identical prompts to today.

**Phase 2: blocks, math input, grading ladder.** ~1600 lines. `ContentBlock` types and six renderers, `expr.ts`, `MathInput` with command palette, the `answers/` extraction out of LearnPage, numeric and symbolic grading, the semantic fallback and its cache. Acceptance: a calculus path renders formulas and plots and accepts LaTeX answers; "das Auto" grades correct against "Auto".

**Phase 3: sources.** ~700 lines. `SourceProvider` interface, Perseus and Wikisource and Crossref implementations, the search fallback, the verification pipeline, the shared `sources` cache. Acceptance: an ancient history path renders a real, link-verifiable Thucydides passage, and a fabricated citation never reaches the student.

**Phase 4: the section exam.** ~1500 lines. Blueprint with scaled length, runner, server-authoritative grading, the report, remediation, the soft gate, `NextSectionPlan` wired into `buildModuleTopicsPrompt`. Acceptance: failing an exam visibly changes the topics generated for the next module.

**Phase 5: MindVault layer and transfer.** ~1400 lines. Knowledge nodes and edges shared across paths, mastery snapshots with `evolvesFrom`, decay-on-observation, the learner profile, path transfer with its review diff, the knowledge map, the second grader. Acceptance: starting Microeconomics after Macroeconomics skips what is genuinely already known and nothing else.

**Phase 6: GraphQL and realtime.** ~900 lines. Schema, resolvers with DataLoader, subscriptions over Bun WebSocket, the `EventBus` abstraction, codegen, client migration, REST deprecation.

**Phase 7: calibration bank and cohorts.** ~800 lines. `calibration_items` with IRT statistics, information-based selection, exposure control, profile clustering as a batch job, cold-start generation fallback.

**Phase 8: polish.** i18n, spoken exam items for language paths, Speak and Vocabulary gating, dashboard, confidence surfaces.

Dependencies: 1 gates everything. 2 gates 4. 5 wants 4 for its richest signal but can start after 1. 7 wants 5 for the clustering key. 6 and 3 are independent and can run in parallel with anything.

---

## 16. Risks

**Exam latency.** Two or three LLM calls at a module boundary is a visible wait. Mitigated by speculative generation at the last topic, the `examGeneration` subscription for real progress rather than a spinner, and blueprint caching in the shared bank.

**Semantic grading in the hot path.** Step 3 adds latency to exactly the moment the student is waiting on. Mitigated by firing only on deterministic miss, aggressive caching, flash model with a small token budget, and an optimistic client that shows the deterministic result and corrects upward if the fallback overturns it.

**Semantic grader too lenient.** A grader that accepts anything destroys the signal that everything else in the system depends on. Mitigated by the one-directional constraint (it can only overturn wrong to right), the `semanticOverride` flag making the rate measurable, and an alert if the override rate crosses a threshold.

**Source retrieval failure or licensing.** Providers go down, rate-limit, and carry varying licenses. Mitigated by the provider chain with fallbacks, the shared cache, storing `license` per source, and degrading to a text-only exercise rather than blocking generation.

**GraphQL as a DoS surface.** Depth limits, complexity scoring, persisted queries in production, DataLoader everywhere. Not optional.

**Taxonomy drift.** LLM-generated nodes will duplicate and misplace. Mitigated by alias matching on creation, a similarity check against existing siblings, `origin: "generated"` marking, and a periodic merge pass. The user-visible breadcrumb also makes misplacement correctable by the person best positioned to notice.

**Concept duplication.** "Newton's Second Law" and "Second Law of Motion" fragment the graph, and sharing nodes across paths makes this worse rather than better. Mitigated by slug normalization, string-similarity merge on write, and a periodic merge pass per taxonomy subtree.

**Transfer that skips too much.** Skipping a module the student does not actually know is worse than making them repeat one they do. Mitigated by decay-adjusted mastery gating transfer, a conservative threshold, and the review diff that requires explicit acceptance.

**Calibration item exposure.** A bank served greedily leaks its most informative items. Mitigated by top-k randomization and retirement thresholds (§5.3).

**LearnPage complexity.** At 1344 lines it is the riskiest file in the repo. The `answers/` extraction in Phase 2 is a prerequisite, not a cleanup.

---

## 17. Resolved from v0.1

| # | Question | Resolution |
|---|---|---|
| 1 | Exam length | Proportional to topic count with a difficulty modifier, clamped 6 to 16 (§6.2). |
| 2 | Pass threshold | 70 minimum, raised for prerequisite-heavy modules by graph out-degree (§6.3). |
| 3 | Confidence cadence | Configurable interval in Settings, default every 5th practice item, always in exams (§7). |
| 4 | Cross-path knowledge graph | Yes. Nodes are shared, `taughtIn` is an array, mastery belongs to the concept (§8.1). This is what makes path transfer work (§3.4). |
| 5 | Language-specific exam format | Yes. `spoken_response` and `listening_comprehension` items through the existing xAI pipeline, Phase 8 (§6.8). |

## 18. Still open

1. **Cluster count and recompute cadence** for calibration cohorts (§5.3). Needs real data; start with a small k and a weekly batch.
2. **IRT model.** Two-parameter logistic is the obvious start. Three-parameter adds guessing, which matters for multiple choice, but needs far more responses to fit stably.
3. **Transfer distance thresholds** (§3.4). How far up the tree transfer stays useful is an empirical question. Start conservative.
4. **Source licensing for redistribution.** Caching retrieved text in a shared collection is fine for public-domain providers, less clear for others. Needs a per-provider policy before Phase 3 ships.
5. **Whether taxonomy should be global or per-user.** Currently global, which lets popularity drive cohorts, but it means one user's odd subject creates a node everyone sees. Probably fine; worth revisiting if the tree gets noisy.

---

*Written 30 July 2026 against commit `cf8235d`. Version 0.2.*

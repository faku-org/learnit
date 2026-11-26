// The command palette's catalog.
//
// `latex` is the template inserted into the field. Every `{}` in it is an
// argument slot: insertion drops the caret into the first one and Tab walks to
// the next, so a student types the structure once and fills it in place rather
// than counting braces.

export type CatalogGroup =
  | "core"
  | "algebra"
  | "calculus"
  | "linear_algebra"
  | "probability"
  | "logic"
  | "greek"
  | "relations";

export type MathCommand = {
  id: string;
  /** Shown in the palette and matched against the query. */
  label: string;
  /** Inserted verbatim. `{}` marks an argument slot. */
  latex: string;
  /** Rendered beside the label so the shape is recognizable before insertion. */
  preview: string;
  keywords: string[];
  groups: CatalogGroup[];
  /** Displayed shortcut, when one exists. */
  shortcut?: string;
};

export const MATH_COMMANDS: MathCommand[] = [
  // core
  { id: "frac", label: "fraction", latex: "\\frac{}{}", preview: "\\frac{a}{b}",
    keywords: ["divide", "over", "quotient"], groups: ["core", "algebra"], shortcut: "Ctrl+F" },
  { id: "sqrt", label: "square root", latex: "\\sqrt{}", preview: "\\sqrt{x}",
    keywords: ["radical", "root"], groups: ["core", "algebra"], shortcut: "Ctrl+R" },
  { id: "nthroot", label: "nth root", latex: "\\sqrt[]{}", preview: "\\sqrt[n]{x}",
    keywords: ["radical", "cube"], groups: ["algebra"] },
  { id: "power", label: "power", latex: "^{}", preview: "x^{n}",
    keywords: ["exponent", "superscript"], groups: ["core", "algebra"], shortcut: "^" },
  { id: "subscript", label: "subscript", latex: "_{}", preview: "x_{i}",
    keywords: ["index", "sub"], groups: ["core"], shortcut: "_" },
  { id: "cdot", label: "multiply", latex: "\\cdot ", preview: "a \\cdot b",
    keywords: ["times", "product", "dot"], groups: ["core"], shortcut: "Ctrl+8" },
  { id: "times", label: "cross product", latex: "\\times ", preview: "a \\times b",
    keywords: ["multiply", "vector"], groups: ["core", "linear_algebra"] },
  { id: "pm", label: "plus or minus", latex: "\\pm ", preview: "\\pm",
    keywords: ["plusminus"], groups: ["core", "algebra"] },
  { id: "abs", label: "absolute value", latex: "\\left|\\right|", preview: "|x|",
    keywords: ["modulus", "magnitude"], groups: ["core"] },

  // calculus
  { id: "int", label: "integral", latex: "\\int_{}^{} {} \\, d", preview: "\\int_a^b f(x)\\,dx",
    keywords: ["integrate", "antiderivative", "area"], groups: ["calculus"] },
  { id: "intindef", label: "indefinite integral", latex: "\\int {} \\, d", preview: "\\int f(x)\\,dx",
    keywords: ["integrate", "antiderivative"], groups: ["calculus"] },
  { id: "lim", label: "limit", latex: "\\lim_{ \\to }", preview: "\\lim_{x \\to 0}",
    keywords: ["approaches", "tends"], groups: ["calculus"] },
  { id: "deriv", label: "derivative", latex: "\\frac{d}{d}", preview: "\\frac{dy}{dx}",
    keywords: ["differentiate", "rate"], groups: ["calculus"] },
  { id: "partial", label: "partial derivative", latex: "\\frac{\\partial }{\\partial }",
    preview: "\\frac{\\partial f}{\\partial x}",
    keywords: ["differentiate", "gradient"], groups: ["calculus"] },
  { id: "sum", label: "sum", latex: "\\sum_{}^{} ", preview: "\\sum_{n=1}^{\\infty}",
    keywords: ["series", "sigma", "total"], groups: ["calculus", "probability"] },
  { id: "prod", label: "product", latex: "\\prod_{}^{} ", preview: "\\prod_{i=1}^{n}",
    keywords: ["multiply", "pi"], groups: ["calculus"] },
  { id: "infty", label: "infinity", latex: "\\infty ", preview: "\\infty",
    keywords: ["unbounded"], groups: ["calculus"] },
  { id: "nabla", label: "gradient", latex: "\\nabla ", preview: "\\nabla f",
    keywords: ["del", "divergence", "curl"], groups: ["calculus", "linear_algebra"] },

  // linear algebra
  { id: "matrix", label: "matrix", latex: "\\begin{pmatrix} & \\\\ & \\end{pmatrix}",
    preview: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
    keywords: ["array", "grid"], groups: ["linear_algebra"] },
  { id: "det", label: "determinant", latex: "\\det{}", preview: "\\det(A)",
    keywords: ["matrix"], groups: ["linear_algebra"] },
  { id: "vec", label: "vector", latex: "\\vec{}", preview: "\\vec{v}",
    keywords: ["arrow"], groups: ["linear_algebra"] },
  { id: "hat", label: "unit vector", latex: "\\hat{}", preview: "\\hat{n}",
    keywords: ["normal", "basis"], groups: ["linear_algebra"] },
  { id: "transpose", label: "transpose", latex: "^{T}", preview: "A^{T}",
    keywords: ["matrix"], groups: ["linear_algebra"] },
  { id: "norm", label: "norm", latex: "\\left\\| \\right\\|", preview: "\\|v\\|",
    keywords: ["length", "magnitude"], groups: ["linear_algebra"] },

  // probability and statistics
  { id: "binom", label: "binomial coefficient", latex: "\\binom{}{}", preview: "\\binom{n}{k}",
    keywords: ["choose", "combination"], groups: ["probability"] },
  { id: "bar", label: "mean", latex: "\\bar{}", preview: "\\bar{x}",
    keywords: ["average"], groups: ["probability"] },
  { id: "prob", label: "probability", latex: "P\\left(\\right)", preview: "P(A)",
    keywords: ["chance", "likelihood"], groups: ["probability"] },
  { id: "expect", label: "expectation", latex: "E\\left[\\right]", preview: "E[X]",
    keywords: ["mean", "expected value"], groups: ["probability"] },

  // relations
  { id: "leq", label: "less or equal", latex: "\\leq ", preview: "\\leq", keywords: ["at most"], groups: ["relations"] },
  { id: "geq", label: "greater or equal", latex: "\\geq ", preview: "\\geq", keywords: ["at least"], groups: ["relations"] },
  { id: "neq", label: "not equal", latex: "\\neq ", preview: "\\neq", keywords: ["different"], groups: ["relations"] },
  { id: "approx", label: "approximately", latex: "\\approx ", preview: "\\approx", keywords: ["about"], groups: ["relations"] },
  { id: "propto", label: "proportional to", latex: "\\propto ", preview: "\\propto", keywords: ["scales"], groups: ["relations"] },
  { id: "to", label: "arrow", latex: "\\to ", preview: "\\to", keywords: ["implies", "maps"], groups: ["relations", "logic"] },

  // logic and sets
  { id: "forall", label: "for all", latex: "\\forall ", preview: "\\forall", keywords: ["every"], groups: ["logic"] },
  { id: "exists", label: "there exists", latex: "\\exists ", preview: "\\exists", keywords: ["some"], groups: ["logic"] },
  { id: "in", label: "element of", latex: "\\in ", preview: "\\in", keywords: ["member", "set"], groups: ["logic"] },
  { id: "subset", label: "subset", latex: "\\subseteq ", preview: "\\subseteq", keywords: ["contained"], groups: ["logic"] },
  { id: "cup", label: "union", latex: "\\cup ", preview: "\\cup", keywords: ["or", "set"], groups: ["logic"] },
  { id: "cap", label: "intersection", latex: "\\cap ", preview: "\\cap", keywords: ["and", "set"], groups: ["logic"] },
  { id: "implies", label: "implies", latex: "\\Rightarrow ", preview: "\\Rightarrow", keywords: ["therefore"], groups: ["logic"] },

  // greek
  { id: "alpha", label: "alpha", latex: "\\alpha ", preview: "\\alpha", keywords: [], groups: ["greek"] },
  { id: "beta", label: "beta", latex: "\\beta ", preview: "\\beta", keywords: [], groups: ["greek"] },
  { id: "gamma", label: "gamma", latex: "\\gamma ", preview: "\\gamma", keywords: [], groups: ["greek"] },
  { id: "delta", label: "delta", latex: "\\delta ", preview: "\\delta", keywords: ["change"], groups: ["greek"] },
  { id: "Delta", label: "capital delta", latex: "\\Delta ", preview: "\\Delta", keywords: ["change", "difference"], groups: ["greek"] },
  { id: "epsilon", label: "epsilon", latex: "\\varepsilon ", preview: "\\varepsilon", keywords: ["small"], groups: ["greek"] },
  { id: "theta", label: "theta", latex: "\\theta ", preview: "\\theta", keywords: ["angle"], groups: ["greek"] },
  { id: "lambda", label: "lambda", latex: "\\lambda ", preview: "\\lambda", keywords: ["eigenvalue", "wavelength"], groups: ["greek", "linear_algebra"] },
  { id: "mu", label: "mu", latex: "\\mu ", preview: "\\mu", keywords: ["mean", "micro"], groups: ["greek", "probability"] },
  { id: "pi", label: "pi", latex: "\\pi ", preview: "\\pi", keywords: [], groups: ["greek"] },
  { id: "rho", label: "rho", latex: "\\rho ", preview: "\\rho", keywords: ["density", "correlation"], groups: ["greek"] },
  { id: "sigma", label: "sigma", latex: "\\sigma ", preview: "\\sigma", keywords: ["deviation", "stress"], groups: ["greek", "probability"] },
  { id: "phi", label: "phi", latex: "\\phi ", preview: "\\phi", keywords: ["angle"], groups: ["greek"] },
  { id: "omega", label: "omega", latex: "\\omega ", preview: "\\omega", keywords: ["frequency", "angular"], groups: ["greek"] },

  // functions
  { id: "sin", label: "sine", latex: "\\sin", preview: "\\sin", keywords: ["trig"], groups: ["algebra", "calculus"] },
  { id: "cos", label: "cosine", latex: "\\cos", preview: "\\cos", keywords: ["trig"], groups: ["algebra", "calculus"] },
  { id: "tan", label: "tangent", latex: "\\tan", preview: "\\tan", keywords: ["trig"], groups: ["algebra", "calculus"] },
  { id: "ln", label: "natural log", latex: "\\ln", preview: "\\ln", keywords: ["logarithm"], groups: ["algebra", "calculus"] },
  { id: "log", label: "logarithm", latex: "\\log_{}", preview: "\\log_{10}", keywords: [], groups: ["algebra"] },
  { id: "exp", label: "exponential", latex: "e^{}", preview: "e^{x}", keywords: ["euler"], groups: ["algebra", "calculus"] },
];

/**
 * Which groups a path should see first. A calculus path surfaces integrals and
 * limits before Greek letters; a linear algebra path surfaces matrices. The
 * whole catalog stays searchable either way — this only sets the order.
 */
const TAXONOMY_GROUPS: Record<string, CatalogGroup[]> = {
  calculus: ["calculus", "algebra"],
  real_analysis: ["calculus", "logic"],
  differential_equations: ["calculus", "algebra"],
  linear_algebra: ["linear_algebra", "algebra"],
  probability: ["probability", "algebra"],
  statistics: ["probability", "algebra"],
  econometrics: ["probability", "linear_algebra"],
  logic: ["logic", "relations"],
  number_theory: ["algebra", "logic"],
  discrete_math: ["logic", "algebra"],
  geometry: ["greek", "relations"],
  physics: ["calculus", "greek", "linear_algebra"],
  classical_mechanics: ["calculus", "linear_algebra", "greek"],
  electromagnetism: ["calculus", "linear_algebra", "greek"],
  quantum_mechanics: ["linear_algebra", "calculus", "greek"],
  thermodynamics: ["calculus", "greek"],
  chemistry: ["algebra", "greek"],
  economics: ["calculus", "algebra"],
  macroeconomics: ["calculus", "algebra"],
  microeconomics: ["calculus", "algebra"],
  ai_ml: ["linear_algebra", "probability", "calculus"],
  cryptography: ["algebra", "logic"],
  algorithms: ["logic", "algebra"],
};

function preferredGroups(taxonomy: string[]): CatalogGroup[] {
  const out: CatalogGroup[] = [];
  // Leaf-first, so the most specific node's preference wins the ordering.
  for (const id of [...taxonomy].reverse()) {
    for (const group of TAXONOMY_GROUPS[id] ?? []) {
      if (!out.includes(group)) out.push(group);
    }
  }
  return out;
}

/** Subsequence match, scored so a prefix beats a scattered hit. */
function fuzzyScore(query: string, target: string): number {
  if (query === "") return 0;
  if (target.startsWith(query)) return 100 - target.length;
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let i = 0; i < target.length && qi < query.length; i++) {
    if (target[i] === query[qi]) {
      streak++;
      score += 1 + streak;
      qi++;
    } else {
      streak = 0;
    }
  }
  return qi === query.length ? score : -1;
}

/**
 * The catalog, filtered by the query and ordered by how relevant the group is to
 * the path being studied. An empty query returns the path's own commands first,
 * which is what makes the palette useful before the student knows what to type.
 */
export function searchCommands(query: string, taxonomy: string[], limit = 8): MathCommand[] {
  const groups = preferredGroups(taxonomy);
  const rank = (cmd: MathCommand): number => {
    const best = cmd.groups.reduce((acc, g) => {
      const at = groups.indexOf(g);
      return at === -1 ? acc : Math.min(acc, at);
    }, Number.POSITIVE_INFINITY);
    return best === Number.POSITIVE_INFINITY ? groups.length + (cmd.groups.includes("core") ? 0 : 1) : best;
  };

  const q = query.toLowerCase().trim();
  if (q === "") {
    return [...MATH_COMMANDS].sort((a, b) => rank(a) - rank(b)).slice(0, limit);
  }

  return MATH_COMMANDS
    .map((cmd) => {
      const targets = [cmd.id.toLowerCase(), cmd.label.toLowerCase(), ...cmd.keywords];
      const score = Math.max(...targets.map((t) => fuzzyScore(q, t)));
      return { cmd, score };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || rank(a.cmd) - rank(b.cmd))
    .slice(0, limit)
    .map((entry) => entry.cmd);
}

// A safe arithmetic expression parser.
//
// Two callers depend on this and both make the same demand: an expression that
// arrives from an LLM, is stored in a bank shared across users, and is later
// evaluated on someone else's machine must never reach `eval` or `new Function`.
// So expressions are parsed into a tree of known node kinds and interpreted.
// Anything unparseable yields null and the caller degrades rather than guessing.
//
//   - the plot renderer evaluates `series[].expr` across a domain
//   - the symbolic grader compares two expressions by sampling both
//
// Deliberately dependency-free so it can be imported from the API and bundled
// into the client without either side pulling the other's toolchain in.

export type ExprNode =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "neg"; a: ExprNode }
  | { k: "bin"; op: BinaryOp; a: ExprNode; b: ExprNode }
  | { k: "fn"; name: FunctionName; a: ExprNode };

export type BinaryOp = "+" | "-" | "*" | "/" | "^";

/** The whole function whitelist. An identifier outside it fails to parse. */
export const FUNCTIONS = [
  "sin", "cos", "tan",
  "asin", "acos", "atan",
  "exp", "ln", "log",
  "sqrt", "abs", "floor", "ceil",
] as const;

export type FunctionName = (typeof FUNCTIONS)[number];

const FUNCTION_SET = new Set<string>(FUNCTIONS);

/** Recognized without being declared as variables. */
const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

// ── Tokenizer ─────────────────────────────────────────────────────────────────

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: BinaryOp }
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "comma" };

const MAX_LENGTH = 500;

function tokenize(src: string): Token[] | null {
  if (src.length > MAX_LENGTH) return null;
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < src.length && ((src[j] >= "0" && src[j] <= "9") || src[j] === ".")) j++;
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) return null;
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if (c === "." && i + 1 < src.length && src[i + 1] >= "0" && src[i + 1] <= "9") {
      let j = i + 1;
      while (j < src.length && src[j] >= "0" && src[j] <= "9") j++;
      out.push({ t: "num", v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i;
      while (j < src.length && isIdentPart(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "^") {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "(") { out.push({ t: "lparen" }); i++; continue; }
    if (c === ")") { out.push({ t: "rparen" }); i++; continue; }
    if (c === ",") { out.push({ t: "comma" }); i++; continue; }
    // Anything else is not part of the grammar, which is the point.
    return null;
  }
  return out;
}

function isIdentStart(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
}

function isIdentPart(c: string): boolean {
  return isIdentStart(c) || (c >= "0" && c <= "9");
}

// ── Shunting-yard ─────────────────────────────────────────────────────────────

type StackEntry =
  | { s: "op"; v: BinaryOp }
  | { s: "neg" }
  | { s: "fn"; v: FunctionName }
  | { s: "lparen" };

const PRECEDENCE: Record<BinaryOp, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 4 };
const NEG_PRECEDENCE = 3;
const RIGHT_ASSOCIATIVE = new Set<BinaryOp>(["^"]);

/**
 * Parse an expression into a tree, or null if it is not expressible in this
 * grammar. Callers treat null as "render nothing" rather than as an error.
 */
export function parseExpr(src: string): ExprNode | null {
  const tokens = tokenize(src);
  if (!tokens || tokens.length === 0) return null;

  const output: ExprNode[] = [];
  const stack: StackEntry[] = [];
  // Distinguishes the two meanings of `-`: prefix at the start of an operand,
  // infix once an operand has been read.
  let expectOperand = true;

  const applyTop = (): boolean => {
    const top = stack.pop();
    if (!top) return false;
    if (top.s === "lparen") return false;
    if (top.s === "neg") {
      const a = output.pop();
      if (!a) return false;
      output.push({ k: "neg", a });
      return true;
    }
    if (top.s === "fn") {
      const a = output.pop();
      if (!a) return false;
      output.push({ k: "fn", name: top.v, a });
      return true;
    }
    const b = output.pop();
    const a = output.pop();
    if (!a || !b) return false;
    output.push({ k: "bin", op: top.v, a, b });
    return true;
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok.t === "num") {
      if (!expectOperand) return null;
      output.push({ k: "num", v: tok.v });
      expectOperand = false;
      continue;
    }

    if (tok.t === "id") {
      if (!expectOperand) return null;
      const name = tok.v.toLowerCase();
      if (FUNCTION_SET.has(name)) {
        if (tokens[i + 1]?.t !== "lparen") return null;
        stack.push({ s: "fn", v: name as FunctionName });
        continue; // still expecting the operand inside the call
      }
      if (name in CONSTANTS) output.push({ k: "num", v: CONSTANTS[name] });
      else output.push({ k: "var", name });
      expectOperand = false;
      continue;
    }

    if (tok.t === "op") {
      if (expectOperand) {
        // Prefix position: `-x` is negation, `+x` is a no-op, the rest is a
        // missing left operand.
        if (tok.v === "-") { stack.push({ s: "neg" }); continue; }
        if (tok.v === "+") continue;
        return null;
      }
      const prec = PRECEDENCE[tok.v];
      const rightAssoc = RIGHT_ASSOCIATIVE.has(tok.v);
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.s === "lparen") break;
        const topPrec = top.s === "op" ? PRECEDENCE[top.v] : top.s === "neg" ? NEG_PRECEDENCE : 99;
        if (topPrec > prec || (topPrec === prec && !rightAssoc)) {
          if (!applyTop()) return null;
        } else break;
      }
      stack.push({ s: "op", v: tok.v });
      expectOperand = true;
      continue;
    }

    if (tok.t === "lparen") {
      if (!expectOperand) return null;
      stack.push({ s: "lparen" });
      expectOperand = true;
      continue;
    }

    if (tok.t === "rparen") {
      if (expectOperand) return null;
      let closed = false;
      while (stack.length > 0) {
        if (stack[stack.length - 1].s === "lparen") { stack.pop(); closed = true; break; }
        if (!applyTop()) return null;
      }
      if (!closed) return null;
      // A call's argument list closes here, so fold the function itself in.
      if (stack[stack.length - 1]?.s === "fn" && !applyTop()) return null;
      expectOperand = false;
      continue;
    }

    // Multi-argument calls are not in the grammar; nothing needs them.
    return null;
  }

  if (expectOperand) return null;
  while (stack.length > 0) {
    if (stack[stack.length - 1].s === "lparen") return null;
    if (!applyTop()) return null;
  }
  return output.length === 1 ? output[0] : null;
}

// ── Evaluation ────────────────────────────────────────────────────────────────

/**
 * Evaluate at a point. An unbound variable, a domain error, or an overflow all
 * yield NaN, which every caller already has to handle for a plot gap.
 */
export function evalExpr(node: ExprNode, vars: Record<string, number>): number {
  switch (node.k) {
    case "num":
      return node.v;
    case "var":
      return vars[node.name] ?? Number.NaN;
    case "neg":
      return -evalExpr(node.a, vars);
    case "bin": {
      const a = evalExpr(node.a, vars);
      const b = evalExpr(node.b, vars);
      switch (node.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return b === 0 ? Number.NaN : a / b;
        case "^": return Math.pow(a, b);
      }
      break;
    }
    case "fn":
      return applyFunction(node.name, evalExpr(node.a, vars));
  }
  return Number.NaN;
}

function applyFunction(name: FunctionName, x: number): number {
  switch (name) {
    case "sin": return Math.sin(x);
    case "cos": return Math.cos(x);
    case "tan": return Math.tan(x);
    case "asin": return Math.asin(x);
    case "acos": return Math.acos(x);
    case "atan": return Math.atan(x);
    case "exp": return Math.exp(x);
    case "ln": return x > 0 ? Math.log(x) : Number.NaN;
    case "log": return x > 0 ? Math.log10(x) : Number.NaN;
    case "sqrt": return x >= 0 ? Math.sqrt(x) : Number.NaN;
    case "abs": return Math.abs(x);
    case "floor": return Math.floor(x);
    case "ceil": return Math.ceil(x);
  }
}

/** Parse once and reuse across a sampling loop. Null when unparseable. */
export function compileExpr(src: string): ((vars: Record<string, number>) => number) | null {
  const tree = parseExpr(src);
  if (!tree) return null;
  return (vars) => evalExpr(tree, vars);
}

/** Every free variable in an expression, so a sampler knows what to bind. */
export function freeVariables(node: ExprNode): string[] {
  const found = new Set<string>();
  const walk = (n: ExprNode): void => {
    switch (n.k) {
      case "var": found.add(n.name); break;
      case "neg": walk(n.a); break;
      case "fn": walk(n.a); break;
      case "bin": walk(n.a); walk(n.b); break;
      case "num": break;
    }
  };
  walk(node);
  return [...found];
}

import { describe, expect, test } from "bun:test";
import { compileExpr, evalExpr, freeVariables, parseExpr } from "../../api/src/expr";

describe("parseExpr", () => {
  test("parses a plain number", () => {
    expect(parseExpr("42")).toEqual({ k: "num", v: 42 });
  });

  test("parses a variable", () => {
    expect(parseExpr("x")).toEqual({ k: "var", name: "x" });
  });

  test("applies operator precedence to * over +", () => {
    expect(parseExpr("1 + 2 * 3")).toEqual({
      k: "bin", op: "+",
      a: { k: "num", v: 1 },
      b: { k: "bin", op: "*", a: { k: "num", v: 2 }, b: { k: "num", v: 3 } },
    });
  });

  test("makes ^ right-associative", () => {
    expect(evalExpr(parseExpr("2 ^ 3 ^ 2")!, {})).toBe(512);
  });

  test("treats prefix minus as negation", () => {
    expect(evalExpr(parseExpr("-5 + 3")!, {})).toBe(-2);
  });

  test("treats prefix plus as a no-op", () => {
    expect(evalExpr(parseExpr("+5")!, {})).toBe(5);
  });

  test("parses functions with a single argument", () => {
    expect(evalExpr(parseExpr("sqrt(16)")!, {})).toBe(4);
    expect(evalExpr(parseExpr("ln(1)")!, {})).toBe(0);
  });

  test("parses constants pi and e", () => {
    expect(evalExpr(parseExpr("pi")!, {})).toBe(Math.PI);
    expect(evalExpr(parseExpr("e")!, {})).toBe(Math.E);
  });

  test("parses a leading-dot decimal", () => {
    expect(evalExpr(parseExpr(".5 + .25")!, {})).toBe(0.75);
  });

  test("returns null for an empty string", () => {
    expect(parseExpr("")).toBeNull();
    expect(parseExpr("   ")).toBeNull();
  });

  test("returns null for unbalanced parentheses", () => {
    expect(parseExpr("(1 + 2")).toBeNull();
    expect(parseExpr("1 + 2)")).toBeNull();
  });

  test("returns null for a trailing operator", () => {
    expect(parseExpr("1 +")).toBeNull();
  });

  test("returns null for a leading infix operator", () => {
    expect(parseExpr("* 3")).toBeNull();
    expect(parseExpr("/ 3")).toBeNull();
  });

  test("returns null for an unknown token", () => {
    expect(parseExpr("1 + $")).toBeNull();
    expect(parseExpr("1; DROP TABLE")).toBeNull();
  });

  test("returns null for a function call missing its parens", () => {
    expect(parseExpr("sin x")).toBeNull();
  });

  test("returns null for an unknown function name", () => {
    expect(parseExpr("evil(x)")).toBeNull();
  });

  test("returns null for multi-argument calls", () => {
    expect(parseExpr("max(1, 2)")).toBeNull();
  });

  test("returns null past the length limit", () => {
    expect(parseExpr("1 + ".repeat(200))).toBeNull();
  });

  test("returns null for a number that overflows to Infinity", () => {
    expect(parseExpr("1".repeat(400))).toBeNull();
  });

  test("returns null when a number follows a number", () => {
    expect(parseExpr("1 2")).toBeNull();
  });
});

describe("evalExpr", () => {
  test("evaluates a whole expression at a point", () => {
    const tree = parseExpr("x^2 - 3*x + 2")!;
    expect(evalExpr(tree, { x: 1 })).toBe(0);
    expect(evalExpr(tree, { x: 2 })).toBe(0);
    expect(evalExpr(tree, { x: 3 })).toBe(2);
  });

  test("returns NaN for an unbound variable", () => {
    expect(evalExpr(parseExpr("y + 1")!, {})).toBeNaN();
  });

  test("returns NaN on division by zero", () => {
    expect(evalExpr(parseExpr("1 / 0")!, {})).toBeNaN();
  });

  test("returns NaN on a domain error", () => {
    expect(evalExpr(parseExpr("sqrt(-1)")!, {})).toBeNaN();
    expect(evalExpr(parseExpr("ln(0)")!, {})).toBeNaN();
    expect(evalExpr(parseExpr("log(-5)")!, {})).toBeNaN();
  });
});

describe("compileExpr", () => {
  test("returns a callable for a valid expression", () => {
    const f = compileExpr("x * 2")!;
    expect(f({ x: 21 })).toBe(42);
  });

  test("returns null for an unparseable expression", () => {
    expect(compileExpr("fetch('/steal')")).toBeNull();
  });
});

describe("freeVariables", () => {
  test("collects distinct variable names in order", () => {
    const tree = parseExpr("a + b * a - c")!;
    expect(freeVariables(tree)).toEqual(["a", "b", "c"]);
  });

  test("returns an empty list for a constant expression", () => {
    expect(freeVariables(parseExpr("2 + 3")!)).toEqual([]);
  });

  test("descends through functions and negation", () => {
    const tree = parseExpr("-sqrt(x) + sin(y)")!;
    expect(freeVariables(tree)).toEqual(["x", "y"]);
  });
});

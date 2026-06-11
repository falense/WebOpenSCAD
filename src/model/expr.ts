/**
 * Small expression engine for parameter and feature fields.
 *
 * The grammar is a strict subset of OpenSCAD's expression syntax, so any
 * expression that validates here can be emitted verbatim into generated
 * .scad code. Trigonometry uses degrees, matching OpenSCAD semantics.
 */

export type Scope = Record<string, number>;

const DEG = Math.PI / 180;

const FUNCS: Record<string, (...args: number[]) => number> = {
  sin: (x) => Math.sin(x * DEG),
  cos: (x) => Math.cos(x * DEG),
  tan: (x) => Math.tan(x * DEG),
  asin: (x) => Math.asin(x) / DEG,
  acos: (x) => Math.acos(x) / DEG,
  atan: (x) => Math.atan(x) / DEG,
  atan2: (y, x) => Math.atan2(y, x) / DEG,
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  sign: Math.sign,
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  pow: (x, y) => Math.pow(x, y),
};

const CONSTS: Record<string, number> = { PI: Math.PI };

type Token =
  | { t: "num"; v: number }
  | { t: "ident"; v: string }
  | { t: "op"; v: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
      if (!m) throw new Error(`Invalid number at position ${i}`);
      tokens.push({ t: "num", v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      const m = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(src.slice(i))!;
      tokens.push({ t: "ident", v: m[0] });
      i += m[0].length;
      continue;
    }
    if ("+-*/%^(),".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${c}"`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private scope: Scope,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private isOp(v: string): boolean {
    const t = this.peek();
    return t?.t === "op" && t.v === v;
  }

  private expect(v: string): void {
    if (!this.isOp(v)) throw new Error(`Expected "${v}"`);
    this.pos++;
  }

  parse(): number {
    const v = this.additive();
    if (this.pos < this.tokens.length) throw new Error("Unexpected trailing input");
    return v;
  }

  private additive(): number {
    let v = this.multiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.tokens[this.pos++] as { v: string }).v;
      const r = this.multiplicative();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  private multiplicative(): number {
    let v = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = (this.tokens[this.pos++] as { v: string }).v;
      const r = this.unary();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }

  private unary(): number {
    if (this.isOp("-")) {
      this.pos++;
      return -this.unary();
    }
    if (this.isOp("+")) {
      this.pos++;
      return this.unary();
    }
    return this.power();
  }

  private power(): number {
    const base = this.primary();
    if (this.isOp("^")) {
      this.pos++;
      return Math.pow(base, this.unary());
    }
    return base;
  }

  private primary(): number {
    const t = this.peek();
    if (!t) throw new Error("Unexpected end of expression");
    if (t.t === "num") {
      this.pos++;
      return t.v;
    }
    if (t.t === "ident") {
      this.pos++;
      if (this.isOp("(")) {
        const fn = FUNCS[t.v];
        if (!fn) throw new Error(`Unknown function "${t.v}"`);
        this.pos++;
        const args: number[] = [];
        if (!this.isOp(")")) {
          args.push(this.additive());
          while (this.isOp(",")) {
            this.pos++;
            args.push(this.additive());
          }
        }
        this.expect(")");
        return fn(...args);
      }
      if (t.v in this.scope) return this.scope[t.v];
      if (t.v in CONSTS) return CONSTS[t.v];
      throw new Error(`Unknown parameter "${t.v}"`);
    }
    if (t.t === "op" && t.v === "(") {
      this.pos++;
      const v = this.additive();
      this.expect(")");
      return v;
    }
    throw new Error(`Unexpected token "${(t as { v: string }).v}"`);
  }
}

/** Evaluate an expression string. Throws Error with a readable message. */
export function evaluate(src: string, scope: Scope): number {
  if (!src.trim()) throw new Error("Empty expression");
  const v = new Parser(tokenize(src), scope).parse();
  if (!Number.isFinite(v)) throw new Error("Result is not a finite number");
  return v;
}

/** Validate an expression; returns an error message or null if OK. */
export function validateExpr(src: string, scope: Scope): string | null {
  try {
    evaluate(src, scope);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export function isValidName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !(name in FUNCS) && name !== "PI";
}

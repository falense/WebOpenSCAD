import { describe, expect, it } from "vitest";
import { evaluate, isValidName, validateExpr } from "./expr";

describe("evaluate", () => {
  it("handles arithmetic with precedence", () => {
    expect(evaluate("2 + 3 * 4", {})).toBe(14);
    expect(evaluate("(2 + 3) * 4", {})).toBe(20);
    expect(evaluate("10 / 4", {})).toBe(2.5);
    expect(evaluate("7 % 4", {})).toBe(3);
    expect(evaluate("2 ^ 3 ^ 2", {})).toBe(512); // right associative
    expect(evaluate("-2 ^ 2", {})).toBe(-4);
  });

  it("resolves parameters and constants", () => {
    expect(evaluate("width / 2", { width: 50 })).toBe(25);
    expect(evaluate("PI", {})).toBeCloseTo(Math.PI);
  });

  it("uses degrees for trig, matching OpenSCAD", () => {
    expect(evaluate("sin(90)", {})).toBeCloseTo(1);
    expect(evaluate("cos(60)", {})).toBeCloseTo(0.5);
    expect(evaluate("atan2(1, 1)", {})).toBeCloseTo(45);
  });

  it("supports functions with multiple args", () => {
    expect(evaluate("min(3, 1, 2)", {})).toBe(1);
    expect(evaluate("max(3, 1, 2)", {})).toBe(3);
    expect(evaluate("pow(2, 10)", {})).toBe(1024);
  });

  it("rejects bad input", () => {
    expect(validateExpr("", {})).toBeTruthy();
    expect(validateExpr("2 +", {})).toBeTruthy();
    expect(validateExpr("unknown_var", {})).toBeTruthy();
    expect(validateExpr("nope(3)", {})).toBeTruthy();
    expect(validateExpr("1 / 0", {})).toBeTruthy(); // Infinity rejected
    expect(validateExpr("2; cube(5)", {})).toBeTruthy(); // no statement injection
    expect(validateExpr('str("x")', {})).toBeTruthy();
  });

  it("validates parameter names", () => {
    expect(isValidName("plate_w")).toBe(true);
    expect(isValidName("2bad")).toBe(false);
    expect(isValidName("sin")).toBe(false);
    expect(isValidName("a b")).toBe(false);
  });
});

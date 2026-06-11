import { describe, expect, it } from "vitest";
import { applyDelta, fmtNum, isNumericLiteral } from "./editDelta";

describe("isNumericLiteral", () => {
  it("accepts plain numbers", () => {
    expect(isNumericLiteral("12")).toBe(true);
    expect(isNumericLiteral("-3.5")).toBe(true);
    expect(isNumericLiteral(" 0.25 ")).toBe(true);
    expect(isNumericLiteral("2e3")).toBe(true);
  });
  it("rejects expressions", () => {
    expect(isNumericLiteral("w")).toBe(false);
    expect(isNumericLiteral("w / 2")).toBe(false);
    expect(isNumericLiteral("1 + 2")).toBe(false);
    expect(isNumericLiteral("")).toBe(false);
  });
});

describe("fmtNum", () => {
  it("rounds to 2 decimals and strips junk", () => {
    expect(fmtNum(14.500000001)).toBe("14.5");
    expect(fmtNum(3)).toBe("3");
    expect(fmtNum(-0.0001)).toBe("0");
    expect(fmtNum(1.006)).toBe("1.01");
  });
});

describe("applyDelta", () => {
  it("replaces plain numbers", () => {
    expect(applyDelta("12", 2.5)).toBe("14.5");
    expect(applyDelta("-3", -2)).toBe("-5");
    expect(applyDelta("0", 7)).toBe("7");
  });

  it("appends a delta term to expressions", () => {
    expect(applyDelta("w / 2", 2.5)).toBe("w / 2 + 2.5");
    expect(applyDelta("w / 2", -2.5)).toBe("w / 2 - 2.5");
    expect(applyDelta("plate_w", 10)).toBe("plate_w + 10");
  });

  it("merges a trailing numeric term from a previous drag", () => {
    expect(applyDelta("w / 2 + 1", 2.5)).toBe("w / 2 + 3.5");
    expect(applyDelta("w / 2 + 1", -1)).toBe("w / 2");
    expect(applyDelta("w / 2 - 3", 1)).toBe("w / 2 - 2");
    expect(applyDelta("w / 2 + 1", -4)).toBe("w / 2 - 3");
  });

  it("does not merge a numeric factor or parenthesized tail", () => {
    expect(applyDelta("w * 2", 1)).toBe("w * 2 + 1");
    expect(applyDelta("(w + 2)", 1)).toBe("(w + 2) + 1");
  });

  it("returns the expression unchanged for a zero delta", () => {
    expect(applyDelta("w / 2", 0)).toBe("w / 2");
    expect(applyDelta("12", 0)).toBe("12");
  });
});

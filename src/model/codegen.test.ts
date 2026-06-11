import { describe, expect, it } from "vitest";
import { evaluateDoc, generateScad, QUALITY_PRESETS } from "./codegen";
import { emptyDoc, mkId, newFeature, sampleDoc } from "./defaults";

describe("generateScad", () => {
  it("emits parameters and feature modules for the sample doc", () => {
    const code = generateScad(sampleDoc(), QUALITY_PRESETS.normal);
    expect(code).toContain("plate_w = 80;");
    expect(code).toContain("module feature_1()");
    expect(code).toContain("difference()");
    expect(code).toContain("__pat_linear");
    expect(code).toContain("__mirror");
  });

  it("passes parameter expressions through verbatim", () => {
    const doc = emptyDoc();
    doc.params.push({ id: mkId(), name: "w", expr: "40", description: "" });
    const f = newFeature("box", []);
    f.p.w = "w / 2 + 5";
    doc.features.push(f);
    const code = generateScad(doc, QUALITY_PRESETS.normal);
    expect(code).toContain("(w / 2 + 5)");
  });

  it("folds boolean operations in history order", () => {
    const doc = emptyDoc();
    const a = newFeature("box", []);
    const b = newFeature("cylinder", []);
    b.op = "cut";
    const c = newFeature("sphere", []);
    c.op = "intersect";
    doc.features.push(a, b, c);
    const code = generateScad(doc, QUALITY_PRESETS.normal);
    const iIntersect = code.indexOf("intersection()");
    const iDiff = code.indexOf("difference()");
    expect(iIntersect).toBeGreaterThanOrEqual(0);
    expect(iDiff).toBeGreaterThan(iIntersect); // difference nested inside intersection
  });

  it("skips hidden features", () => {
    const doc = emptyDoc();
    const a = newFeature("box", []);
    const b = newFeature("sphere", []);
    b.visible = false;
    doc.features.push(a, b);
    const code = generateScad(doc, QUALITY_PRESETS.normal);
    expect(code).toContain("cube");
    expect(code).not.toContain("sphere(");
  });

  it("emits extrude and revolve with profiles", () => {
    const doc = emptyDoc();
    const e = newFeature("extrude", []);
    e.profile!.kind = "polygon";
    const r = newFeature("revolve", []);
    r.profile!.kind = "circle";
    doc.features.push(e, r);
    const code = generateScad(doc, QUALITY_PRESETS.normal);
    expect(code).toContain("linear_extrude");
    expect(code).toContain("polygon(points = [[0, 0], [10, 0], [5, 10]])");
    expect(code).toContain("rotate_extrude");
    expect(code).toContain("circle(d = 10)");
  });
});

describe("evaluateDoc", () => {
  it("validates the sample doc cleanly", () => {
    const res = evaluateDoc(sampleDoc());
    expect(res.ok).toBe(true);
    expect(res.scope.plate_w).toBe(80);
  });

  it("flags bad expressions with their field", () => {
    const doc = emptyDoc();
    const f = newFeature("box", []);
    f.p.w = "missing_param";
    doc.features.push(f);
    const res = evaluateDoc(doc);
    expect(res.ok).toBe(false);
    expect(res.featureErrors[f.id][0]).toContain("Width (X)");
  });

  it("flags duplicate and invalid parameter names", () => {
    const doc = emptyDoc();
    doc.params.push(
      { id: "1", name: "a", expr: "1", description: "" },
      { id: "2", name: "a", expr: "2", description: "" },
      { id: "3", name: "9x", expr: "3", description: "" },
    );
    const res = evaluateDoc(doc);
    expect(res.paramErrors["2"]).toContain("Duplicate");
    expect(res.paramErrors["3"]).toContain("Invalid");
  });
});

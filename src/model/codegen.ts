import { Doc, Feature, KIND_DEFS, Profile } from "./types";
import { Scope, evaluate, isValidName, validateExpr } from "./expr";

export interface Quality {
  fa: number;
  fs: number;
}

export const QUALITY_PRESETS: Record<string, Quality> = {
  draft: { fa: 12, fs: 2 },
  normal: { fa: 6, fs: 1 },
  fine: { fa: 2, fs: 0.3 },
};

/** Wrap an expression in parentheses unless it is a bare number/identifier. */
function E(src: string): string {
  const s = src.trim();
  return /^-?[a-zA-Z0-9_.]+$/.test(s) ? s : `(${s})`;
}

function isZero(src: string): boolean {
  const s = src.trim();
  return s === "" || s === "0" || s === "0.0";
}

function isOne(src: string): boolean {
  const s = src.trim();
  return s === "1" || s === "1.0";
}

function profileCode(profile: Profile): string {
  switch (profile.kind) {
    case "rectangle":
      return `square([${E(profile.w)}, ${E(profile.h)}], center = true)`;
    case "circle":
      return `circle(d = ${E(profile.d)})`;
    case "polygon": {
      const pts = profile.points.map((p) => `[${E(p.x)}, ${E(p.y)}]`).join(", ");
      return `polygon(points = [${pts}])`;
    }
  }
}

interface Helpers {
  mirror: boolean;
  patLinear: boolean;
  patCircular: boolean;
  torus: boolean;
  rbox: boolean;
}

function geometryCode(f: Feature, helpers: Helpers): string {
  const p = f.p;
  switch (f.kind) {
    case "box": {
      const cube = `cube([${E(p.w)}, ${E(p.d)}, ${E(p.h)}], center = true)`;
      return f.centerZ ? `${cube};` : `translate([0, 0, ${E(p.h)} / 2]) ${cube};`;
    }
    case "cylinder":
      return `cylinder(d = ${E(p.d)}, h = ${E(p.h)}, center = ${f.centerZ});`;
    case "cone":
      return `cylinder(d1 = ${E(p.d1)}, d2 = ${E(p.d2)}, h = ${E(p.h)}, center = ${f.centerZ});`;
    case "sphere":
      return `sphere(d = ${E(p.d)});`;
    case "torus":
      helpers.torus = true;
      return `__torus(${E(p.D)}, ${E(p.t)});`;
    case "roundedBox": {
      helpers.rbox = true;
      const rbox = `__rbox(${E(p.w)}, ${E(p.d)}, ${E(p.h)}, ${E(p.r)})`;
      return f.centerZ ? `${rbox};` : `translate([0, 0, ${E(p.h)} / 2]) ${rbox};`;
    }
    case "extrude": {
      const args = [`height = ${E(p.height)}`];
      if (!isZero(p.twist)) args.push(`twist = ${E(p.twist)}`);
      if (!isOne(p.scaleTop)) args.push(`scale = ${E(p.scaleTop)}`);
      if (f.centerZ) args.push(`center = true`);
      return `linear_extrude(${args.join(", ")})\n  ${profileCode(f.profile!)};`;
    }
    case "revolve": {
      const angle = isZero(p.angle) ? "360" : p.angle;
      return `rotate_extrude(angle = ${E(angle)})\n  translate([${E(p.offset)}, 0])\n  ${profileCode(f.profile!)};`;
    }
  }
}

function placementChain(f: Feature, helpers: Helpers): string[] {
  const chain: string[] = [];
  const m = f.mirror;
  if (m.enabled) {
    helpers.mirror = true;
    const v = m.plane === "x" ? "[1, 0, 0]" : m.plane === "y" ? "[0, 1, 0]" : "[0, 0, 1]";
    chain.push(`__mirror(${v}, ${m.keepOriginal})`);
  }
  const pat = f.pattern;
  if (pat.type === "linear") {
    helpers.patLinear = true;
    chain.push(`__pat_linear(${E(pat.count)}, [${E(pat.dx)}, ${E(pat.dy)}, ${E(pat.dz)}])`);
  } else if (pat.type === "circular") {
    helpers.patCircular = true;
    const v = pat.axis === "x" ? "[1, 0, 0]" : pat.axis === "y" ? "[0, 1, 0]" : "[0, 0, 1]";
    chain.push(`__pat_circular(${E(pat.count)}, ${E(pat.angle)}, ${v})`);
  }
  const t = f.transform;
  if (!(isZero(t.tx) && isZero(t.ty) && isZero(t.tz)))
    chain.push(`translate([${E(t.tx)}, ${E(t.ty)}, ${E(t.tz)}])`);
  if (!(isZero(t.rx) && isZero(t.ry) && isZero(t.rz)))
    chain.push(`rotate([${E(t.rx)}, ${E(t.ry)}, ${E(t.rz)}])`);
  if (!(isOne(t.sx) && isOne(t.sy) && isOne(t.sz)))
    chain.push(`scale([${E(t.sx)}, ${E(t.sy)}, ${E(t.sz)}])`);
  return chain;
}

function indent(block: string, pad: string): string {
  return block
    .split("\n")
    .map((l) => (l.length ? pad + l : l))
    .join("\n");
}

const HELPER_CODE: Record<keyof Helpers, string> = {
  mirror: `module __mirror(v, keep = true) {
  if (keep) children();
  mirror(v) children();
}`,
  patLinear: `module __pat_linear(n, step) {
  for (i = [0 : 1 : n - 1]) translate(i * step) children();
}`,
  patCircular: `module __pat_circular(n, a, v) {
  for (i = [0 : 1 : n - 1]) rotate(i * a / n, v) children();
}`,
  torus: `module __torus(D, t) {
  rotate_extrude() translate([D / 2, 0]) circle(d = t);
}`,
  rbox: `module __rbox(w, d, h, r) {
  if (r <= 0) cube([w, d, h], center = true);
  else hull()
    for (px = [-1, 1], py = [-1, 1], pz = [-1, 1])
      translate([px * (w / 2 - r), py * (d / 2 - r), pz * (h / 2 - r)])
        sphere(r = r);
}`,
};

export function generateScad(doc: Doc, quality: Quality): string {
  const helpers: Helpers = {
    mirror: false,
    patLinear: false,
    patCircular: false,
    torus: false,
    rbox: false,
  };

  const visible = doc.features.filter((f) => f.visible);

  // Feature modules
  const modules: string[] = [];
  const moduleName = new Map<string, string>();
  doc.features.forEach((f, i) => moduleName.set(f.id, `feature_${i + 1}`));
  for (const f of visible) {
    const chain = placementChain(f, helpers);
    const geom = geometryCode(f, helpers);
    const body = [...chain, geom].join("\n");
    modules.push(`// ${f.name}\nmodule ${moduleName.get(f.id)}() {\n${indent(body, "  ")}\n}`);
  }

  // Combine features in history order
  let body = "";
  for (const f of visible) {
    const call = `${moduleName.get(f.id)}(); // ${f.name}`;
    if (!body) {
      body = call;
      continue;
    }
    const comb = f.op === "add" ? "union" : f.op === "cut" ? "difference" : "intersection";
    body = `${comb}() {\n${indent(body, "  ")}\n  ${call}\n}`;
  }

  const sections: string[] = [];
  sections.push(
    `// ${doc.name}\n// Generated by WebOpenSCAD — edit parameters below or in the customizer.`,
  );
  sections.push(`$fa = ${quality.fa};\n$fs = ${quality.fs};`);

  if (doc.params.length) {
    const lines = doc.params.map((p) =>
      p.description ? `${p.name} = ${p.expr}; // ${p.description}` : `${p.name} = ${p.expr};`,
    );
    sections.push(`/* [Parameters] */\n${lines.join("\n")}`);
  }

  const usedHelpers = (Object.keys(helpers) as (keyof Helpers)[])
    .filter((k) => helpers[k])
    .map((k) => HELPER_CODE[k]);
  if (usedHelpers.length) sections.push(usedHelpers.join("\n\n"));

  if (modules.length) sections.push(modules.join("\n\n"));
  sections.push(body ? `// Model\n${body}` : "// Empty model — add features to begin.");

  return sections.join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// Document validation

export interface DocEval {
  scope: Scope;
  /** param id -> error message */
  paramErrors: Record<string, string>;
  /** feature id -> error messages */
  featureErrors: Record<string, string[]>;
  ok: boolean;
}

/** Every expression field of a feature, with a human-readable label. */
export function featureExprFields(f: Feature): { label: string; value: string }[] {
  const def = KIND_DEFS[f.kind];
  const fields: { label: string; value: string }[] = [];
  for (const fd of def.fields) fields.push({ label: fd.label, value: f.p[fd.key] ?? "" });
  if (def.hasProfile && f.profile) {
    const pr = f.profile;
    if (pr.kind === "rectangle") {
      fields.push({ label: "Profile width", value: pr.w });
      fields.push({ label: "Profile height", value: pr.h });
    } else if (pr.kind === "circle") {
      fields.push({ label: "Profile diameter", value: pr.d });
    } else {
      pr.points.forEach((pt, i) => {
        fields.push({ label: `Point ${i + 1} X`, value: pt.x });
        fields.push({ label: `Point ${i + 1} Y`, value: pt.y });
      });
    }
  }
  const t = f.transform;
  fields.push(
    { label: "Position X", value: t.tx },
    { label: "Position Y", value: t.ty },
    { label: "Position Z", value: t.tz },
    { label: "Rotation X", value: t.rx },
    { label: "Rotation Y", value: t.ry },
    { label: "Rotation Z", value: t.rz },
    { label: "Scale X", value: t.sx },
    { label: "Scale Y", value: t.sy },
    { label: "Scale Z", value: t.sz },
  );
  if (f.pattern.type === "linear") {
    fields.push(
      { label: "Pattern count", value: f.pattern.count },
      { label: "Pattern ΔX", value: f.pattern.dx },
      { label: "Pattern ΔY", value: f.pattern.dy },
      { label: "Pattern ΔZ", value: f.pattern.dz },
    );
  } else if (f.pattern.type === "circular") {
    fields.push(
      { label: "Pattern count", value: f.pattern.count },
      { label: "Pattern angle", value: f.pattern.angle },
    );
  }
  return fields;
}

export function evaluateDoc(doc: Doc): DocEval {
  const scope: Scope = {};
  const paramErrors: Record<string, string> = {};
  const seen = new Set<string>();

  for (const p of doc.params) {
    if (!isValidName(p.name)) {
      paramErrors[p.id] = `Invalid name "${p.name}"`;
      continue;
    }
    if (seen.has(p.name)) {
      paramErrors[p.id] = `Duplicate name "${p.name}"`;
      continue;
    }
    seen.add(p.name);
    try {
      scope[p.name] = evaluate(p.expr, scope);
    } catch (e) {
      paramErrors[p.id] = e instanceof Error ? e.message : String(e);
    }
  }

  const featureErrors: Record<string, string[]> = {};
  for (const f of doc.features) {
    const errs: string[] = [];
    for (const field of featureExprFields(f)) {
      const err = validateExpr(field.value, scope);
      if (err) errs.push(`${field.label}: ${err}`);
    }
    if (errs.length) featureErrors[f.id] = errs;
  }

  return {
    scope,
    paramErrors,
    featureErrors,
    ok: Object.keys(paramErrors).length === 0 && Object.keys(featureErrors).length === 0,
  };
}

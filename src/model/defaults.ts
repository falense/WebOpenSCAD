import { Doc, Feature, FeatureKind, KIND_DEFS, Mirror, Param, Pattern, Profile, Transform } from "./types";

let counter = 0;
export function mkId(): string {
  counter += 1;
  return `${Date.now().toString(36)}_${counter.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function defaultTransform(): Transform {
  return { tx: "0", ty: "0", tz: "0", rx: "0", ry: "0", rz: "0", sx: "1", sy: "1", sz: "1" };
}

export function defaultPattern(): Pattern {
  return { type: "none", count: "2", dx: "20", dy: "0", dz: "0", axis: "z", angle: "360" };
}

export function defaultMirror(): Mirror {
  return { enabled: false, plane: "x", keepOriginal: true };
}

export function defaultProfile(): Profile {
  return {
    kind: "rectangle",
    w: "10",
    h: "10",
    d: "10",
    points: [
      { x: "0", y: "0" },
      { x: "10", y: "0" },
      { x: "5", y: "10" },
    ],
  };
}

export function newFeature(kind: FeatureKind, existingNames: string[]): Feature {
  const def = KIND_DEFS[kind];
  let n = 1;
  while (existingNames.includes(`${def.label} ${n}`)) n += 1;
  return {
    id: mkId(),
    kind,
    name: `${def.label} ${n}`,
    op: "add",
    visible: true,
    centerZ: false,
    p: { ...def.defaults },
    profile: def.hasProfile ? defaultProfile() : undefined,
    transform: defaultTransform(),
    pattern: defaultPattern(),
    mirror: defaultMirror(),
  };
}

export function newParam(existing: Param[]): Param {
  let n = 1;
  while (existing.some((p) => p.name === `param${n}`)) n += 1;
  return { id: mkId(), name: `param${n}`, expr: "10", description: "" };
}

export function emptyDoc(): Doc {
  return { name: "Untitled", params: [], features: [] };
}

/** Demo model shown on first launch: a parametric mounting bracket. */
export function sampleDoc(): Doc {
  const params: Param[] = [
    { id: mkId(), name: "plate_w", expr: "80", description: "Plate width" },
    { id: mkId(), name: "plate_d", expr: "50", description: "Plate depth" },
    { id: mkId(), name: "plate_t", expr: "8", description: "Plate thickness" },
    { id: mkId(), name: "boss_d", expr: "26", description: "Boss diameter" },
    { id: mkId(), name: "boss_h", expr: "22", description: "Boss height" },
    { id: mkId(), name: "bore_d", expr: "12", description: "Bore diameter" },
    { id: mkId(), name: "hole_d", expr: "5", description: "Mounting hole diameter" },
    { id: mkId(), name: "hole_inset", expr: "8", description: "Hole inset from edges" },
  ];

  const features: Feature[] = [];

  const plate = newFeature("roundedBox", []);
  plate.name = "Base Plate";
  plate.p = { w: "plate_w", d: "plate_d", h: "plate_t", r: "3" };
  features.push(plate);

  const boss = newFeature("cone", []);
  boss.name = "Boss";
  boss.p = { d1: "boss_d", d2: "boss_d - 6", h: "boss_h" };
  boss.transform.tz = "plate_t";
  features.push(boss);

  const bore = newFeature("cylinder", []);
  bore.name = "Bore";
  bore.op = "cut";
  bore.p = { d: "bore_d", h: "plate_t + boss_h + 2" };
  bore.transform.tz = "-1";
  features.push(bore);

  const hole = newFeature("cylinder", []);
  hole.name = "Mounting Holes";
  hole.op = "cut";
  hole.p = { d: "hole_d", h: "plate_t + 2" };
  hole.transform.tx = "plate_w / 2 - hole_inset";
  hole.transform.ty = "plate_d / 2 - hole_inset";
  hole.transform.tz = "-1";
  hole.pattern = {
    type: "linear",
    count: "2",
    dx: "-(plate_w - 2 * hole_inset)",
    dy: "0",
    dz: "0",
    axis: "z",
    angle: "360",
  };
  hole.mirror = { enabled: true, plane: "y", keepOriginal: true };
  features.push(hole);

  return { name: "Parametric Bracket", params, features };
}

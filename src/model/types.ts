export type Op = "add" | "cut" | "intersect";
export type Axis = "x" | "y" | "z";

export interface Param {
  id: string;
  name: string;
  expr: string;
  description: string;
}

export interface Transform {
  tx: string;
  ty: string;
  tz: string;
  rx: string;
  ry: string;
  rz: string;
  sx: string;
  sy: string;
  sz: string;
}

export interface Pattern {
  type: "none" | "linear" | "circular";
  count: string;
  dx: string;
  dy: string;
  dz: string;
  axis: Axis;
  angle: string;
}

export interface Mirror {
  enabled: boolean;
  plane: Axis; // mirror across the plane normal to this axis
  keepOriginal: boolean;
}

export type ProfileKind = "rectangle" | "circle" | "polygon";

export interface Profile {
  kind: ProfileKind;
  w: string;
  h: string;
  d: string;
  points: { x: string; y: string }[];
}

export type FeatureKind =
  | "box"
  | "cylinder"
  | "cone"
  | "sphere"
  | "torus"
  | "roundedBox"
  | "extrude"
  | "revolve";

export interface Feature {
  id: string;
  kind: FeatureKind;
  name: string;
  op: Op;
  visible: boolean;
  /** Center the solid on the Z axis (otherwise it sits on Z=0) */
  centerZ: boolean;
  /** Geometry parameters; every value is an expression string */
  p: Record<string, string>;
  profile?: Profile;
  transform: Transform;
  pattern: Pattern;
  mirror: Mirror;
}

export interface Doc {
  name: string;
  params: Param[];
  features: Feature[];
}

export interface FieldDef {
  key: string;
  label: string;
}

export interface KindDef {
  label: string;
  icon: string;
  fields: FieldDef[];
  defaults: Record<string, string>;
  hasProfile: boolean;
  hasCenterZ: boolean;
}

export const KIND_DEFS: Record<FeatureKind, KindDef> = {
  box: {
    label: "Box",
    icon: "▭",
    fields: [
      { key: "w", label: "Width (X)" },
      { key: "d", label: "Depth (Y)" },
      { key: "h", label: "Height (Z)" },
    ],
    defaults: { w: "20", d: "20", h: "10" },
    hasProfile: false,
    hasCenterZ: true,
  },
  cylinder: {
    label: "Cylinder",
    icon: "⬤",
    fields: [
      { key: "d", label: "Diameter" },
      { key: "h", label: "Height" },
    ],
    defaults: { d: "10", h: "20" },
    hasProfile: false,
    hasCenterZ: true,
  },
  cone: {
    label: "Cone",
    icon: "▲",
    fields: [
      { key: "d1", label: "Bottom Ø" },
      { key: "d2", label: "Top Ø" },
      { key: "h", label: "Height" },
    ],
    defaults: { d1: "20", d2: "5", h: "15" },
    hasProfile: false,
    hasCenterZ: true,
  },
  sphere: {
    label: "Sphere",
    icon: "●",
    fields: [{ key: "d", label: "Diameter" }],
    defaults: { d: "15" },
    hasProfile: false,
    hasCenterZ: false,
  },
  torus: {
    label: "Torus",
    icon: "◎",
    fields: [
      { key: "D", label: "Ring Ø" },
      { key: "t", label: "Tube Ø" },
    ],
    defaults: { D: "30", t: "6" },
    hasProfile: false,
    hasCenterZ: false,
  },
  roundedBox: {
    label: "Rounded Box",
    icon: "▢",
    fields: [
      { key: "w", label: "Width (X)" },
      { key: "d", label: "Depth (Y)" },
      { key: "h", label: "Height (Z)" },
      { key: "r", label: "Corner Radius" },
    ],
    defaults: { w: "20", d: "20", h: "10", r: "2" },
    hasProfile: false,
    hasCenterZ: true,
  },
  extrude: {
    label: "Extrude",
    icon: "⇈",
    fields: [
      { key: "height", label: "Height" },
      { key: "twist", label: "Twist (°)" },
      { key: "scaleTop", label: "Top Scale" },
    ],
    defaults: { height: "10", twist: "0", scaleTop: "1" },
    hasProfile: true,
    hasCenterZ: true,
  },
  revolve: {
    label: "Revolve",
    icon: "↻",
    fields: [
      { key: "angle", label: "Angle (°)" },
      { key: "offset", label: "Axis Offset" },
    ],
    defaults: { angle: "360", offset: "10" },
    hasProfile: true,
    hasCenterZ: false,
  },
};

export const OP_LABELS: Record<Op, string> = {
  add: "Add",
  cut: "Cut",
  intersect: "Intersect",
};

/**
 * Client-side proxy geometry: analytic three.js meshes built directly from the
 * document model (via the expression engine), mirroring what codegen emits.
 *
 * The compiled STL remains the visual ground truth for booleans; proxies sit
 * on top of it invisibly and provide what a merged mesh cannot: per-feature
 * raycast picking, hover/selection highlighting, and instant drag preview
 * without a WASM recompile.
 *
 * Known approximations (proxies are previews, not the model):
 *  - extrude ignores twist / top scale
 *  - pattern instances are capped for performance
 */
import * as THREE from "three";
import { Axis, Doc, Feature, Profile } from "../model/types";
import { Scope, evaluate } from "../model/expr";

const DEG = Math.PI / 180;
const MAX_PATTERN_INSTANCES = 64;

export interface FeatureProxies {
  feature: Feature;
  /** One anchor (feature transform) per pattern/mirror instance; [0] is the gizmo target. */
  anchors: THREE.Group[];
  meshes: THREE.Mesh[];
}

export interface ProxySet {
  group: THREE.Group;
  byFeature: Map<string, FeatureProxies>;
}

function profileShape(profile: Profile, ev: (e: string) => number): THREE.Shape {
  const shape = new THREE.Shape();
  switch (profile.kind) {
    case "rectangle": {
      const w = ev(profile.w);
      const h = ev(profile.h);
      shape.moveTo(-w / 2, -h / 2);
      shape.lineTo(w / 2, -h / 2);
      shape.lineTo(w / 2, h / 2);
      shape.lineTo(-w / 2, h / 2);
      break;
    }
    case "circle":
      shape.absarc(0, 0, ev(profile.d) / 2, 0, Math.PI * 2, false);
      break;
    case "polygon": {
      const pts = profile.points.map((p) => [ev(p.x), ev(p.y)] as const);
      if (pts.length < 3) throw new Error("Polygon needs at least 3 points");
      shape.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
      break;
    }
  }
  shape.closePath();
  return shape;
}

function profilePoints(profile: Profile, ev: (e: string) => number): THREE.Vector2[] {
  switch (profile.kind) {
    case "rectangle": {
      const w = ev(profile.w);
      const h = ev(profile.h);
      return [
        new THREE.Vector2(-w / 2, -h / 2),
        new THREE.Vector2(w / 2, -h / 2),
        new THREE.Vector2(w / 2, h / 2),
        new THREE.Vector2(-w / 2, h / 2),
        new THREE.Vector2(-w / 2, -h / 2),
      ];
    }
    case "circle": {
      const r = ev(profile.d) / 2;
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
      }
      return pts;
    }
    case "polygon": {
      const pts = profile.points.map((p) => new THREE.Vector2(ev(p.x), ev(p.y)));
      pts.push(pts[0].clone());
      return pts;
    }
  }
}

/**
 * Geometry for one feature in OpenSCAD coordinates (Z up), including the
 * centerZ convention, matching what codegen emits before placement.
 */
function featureGeometry(f: Feature, ev: (e: string) => number): THREE.BufferGeometry {
  const p = f.p;
  switch (f.kind) {
    case "box": {
      const g = new THREE.BoxGeometry(ev(p.w), ev(p.d), ev(p.h));
      if (!f.centerZ) g.translate(0, 0, ev(p.h) / 2);
      return g;
    }
    case "roundedBox": {
      // Plain box approximation; corner rounding is cosmetic for pick/drag.
      const g = new THREE.BoxGeometry(ev(p.w), ev(p.d), ev(p.h));
      if (!f.centerZ) g.translate(0, 0, ev(p.h) / 2);
      return g;
    }
    case "cylinder": {
      const r = ev(p.d) / 2;
      const h = ev(p.h);
      const g = new THREE.CylinderGeometry(r, r, h, 48);
      g.rotateX(Math.PI / 2); // three cylinders run along Y; OpenSCAD's run along Z
      if (!f.centerZ) g.translate(0, 0, h / 2);
      return g;
    }
    case "cone": {
      const h = ev(p.h);
      const g = new THREE.CylinderGeometry(ev(p.d2) / 2, ev(p.d1) / 2, h, 48);
      g.rotateX(Math.PI / 2);
      if (!f.centerZ) g.translate(0, 0, h / 2);
      return g;
    }
    case "sphere":
      return new THREE.SphereGeometry(ev(p.d) / 2, 48, 24);
    case "torus":
      // TorusGeometry ring lies in the XY plane, same as rotate_extrude.
      return new THREE.TorusGeometry(ev(p.D) / 2, ev(p.t) / 2, 24, 64);
    case "extrude": {
      const h = ev(p.height);
      const g = new THREE.ExtrudeGeometry(profileShape(f.profile!, ev), {
        depth: h,
        bevelEnabled: false,
        curveSegments: 32,
      });
      if (f.centerZ) g.translate(0, 0, -h / 2);
      return g;
    }
    case "revolve": {
      const offset = ev(p.offset);
      const angle = ev(p.angle) || 360;
      const pts = profilePoints(f.profile!, ev).map(
        (v) => new THREE.Vector2(Math.max(0, v.x + offset), v.y),
      );
      // Lathe spins around Y with phi=0 at +Z; rotateX maps Y->Z, and a
      // phiStart of 90° lands the profile on +X like rotate_extrude.
      const g = new THREE.LatheGeometry(pts, 64, Math.PI / 2, angle * DEG);
      g.rotateX(Math.PI / 2);
      return g;
    }
  }
}

function axisVector(axis: Axis): THREE.Vector3 {
  return new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
}

/** Outer placement matrices (mirror ∘ pattern), one per instance; [0] is the primary. */
function instanceMatrices(f: Feature, ev: (e: string) => number): THREE.Matrix4[] {
  const pats: THREE.Matrix4[] = [];
  if (f.pattern.type === "linear") {
    const n = Math.min(MAX_PATTERN_INSTANCES, Math.max(1, Math.floor(ev(f.pattern.count))));
    const step = new THREE.Vector3(ev(f.pattern.dx), ev(f.pattern.dy), ev(f.pattern.dz));
    for (let i = 0; i < n; i++)
      pats.push(new THREE.Matrix4().makeTranslation(step.clone().multiplyScalar(i)));
  } else if (f.pattern.type === "circular") {
    const n = Math.min(MAX_PATTERN_INSTANCES, Math.max(1, Math.floor(ev(f.pattern.count))));
    const total = ev(f.pattern.angle);
    const axis = axisVector(f.pattern.axis);
    for (let i = 0; i < n; i++)
      pats.push(new THREE.Matrix4().makeRotationAxis(axis, ((i * total) / n) * DEG));
  } else {
    pats.push(new THREE.Matrix4());
  }

  if (!f.mirror.enabled) return pats;
  const m = f.mirror.plane;
  const mirror = new THREE.Matrix4().makeScale(
    m === "x" ? -1 : 1,
    m === "y" ? -1 : 1,
    m === "z" ? -1 : 1,
  );
  const mirrored = pats.map((p) => mirror.clone().multiply(p));
  return f.mirror.keepOriginal ? [...pats, ...mirrored] : mirrored;
}

/** Apply the feature's own transform (translate ∘ rotate ∘ scale) to an anchor group. */
export function applyFeatureTransform(
  anchor: THREE.Object3D,
  f: Feature,
  ev: (e: string) => number,
): void {
  const t = f.transform;
  anchor.position.set(ev(t.tx), ev(t.ty), ev(t.tz));
  // OpenSCAD rotate([x,y,z]) applies X, then Y, then Z — three's 'ZYX' order.
  anchor.rotation.order = "ZYX";
  anchor.rotation.set(ev(t.rx) * DEG, ev(t.ry) * DEG, ev(t.rz) * DEG);
  anchor.scale.set(ev(t.sx), ev(t.sy), ev(t.sz));
}

/**
 * Build proxies for all visible features. Features whose expressions fail to
 * evaluate are skipped (they are temporarily unpickable, not fatal).
 */
export function buildProxies(doc: Doc, scope: Scope, material: THREE.Material): ProxySet {
  const group = new THREE.Group();
  group.name = "proxies";
  const byFeature = new Map<string, FeatureProxies>();

  for (const f of doc.features) {
    if (!f.visible) continue;
    const ev = (e: string) => evaluate(e, scope);
    try {
      const geometry = featureGeometry(f, ev);
      const anchors: THREE.Group[] = [];
      const meshes: THREE.Mesh[] = [];
      for (const outer of instanceMatrices(f, ev)) {
        const wrap = new THREE.Group();
        wrap.matrixAutoUpdate = false;
        wrap.matrix.copy(outer);

        const anchor = new THREE.Group();
        anchor.userData.featureId = f.id;
        applyFeatureTransform(anchor, f, ev);

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.featureId = f.id;
        mesh.renderOrder = 2; // after the STL mesh and its edge overlay

        anchor.add(mesh);
        wrap.add(anchor);
        group.add(wrap);
        anchors.push(anchor);
        meshes.push(mesh);
      }
      byFeature.set(f.id, { feature: f, anchors, meshes });
    } catch {
      // invalid expressions — skip this feature's proxy
    }
  }

  return { group, byFeature };
}

export function disposeProxies(set: ProxySet): void {
  const geos = new Set<THREE.BufferGeometry>();
  set.group.traverse((o) => {
    if (o instanceof THREE.Mesh) geos.add(o.geometry as THREE.BufferGeometry);
  });
  geos.forEach((g) => g.dispose());
  set.group.removeFromParent();
  set.byFeature.clear();
}

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { useStore } from "../state/store";
import { useDocEval } from "../state/docEvalContext";
import { Op } from "../model/types";
import { applyDelta, fmtNum } from "../model/editDelta";
import { ProxySet, buildProxies, disposeProxies } from "../viewport/proxies";

interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  transform: TransformControls;
  modelGroup: THREE.Group;
  hasFitted: boolean;
}

interface DragState {
  featureId: string;
  startPos: THREE.Vector3;
  startRot: THREE.Euler;
}

interface ProxyMats {
  idle: THREE.MeshBasicMaterial;
  hover: THREE.MeshBasicMaterial;
  sel: Record<Op, THREE.MeshBasicMaterial>;
}

type GizmoMode = "translate" | "rotate";

const MESH_COLOR = 0x8fb6d9;
const DEG = Math.PI / 180;

function disposeGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  }
}

function makeProxyMats(): ProxyMats {
  const overlay = (color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false, // x-ray: highlights stay visible inside holes / behind walls
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  return {
    // Invisible but raycastable — proxies normally render nothing
    idle: new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    hover: overlay(0x4d9fdb, 0.1),
    sel: {
      add: overlay(0x4d9fdb, 0.25),
      cut: overlay(0xe06c5f, 0.3),
      intersect: overlay(0xc9a14d, 0.25),
    },
  };
}

export default function Viewport() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const proxyRef = useRef<ProxySet | null>(null);
  const matsRef = useRef<ProxyMats | null>(null);
  const hoverRef = useRef<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const modeRef = useRef<GizmoMode>("translate");
  const [mode, setMode] = useState<GizmoMode>("translate");

  const doc = useStore((s) => s.doc);
  const selectedId = useStore((s) => s.selectedId);
  const status = useStore((s) => s.compile.status);
  const stlVersion = useStore((s) => s.compile.stlVersion);
  const docEval = useDocEval();

  /** Assign idle/hover/selection materials to every proxy mesh. Uses refs only. */
  const refreshMaterials = useCallback(() => {
    const mats = matsRef.current;
    const set = proxyRef.current;
    if (!mats || !set) return;
    const sel = useStore.getState().selectedId;
    const hov = hoverRef.current;
    set.byFeature.forEach((fp, id) => {
      const m = id === sel ? mats.sel[fp.feature.op] : id === hov ? mats.hover : mats.idle;
      for (const mesh of fp.meshes) mesh.material = m;
    });
  }, []);

  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x161a1f);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
    camera.up.set(0, 0, 1); // CAD convention: Z is up
    camera.position.set(120, -120, 90);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;

    scene.add(new THREE.HemisphereLight(0xcfd8e3, 0x252a31, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(60, -90, 140);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb4cc, 0.4);
    fill.position.set(-80, 60, -40);
    scene.add(fill);

    const grid = new THREE.GridHelper(200, 20, 0x33404d, 0x232a32);
    grid.rotation.x = Math.PI / 2; // grid on XY plane (Z up)
    scene.add(grid);

    const axisLen = 30;
    const axes = [
      { dir: new THREE.Vector3(1, 0, 0), color: 0xc4504f },
      { dir: new THREE.Vector3(0, 1, 0), color: 0x4f9e4f },
      { dir: new THREE.Vector3(0, 0, 1), color: 0x4f74c4 },
    ];
    for (const a of axes) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        a.dir.clone().multiplyScalar(axisLen),
      ]);
      scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: a.color })));
    }

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    const mats = makeProxyMats();
    matsRef.current = mats;

    // --- Transform gizmo -----------------------------------------------------
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.9);
    scene.add(transform);

    const startDrag = () => {
      const id = useStore.getState().selectedId;
      const fp = id ? proxyRef.current?.byFeature.get(id) : undefined;
      if (!id || !fp) return;
      const a = fp.anchors[0];
      dragRef.current = { featureId: id, startPos: a.position.clone(), startRot: a.rotation.clone() };
    };

    // Keep pattern/mirror instances following the dragged primary instance
    const syncSiblings = () => {
      const drag = dragRef.current;
      const fp = drag ? proxyRef.current?.byFeature.get(drag.featureId) : undefined;
      if (!fp) return;
      const a0 = fp.anchors[0];
      for (let i = 1; i < fp.anchors.length; i++) {
        fp.anchors[i].position.copy(a0.position);
        fp.anchors[i].quaternion.copy(a0.quaternion);
      }
    };

    // Fold the drag result back into the feature's expression fields — one
    // store commit (one undo step, one recompile) per drag.
    const commitDrag = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;
      const fp = proxyRef.current?.byFeature.get(drag.featureId);
      if (!fp) return;
      const a = fp.anchors[0];
      const { updateFeature } = useStore.getState();
      if (modeRef.current === "translate") {
        const d = a.position.clone().sub(drag.startPos);
        if (Math.abs(d.x) < 0.005 && Math.abs(d.y) < 0.005 && Math.abs(d.z) < 0.005) return;
        updateFeature(drag.featureId, (f) => {
          if (Math.abs(d.x) >= 0.005) f.transform.tx = applyDelta(f.transform.tx, d.x);
          if (Math.abs(d.y) >= 0.005) f.transform.ty = applyDelta(f.transform.ty, d.y);
          if (Math.abs(d.z) >= 0.005) f.transform.tz = applyDelta(f.transform.tz, d.z);
        });
      } else {
        // 3D rotations don't compose per-axis, so write back the resulting
        // absolute Euler angles (replacing any expressions).
        const deg = [a.rotation.x / DEG, a.rotation.y / DEG, a.rotation.z / DEG];
        const old = [drag.startRot.x / DEG, drag.startRot.y / DEG, drag.startRot.z / DEG];
        if (deg.every((v, i) => Math.abs(v - old[i]) < 0.05)) return;
        updateFeature(drag.featureId, (f) => {
          f.transform.rx = fmtNum(deg[0]);
          f.transform.ry = fmtNum(deg[1]);
          f.transform.rz = fmtNum(deg[2]);
        });
      }
    };

    transform.addEventListener("dragging-changed", (e) => {
      const dragging = Boolean((e as { value?: unknown }).value);
      controls.enabled = !dragging;
      if (dragging) startDrag();
      else commitDrag();
    });
    transform.addEventListener("objectChange", syncSiblings);

    // --- Picking & hover ------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const downPos = { x: 0, y: 0 };

    const pickAt = (ev: PointerEvent): string | null => {
      const set = proxyRef.current;
      if (!set) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      for (const hit of raycaster.intersectObjects(set.group.children, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o) {
          if (typeof o.userData.featureId === "string") return o.userData.featureId;
          o = o.parent;
        }
      }
      return null;
    };

    const onPointerDown = (ev: PointerEvent) => {
      downPos.x = ev.clientX;
      downPos.y = ev.clientY;
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (transform.dragging) return;
      const id = transform.axis ? null : pickAt(ev); // gizmo handles win over hover
      if (id !== hoverRef.current) {
        hoverRef.current = id;
        renderer.domElement.style.cursor = id ? "pointer" : "";
        refreshMaterials();
      }
    };
    const onPointerUp = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      if (transform.dragging || transform.axis) return; // gizmo interaction, not a pick
      const dx = ev.clientX - downPos.x;
      const dy = ev.clientY - downPos.y;
      if (dx * dx + dy * dy > 25) return; // camera orbit, not a click
      useStore.getState().select(pickAt(ev));
    };
    const onPointerLeave = () => {
      if (hoverRef.current) {
        hoverRef.current = null;
        renderer.domElement.style.cursor = "";
        refreshMaterials();
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    // --- Keyboard --------------------------------------------------------------
    const inInput = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
    const onKeyDown = (e: KeyboardEvent) => {
      if (inInput(e)) return;
      if (e.key === "Escape") useStore.getState().select(null);
      else if (e.key === "m" || e.key === "M") setMode("translate");
      else if (e.key === "r" || e.key === "R") setMode("rotate");
      else if (e.key === "Control") {
        transform.translationSnap = 1;
        transform.rotationSnap = 15 * DEG;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control") {
        transform.translationSnap = null;
        transform.rotationSnap = null;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const state: SceneState = {
      renderer,
      scene,
      camera,
      controls,
      transform,
      modelGroup,
      hasFitted: false,
    };
    sceneRef.current = state;

    let raf = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      transform.dispose();
      controls.dispose();
      if (proxyRef.current) disposeProxies(proxyRef.current);
      proxyRef.current = null;
      mats.idle.dispose();
      mats.hover.dispose();
      Object.values(mats.sel).forEach((m) => m.dispose());
      matsRef.current = null;
      disposeGroup(modelGroup);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, [refreshMaterials]);

  // Rebuild proxies whenever the document (and thus the evaluated scope) changes
  useEffect(() => {
    const state = sceneRef.current;
    const mats = matsRef.current;
    if (!state || !mats) return;
    state.transform.detach();
    dragRef.current = null;
    if (proxyRef.current) disposeProxies(proxyRef.current);
    proxyRef.current = buildProxies(doc, docEval.scope, mats.idle);
    state.scene.add(proxyRef.current.group);
    proxyRef.current.group.updateMatrixWorld(true);
    const sel = useStore.getState().selectedId;
    const fp = sel ? proxyRef.current.byFeature.get(sel) : undefined;
    if (fp) state.transform.attach(fp.anchors[0]);
    refreshMaterials();
  }, [doc, docEval, refreshMaterials]);

  // Attach/detach the gizmo when the selection changes
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    const fp = selectedId ? proxyRef.current?.byFeature.get(selectedId) : undefined;
    if (fp) state.transform.attach(fp.anchors[0]);
    else state.transform.detach();
    refreshMaterials();
  }, [selectedId, refreshMaterials]);

  useEffect(() => {
    modeRef.current = mode;
    sceneRef.current?.transform.setMode(mode);
  }, [mode]);

  // Swap in new geometry whenever a compile finishes
  useEffect(() => {
    const state = sceneRef.current;
    const stl = useStore.getState().compile.stl;
    if (!state || !stl || stlVersion === 0) return;

    let geometry: THREE.BufferGeometry;
    try {
      geometry = new STLLoader().parse(stl);
    } catch {
      return;
    }
    geometry.computeVertexNormals();

    disposeGroup(state.modelGroup);
    const material = new THREE.MeshStandardMaterial({
      color: MESH_COLOR,
      flatShading: true,
      metalness: 0.05,
      roughness: 0.65,
    });
    state.modelGroup.add(new THREE.Mesh(geometry, material));

    // Edge overlay for a crisp CAD look; skip on heavy meshes
    if (geometry.attributes.position.count < 600_000) {
      const edges = new THREE.EdgesGeometry(geometry, 24);
      state.modelGroup.add(
        new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: 0x10151a, transparent: true, opacity: 0.35 }),
        ),
      );
    }

    if (!state.hasFitted) {
      fitView();
      state.hasFitted = true;
    }
  }, [stlVersion]);

  const setView = (dir: [number, number, number]) => {
    const state = sceneRef.current;
    if (!state) return;
    const target = state.controls.target;
    const dist = state.camera.position.distanceTo(target);
    const v = new THREE.Vector3(...dir).normalize().multiplyScalar(dist);
    state.camera.position.copy(target.clone().add(v));
    state.controls.update();
  };

  const fitView = () => {
    const state = sceneRef.current;
    if (!state) return;
    const box = new THREE.Box3().setFromObject(state.modelGroup);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = (sphere.radius / Math.tan((state.camera.fov * Math.PI) / 360)) * 1.25;
    const dir = state.camera.position.clone().sub(state.controls.target).normalize();
    if (dir.lengthSq() < 0.5) dir.set(1, -1, 0.8).normalize();
    state.controls.target.copy(center);
    state.camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
    state.camera.near = Math.max(0.01, dist / 1000);
    state.camera.far = dist * 100;
    state.camera.updateProjectionMatrix();
    state.controls.update();
  };

  return (
    <div className="viewport" ref={mountRef}>
      <div className="view-buttons">
        <button onClick={() => setView([1, -1, 0.8])} title="Isometric view">
          ISO
        </button>
        <button onClick={() => setView([0, 0, 1])} title="Top view">
          Top
        </button>
        <button onClick={() => setView([0, -1, 0])} title="Front view">
          Front
        </button>
        <button onClick={() => setView([1, 0, 0])} title="Right view">
          Right
        </button>
        <button onClick={fitView} title="Zoom to fit">
          ⛶ Fit
        </button>
      </div>
      {selectedId && (
        <div className="gizmo-buttons">
          <button
            className={mode === "translate" ? "active" : ""}
            onClick={() => setMode("translate")}
            title="Move the selected feature (M) — hold Ctrl to snap"
          >
            ✥ Move
          </button>
          <button
            className={mode === "rotate" ? "active" : ""}
            onClick={() => setMode("rotate")}
            title="Rotate the selected feature (R) — hold Ctrl to snap"
          >
            ⟳ Rotate
          </button>
        </div>
      )}
      {status === "compiling" && (
        <div className="compiling-overlay">
          <div className="spinner" />
          Rebuilding…
        </div>
      )}
    </div>
  );
}

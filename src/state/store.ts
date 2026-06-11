import { create } from "zustand";
import { Doc, Feature, FeatureKind, Param } from "../model/types";
import { mkId, newFeature, newParam, sampleDoc } from "../model/defaults";

export type QualityName = "draft" | "normal" | "fine";

export interface CompileState {
  status: "idle" | "compiling" | "ok" | "error";
  logs: string[];
  error?: string;
  timeMs?: number;
  stl?: ArrayBuffer;
  /** Increments whenever a new STL arrives, so the viewport knows to update */
  stlVersion: number;
}

const STORAGE_KEY = "webopenscad.doc.v1";
const HISTORY_LIMIT = 100;

function loadInitialDoc(): Doc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const doc = JSON.parse(raw) as Doc;
      if (doc && Array.isArray(doc.features) && Array.isArray(doc.params)) return doc;
    }
  } catch {
    // fall through to sample
  }
  return sampleDoc();
}

function persist(doc: Doc): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // storage may be unavailable; ignore
  }
}

interface AppState {
  doc: Doc;
  selectedId: string | null;
  quality: QualityName;
  showCode: boolean;
  past: Doc[];
  future: Doc[];
  compile: CompileState;

  commit: (mutate: (draft: Doc) => void) => void;
  select: (id: string | null) => void;
  addFeature: (kind: FeatureKind) => void;
  removeFeature: (id: string) => void;
  duplicateFeature: (id: string) => void;
  moveFeature: (id: string, dir: -1 | 1) => void;
  updateFeature: (id: string, mutate: (f: Feature) => void) => void;
  addParam: () => void;
  updateParam: (id: string, mutate: (p: Param) => void) => void;
  removeParam: (id: string) => void;
  undo: () => void;
  redo: () => void;
  loadDoc: (doc: Doc) => void;
  setQuality: (q: QualityName) => void;
  setShowCode: (v: boolean) => void;
  setCompile: (patch: Partial<CompileState>) => void;
}

export const useStore = create<AppState>((set, get) => ({
  doc: loadInitialDoc(),
  selectedId: null,
  quality: "normal",
  showCode: false,
  past: [],
  future: [],
  compile: { status: "idle", logs: [], stlVersion: 0 },

  commit: (mutate) => {
    const { doc, past } = get();
    const draft = structuredClone(doc);
    mutate(draft);
    persist(draft);
    set({
      doc: draft,
      past: [...past.slice(-(HISTORY_LIMIT - 1)), doc],
      future: [],
    });
  },

  select: (id) => set({ selectedId: id }),

  addFeature: (kind) => {
    const id = mkId();
    get().commit((d) => {
      const f = newFeature(kind, d.features.map((x) => x.name));
      f.id = id;
      d.features.push(f);
    });
    set({ selectedId: id });
  },

  removeFeature: (id) => {
    get().commit((d) => {
      d.features = d.features.filter((f) => f.id !== id);
    });
    if (get().selectedId === id) set({ selectedId: null });
  },

  duplicateFeature: (id) => {
    const newId = mkId();
    get().commit((d) => {
      const i = d.features.findIndex((f) => f.id === id);
      if (i < 0) return;
      const copy = structuredClone(d.features[i]);
      copy.id = newId;
      copy.name = `${copy.name} copy`;
      d.features.splice(i + 1, 0, copy);
    });
    set({ selectedId: newId });
  },

  moveFeature: (id, dir) => {
    get().commit((d) => {
      const i = d.features.findIndex((f) => f.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.features.length) return;
      const [f] = d.features.splice(i, 1);
      d.features.splice(j, 0, f);
    });
  },

  updateFeature: (id, mutate) => {
    get().commit((d) => {
      const f = d.features.find((x) => x.id === id);
      if (f) mutate(f);
    });
  },

  addParam: () => {
    get().commit((d) => {
      d.params.push(newParam(d.params));
    });
  },

  updateParam: (id, mutate) => {
    get().commit((d) => {
      const p = d.params.find((x) => x.id === id);
      if (p) mutate(p);
    });
  },

  removeParam: (id) => {
    get().commit((d) => {
      d.params = d.params.filter((p) => p.id !== id);
    });
  },

  undo: () => {
    const { past, future, doc } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    persist(prev);
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future] });
  },

  redo: () => {
    const { past, future, doc } = get();
    if (!future.length) return;
    const next = future[0];
    persist(next);
    set({ doc: next, past: [...past, doc], future: future.slice(1) });
  },

  loadDoc: (doc) => {
    persist(doc);
    set({ doc, past: [], future: [], selectedId: null });
  },

  setQuality: (quality) => set({ quality }),
  setShowCode: (showCode) => set({ showCode }),
  setCompile: (patch) => set((s) => ({ compile: { ...s.compile, ...patch } })),
}));

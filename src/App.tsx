import { useEffect, useMemo, useRef } from "react";
import { useStore } from "./state/store";
import { DocEvalContext } from "./state/docEvalContext";
import { evaluateDoc, generateScad, QUALITY_PRESETS } from "./model/codegen";
import { compiler } from "./engine/compiler";
import Toolbar from "./components/Toolbar";
import FeatureTree from "./components/FeatureTree";
import ParamsPanel from "./components/ParamsPanel";
import PropertiesPanel from "./components/PropertiesPanel";
import Viewport from "./components/Viewport";
import CodePanel from "./components/CodePanel";
import StatusBar from "./components/StatusBar";

export default function App() {
  const doc = useStore((s) => s.doc);
  const quality = useStore((s) => s.quality);
  const showCode = useStore((s) => s.showCode);

  const docEval = useMemo(() => evaluateDoc(doc), [doc]);

  // Wire compiler callbacks into the store once
  useEffect(() => {
    compiler.onStart = () => {
      useStore.setState((s) => ({ compile: { ...s.compile, status: "compiling" } }));
    };
    compiler.onResult = (r) => {
      useStore.setState((s) => ({
        compile: {
          ...s.compile,
          status: r.ok ? "ok" : "error",
          logs: r.logs,
          error: r.error,
          timeMs: r.timeMs,
          ...(r.ok && r.stl ? { stl: r.stl, stlVersion: s.compile.stlVersion + 1 } : {}),
        },
      }));
    };
  }, []);

  // Debounced recompile whenever the model or quality changes
  const lastCode = useRef<string | null>(null);
  useEffect(() => {
    if (!docEval.ok) return; // status bar reports expression errors
    if (!doc.features.some((f) => f.visible)) {
      useStore.setState((s) => ({ compile: { ...s.compile, status: "idle", logs: [] } }));
      return;
    }
    const code = generateScad(doc, QUALITY_PRESETS[quality]);
    if (code === lastCode.current) return; // e.g. selection or no-op edits
    const t = setTimeout(() => {
      lastCode.current = code;
      compiler.compile(code);
    }, 300);
    return () => clearTimeout(t);
  }, [doc, quality, docEval]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput =
        e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (!inInput) {
          e.preventDefault();
          useStore.getState().undo();
        }
      } else if ((mod && e.key.toLowerCase() === "z" && e.shiftKey) || (mod && e.key.toLowerCase() === "y")) {
        if (!inInput) {
          e.preventDefault();
          useStore.getState().redo();
        }
      } else if ((e.key === "Delete" || e.key === "Backspace") && !inInput) {
        const { selectedId, removeFeature } = useStore.getState();
        if (selectedId) {
          e.preventDefault();
          removeFeature(selectedId);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <DocEvalContext.Provider value={docEval}>
      <div className="app">
        <Toolbar />
        <div className="main">
          <aside className="sidebar-left">
            <ParamsPanel />
            <FeatureTree />
          </aside>
          <div className="center">
            <Viewport />
            {showCode && <CodePanel />}
          </div>
          <aside className="sidebar-right">
            <PropertiesPanel />
          </aside>
        </div>
        <StatusBar />
      </div>
    </DocEvalContext.Provider>
  );
}

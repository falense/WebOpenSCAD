import { useRef } from "react";
import { useStore, QualityName } from "../state/store";
import { Doc, FeatureKind, KIND_DEFS } from "../model/types";
import { emptyDoc } from "../model/defaults";
import { generateScad, QUALITY_PRESETS } from "../model/codegen";
import { downloadBlob, safeFileName } from "../utils/download";

const PRIMITIVES: FeatureKind[] = ["box", "cylinder", "cone", "sphere", "torus", "roundedBox"];
const SKETCH: FeatureKind[] = ["extrude", "revolve"];

export default function Toolbar() {
  const doc = useStore((s) => s.doc);
  const addFeature = useStore((s) => s.addFeature);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const loadDoc = useStore((s) => s.loadDoc);
  const quality = useStore((s) => s.quality);
  const setQuality = useStore((s) => s.setQuality);
  const showCode = useStore((s) => s.showCode);
  const setShowCode = useStore((s) => s.setShowCode);
  const commit = useStore((s) => s.commit);
  const stl = useStore((s) => s.compile.stl);
  const fileRef = useRef<HTMLInputElement>(null);

  const onNew = () => {
    if (confirm("Start a new model? Unsaved changes are kept in undo history only.")) {
      loadDoc(emptyDoc());
    }
  };

  const onSave = () => {
    downloadBlob(JSON.stringify(doc, null, 2), `${safeFileName(doc.name)}.webscad.json`, "application/json");
  };

  const onOpenFile = async (file: File) => {
    try {
      const doc = JSON.parse(await file.text()) as Doc;
      if (!doc || !Array.isArray(doc.features) || !Array.isArray(doc.params)) {
        throw new Error("Not a WebOpenSCAD project file");
      }
      loadDoc(doc);
    } catch (e) {
      alert(`Could not open file: ${e instanceof Error ? e.message : e}`);
    }
  };

  const onExportScad = () => {
    const code = generateScad(doc, QUALITY_PRESETS[quality]);
    downloadBlob(code, `${safeFileName(doc.name)}.scad`, "text/plain");
  };

  const onExportStl = () => {
    if (!stl) return;
    downloadBlob(stl, `${safeFileName(doc.name)}.stl`, "model/stl");
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark">⬢</span>
        <span className="brand-name">WebOpenSCAD</span>
      </div>

      <input
        className="doc-name"
        value={doc.name}
        spellCheck={false}
        onChange={(e) => commit((d) => (d.name = e.target.value))}
        title="Model name"
      />

      <div className="tb-group">
        <button onClick={onNew} title="New model">New</button>
        <button onClick={() => fileRef.current?.click()} title="Open project (.webscad.json)">Open</button>
        <button onClick={onSave} title="Save project (.webscad.json)">Save</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onOpenFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="tb-group">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">↪</button>
      </div>

      <div className="tb-group tb-features">
        {PRIMITIVES.map((k) => (
          <button key={k} className="tb-add" onClick={() => addFeature(k)} title={`Add ${KIND_DEFS[k].label}`}>
            <span className="tb-icon">{KIND_DEFS[k].icon}</span>
            {KIND_DEFS[k].label}
          </button>
        ))}
        <span className="tb-sep" />
        {SKETCH.map((k) => (
          <button key={k} className="tb-add" onClick={() => addFeature(k)} title={`Add ${KIND_DEFS[k].label}`}>
            <span className="tb-icon">{KIND_DEFS[k].icon}</span>
            {KIND_DEFS[k].label}
          </button>
        ))}
      </div>

      <div className="tb-spacer" />

      <div className="tb-group">
        <label className="tb-label">
          Quality
          <select value={quality} onChange={(e) => setQuality(e.target.value as QualityName)}>
            <option value="draft">Draft</option>
            <option value="normal">Normal</option>
            <option value="fine">Fine</option>
          </select>
        </label>
      </div>

      <div className="tb-group">
        <button className={showCode ? "active" : ""} onClick={() => setShowCode(!showCode)} title="Show generated OpenSCAD code">
          Code
        </button>
        <button onClick={onExportScad} title="Export OpenSCAD source">.scad</button>
        <button onClick={onExportStl} disabled={!stl} title="Export STL of the current mesh (pick quality first)">
          .stl
        </button>
      </div>
    </header>
  );
}

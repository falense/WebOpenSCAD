import { useStore } from "../state/store";
import { KIND_DEFS, Op } from "../model/types";
import { useDocEval } from "../state/docEvalContext";

const OP_BADGE: Record<Op, { sym: string; cls: string; label: string }> = {
  add: { sym: "+", cls: "op-add", label: "Add (union)" },
  cut: { sym: "−", cls: "op-cut", label: "Cut (difference)" },
  intersect: { sym: "∩", cls: "op-int", label: "Intersect" },
};

export default function FeatureTree() {
  const features = useStore((s) => s.doc.features);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const updateFeature = useStore((s) => s.updateFeature);
  const removeFeature = useStore((s) => s.removeFeature);
  const duplicateFeature = useStore((s) => s.duplicateFeature);
  const moveFeature = useStore((s) => s.moveFeature);
  const docEval = useDocEval();

  return (
    <div className="panel feature-tree">
      <div className="panel-title">Features</div>
      {features.length === 0 && (
        <div className="empty-hint">No features yet — add a primitive from the toolbar to start modelling.</div>
      )}
      <ul>
        {features.map((f, i) => {
          const op = OP_BADGE[f.op];
          const hasError = !!docEval.featureErrors[f.id];
          return (
            <li
              key={f.id}
              className={`feature-row${f.id === selectedId ? " selected" : ""}${f.visible ? "" : " hidden-f"}`}
              onClick={() => select(f.id)}
            >
              <span className={`op-badge ${op.cls}`} title={op.label}>
                {op.sym}
              </span>
              <span className="f-icon">{KIND_DEFS[f.kind].icon}</span>
              <span className="f-name" title={f.name}>
                {f.name}
                {hasError && (
                  <span className="f-error" title={docEval.featureErrors[f.id].join("\n")}>
                    ⚠
                  </span>
                )}
              </span>
              <span className="f-actions" onClick={(e) => e.stopPropagation()}>
                <button title="Move up" disabled={i === 0} onClick={() => moveFeature(f.id, -1)}>
                  ↑
                </button>
                <button
                  title="Move down"
                  disabled={i === features.length - 1}
                  onClick={() => moveFeature(f.id, 1)}
                >
                  ↓
                </button>
                <button title="Duplicate" onClick={() => duplicateFeature(f.id)}>
                  ⧉
                </button>
                <button
                  title={f.visible ? "Hide (suppress)" : "Show"}
                  onClick={() => updateFeature(f.id, (x) => (x.visible = !x.visible))}
                >
                  {f.visible ? "👁" : "·"}
                </button>
                <button className="danger" title="Delete" onClick={() => removeFeature(f.id)}>
                  ✕
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

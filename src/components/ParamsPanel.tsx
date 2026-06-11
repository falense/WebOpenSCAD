import { useStore } from "../state/store";
import { useDocEval } from "../state/docEvalContext";
import ExpressionInput from "./ExpressionInput";
import { isValidName, Scope } from "../model/expr";

export default function ParamsPanel() {
  const params = useStore((s) => s.doc.params);
  const addParam = useStore((s) => s.addParam);
  const updateParam = useStore((s) => s.updateParam);
  const removeParam = useStore((s) => s.removeParam);
  const docEval = useDocEval();

  return (
    <div className="panel params-panel">
      <div className="panel-title">
        Parameters
        <button className="panel-action" onClick={addParam} title="Add parameter">
          ＋
        </button>
      </div>
      {params.length === 0 && (
        <div className="empty-hint">
          Parameters drive your model. Add one (e.g. <code>width = 50</code>) and reference it in any
          field.
        </div>
      )}
      <ul>
        {params.map((p, i) => {
          const err = docEval.paramErrors[p.id];
          // Scope visible to this parameter: everything defined before it
          const scopeBefore: Scope = {};
          for (let j = 0; j < i; j++) {
            const q = params[j];
            if (q.name in docEval.scope) scopeBefore[q.name] = docEval.scope[q.name];
          }
          const value = docEval.scope[p.name];
          return (
            <li key={p.id} className="param-row" title={err ?? p.description}>
              <input
                className={`param-name${isValidName(p.name) ? "" : " expr-error"}`}
                value={p.name}
                spellCheck={false}
                onChange={(e) => updateParam(p.id, (x) => (x.name = e.target.value))}
              />
              <span className="param-eq">=</span>
              <ExpressionInput
                value={p.expr}
                scope={scopeBefore}
                onCommit={(v) => updateParam(p.id, (x) => (x.expr = v))}
              />
              <span className={`param-value${err ? " expr-error-text" : ""}`}>
                {err ? "⚠" : value !== undefined ? +value.toFixed(4) : ""}
              </span>
              <button className="danger" title="Delete parameter" onClick={() => removeParam(p.id)}>
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

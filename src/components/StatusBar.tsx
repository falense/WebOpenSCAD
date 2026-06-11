import { useState } from "react";
import { useStore } from "../state/store";
import { useDocEval } from "../state/docEvalContext";
import { stlTriangleCount } from "../utils/download";

export default function StatusBar() {
  const compile = useStore((s) => s.compile);
  const docEval = useDocEval();
  const [showLog, setShowLog] = useState(false);

  const exprErrors =
    Object.keys(docEval.paramErrors).length + Object.keys(docEval.featureErrors).length;

  let statusText: string;
  let statusClass = "";
  if (exprErrors > 0) {
    statusText = `⚠ ${exprErrors} invalid expression${exprErrors > 1 ? "s" : ""} — fix highlighted fields`;
    statusClass = "status-error";
  } else if (compile.status === "compiling") {
    statusText = "Rebuilding model…";
  } else if (compile.status === "error") {
    statusText = `✕ ${compile.error ?? "Compile failed"}`;
    statusClass = "status-error";
  } else if (compile.status === "ok") {
    const tris = compile.stl ? stlTriangleCount(compile.stl) : null;
    statusText = `✓ Built in ${((compile.timeMs ?? 0) / 1000).toFixed(1)}s${tris ? ` — ${tris.toLocaleString()} triangles` : ""}`;
    statusClass = "status-ok";
  } else {
    statusText = "Ready";
  }

  return (
    <>
      {showLog && (
        <div className="log-overlay">
          <div className="code-header">
            <span>Compiler log</span>
            <button onClick={() => setShowLog(false)}>Close</button>
          </div>
          <pre>{compile.logs.length ? compile.logs.join("\n") : "(no output)"}</pre>
        </div>
      )}
      <footer className="status-bar">
        <span className={statusClass}>{statusText}</span>
        <span className="status-spacer" />
        <button className="status-log-btn" onClick={() => setShowLog(!showLog)}>
          Log {compile.logs.length ? `(${compile.logs.length})` : ""}
        </button>
      </footer>
    </>
  );
}

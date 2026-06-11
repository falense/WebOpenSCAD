import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { generateScad, QUALITY_PRESETS } from "../model/codegen";

export default function CodePanel() {
  const doc = useStore((s) => s.doc);
  const quality = useStore((s) => s.quality);
  const [copied, setCopied] = useState(false);

  const code = useMemo(() => generateScad(doc, QUALITY_PRESETS[quality]), [doc, quality]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="code-panel">
      <div className="code-header">
        <span>Generated OpenSCAD</span>
        <button onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
      </div>
      <pre>{code}</pre>
    </div>
  );
}

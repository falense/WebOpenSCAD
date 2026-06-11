import { useStore } from "../state/store";
import { Axis, Feature, KIND_DEFS, Op, OP_LABELS, ProfileKind } from "../model/types";
import { useDocEval } from "../state/docEvalContext";
import ExpressionInput from "./ExpressionInput";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="prop-section">
      <div className="prop-section-title">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="prop-row">
      <span className="prop-label">{label}</span>
      {children}
    </label>
  );
}

export default function PropertiesPanel() {
  const selectedId = useStore((s) => s.selectedId);
  const feature = useStore((s) => s.doc.features.find((f) => f.id === s.selectedId));
  const updateFeature = useStore((s) => s.updateFeature);
  const docEval = useDocEval();

  if (!selectedId || !feature) {
    return (
      <div className="panel props-panel">
        <div className="panel-title">Properties</div>
        <div className="empty-hint">
          Select a feature in the tree to edit its dimensions, operation, position and patterns. Every
          field accepts expressions like <code>width / 2 + 5</code>.
        </div>
      </div>
    );
  }

  const f = feature;
  const def = KIND_DEFS[f.kind];
  const scope = docEval.scope;
  const up = (mutate: (x: Feature) => void) => updateFeature(f.id, mutate);
  const errors = docEval.featureErrors[f.id];

  return (
    <div className="panel props-panel">
      <div className="panel-title">
        {def.icon} {def.label}
      </div>

      {errors && (
        <div className="prop-errors">
          {errors.map((e, i) => (
            <div key={i}>⚠ {e}</div>
          ))}
        </div>
      )}

      <Section title="Feature">
        <Row label="Name">
          <input
            value={f.name}
            spellCheck={false}
            onChange={(e) => up((x) => (x.name = e.target.value))}
          />
        </Row>
        <div className="op-buttons">
          {(["add", "cut", "intersect"] as Op[]).map((op) => (
            <button
              key={op}
              className={`op-btn op-btn-${op}${f.op === op ? " active" : ""}`}
              onClick={() => up((x) => (x.op = op))}
              title={
                op === "add"
                  ? "Union with the model so far"
                  : op === "cut"
                    ? "Subtract from the model so far"
                    : "Keep only the overlap with the model so far"
              }
            >
              {OP_LABELS[op]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Dimensions">
        {def.fields.map((fd) => (
          <Row key={fd.key} label={fd.label}>
            <ExpressionInput
              value={f.p[fd.key] ?? ""}
              scope={scope}
              onCommit={(v) => up((x) => (x.p[fd.key] = v))}
            />
          </Row>
        ))}
        {def.hasCenterZ && (
          <Row label="Center on Z">
            <input
              type="checkbox"
              checked={f.centerZ}
              onChange={(e) => up((x) => (x.centerZ = e.target.checked))}
            />
          </Row>
        )}
      </Section>

      {def.hasProfile && f.profile && (
        <Section title="Profile (2D sketch)">
          <Row label="Shape">
            <select
              value={f.profile.kind}
              onChange={(e) => up((x) => (x.profile!.kind = e.target.value as ProfileKind))}
            >
              <option value="rectangle">Rectangle</option>
              <option value="circle">Circle</option>
              <option value="polygon">Polygon</option>
            </select>
          </Row>
          {f.profile.kind === "rectangle" && (
            <>
              <Row label="Width">
                <ExpressionInput
                  value={f.profile.w}
                  scope={scope}
                  onCommit={(v) => up((x) => (x.profile!.w = v))}
                />
              </Row>
              <Row label="Height">
                <ExpressionInput
                  value={f.profile.h}
                  scope={scope}
                  onCommit={(v) => up((x) => (x.profile!.h = v))}
                />
              </Row>
            </>
          )}
          {f.profile.kind === "circle" && (
            <Row label="Diameter">
              <ExpressionInput
                value={f.profile.d}
                scope={scope}
                onCommit={(v) => up((x) => (x.profile!.d = v))}
              />
            </Row>
          )}
          {f.profile.kind === "polygon" && (
            <div className="poly-points">
              {f.profile.points.map((pt, i) => (
                <div key={i} className="poly-row">
                  <span className="prop-label">P{i + 1}</span>
                  <ExpressionInput
                    value={pt.x}
                    scope={scope}
                    onCommit={(v) => up((x) => (x.profile!.points[i].x = v))}
                  />
                  <ExpressionInput
                    value={pt.y}
                    scope={scope}
                    onCommit={(v) => up((x) => (x.profile!.points[i].y = v))}
                  />
                  <button
                    className="danger"
                    disabled={f.profile!.points.length <= 3}
                    title="Remove point"
                    onClick={() => up((x) => x.profile!.points.splice(i, 1))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                className="add-point"
                onClick={() =>
                  up((x) => {
                    const pts = x.profile!.points;
                    const last = pts[pts.length - 1];
                    pts.push({ x: last.x, y: last.y });
                  })
                }
              >
                ＋ Add point
              </button>
            </div>
          )}
        </Section>
      )}

      <Section title="Position">
        <div className="xyz-row">
          {(["tx", "ty", "tz"] as const).map((k, i) => (
            <ExpressionInput
              key={k}
              value={f.transform[k]}
              scope={scope}
              placeholder={"XYZ"[i]}
              onCommit={(v) => up((x) => (x.transform[k] = v))}
            />
          ))}
        </div>
      </Section>

      <Section title="Rotation (°)">
        <div className="xyz-row">
          {(["rx", "ry", "rz"] as const).map((k, i) => (
            <ExpressionInput
              key={k}
              value={f.transform[k]}
              scope={scope}
              placeholder={"XYZ"[i]}
              onCommit={(v) => up((x) => (x.transform[k] = v))}
            />
          ))}
        </div>
      </Section>

      <Section title="Scale">
        <div className="xyz-row">
          {(["sx", "sy", "sz"] as const).map((k, i) => (
            <ExpressionInput
              key={k}
              value={f.transform[k]}
              scope={scope}
              placeholder={"XYZ"[i]}
              onCommit={(v) => up((x) => (x.transform[k] = v))}
            />
          ))}
        </div>
      </Section>

      <Section title="Pattern">
        <Row label="Type">
          <select
            value={f.pattern.type}
            onChange={(e) =>
              up((x) => (x.pattern.type = e.target.value as Feature["pattern"]["type"]))
            }
          >
            <option value="none">None</option>
            <option value="linear">Linear</option>
            <option value="circular">Circular</option>
          </select>
        </Row>
        {f.pattern.type !== "none" && (
          <Row label="Count">
            <ExpressionInput
              value={f.pattern.count}
              scope={scope}
              onCommit={(v) => up((x) => (x.pattern.count = v))}
            />
          </Row>
        )}
        {f.pattern.type === "linear" && (
          <Row label="Spacing">
            <div className="xyz-row">
              {(["dx", "dy", "dz"] as const).map((k, i) => (
                <ExpressionInput
                  key={k}
                  value={f.pattern[k]}
                  scope={scope}
                  placeholder={"XYZ"[i]}
                  onCommit={(v) => up((x) => (x.pattern[k] = v))}
                />
              ))}
            </div>
          </Row>
        )}
        {f.pattern.type === "circular" && (
          <>
            <Row label="Axis">
              <select
                value={f.pattern.axis}
                onChange={(e) => up((x) => (x.pattern.axis = e.target.value as Axis))}
              >
                <option value="x">X</option>
                <option value="y">Y</option>
                <option value="z">Z</option>
              </select>
            </Row>
            <Row label="Total angle">
              <ExpressionInput
                value={f.pattern.angle}
                scope={scope}
                onCommit={(v) => up((x) => (x.pattern.angle = v))}
              />
            </Row>
          </>
        )}
      </Section>

      <Section title="Mirror">
        <Row label="Enabled">
          <input
            type="checkbox"
            checked={f.mirror.enabled}
            onChange={(e) => up((x) => (x.mirror.enabled = e.target.checked))}
          />
        </Row>
        {f.mirror.enabled && (
          <>
            <Row label="Across plane">
              <select
                value={f.mirror.plane}
                onChange={(e) => up((x) => (x.mirror.plane = e.target.value as Axis))}
              >
                <option value="x">YZ (flip X)</option>
                <option value="y">XZ (flip Y)</option>
                <option value="z">XY (flip Z)</option>
              </select>
            </Row>
            <Row label="Keep original">
              <input
                type="checkbox"
                checked={f.mirror.keepOriginal}
                onChange={(e) => up((x) => (x.mirror.keepOriginal = e.target.checked))}
              />
            </Row>
          </>
        )}
      </Section>
    </div>
  );
}

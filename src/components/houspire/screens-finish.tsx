"use client";

// screens-finish.tsx — Edit, Variants, Export tabs for the room workspace.
// Ported pixel-perfect from handoff/screens-finish.jsx. Shares
// WorkspaceCornerMarks with screens-generate for the creative-tool canvas
// chrome (corner marks on every canvas view).

import React, { useState, CSSProperties } from "react";
import {
  Icon,
  Button,
  Pill,
  Panel,
  Divider,
  Segment,
  RoomPhoto,
  iconBtn,
} from "./primitives";
import { WorkspaceCornerMarks } from "./screens-generate";
import {
  DATA,
  Room,
  Suggestion,
  SuggestionImpact,
  SuggestionStatus,
} from "./data";

// Local input style — matches handoff screens-room.jsx local inputStyle
// (padding 7px 10px, r-sm, font-sans, vertical resize). Different from
// primitives.inputStyle which is height-30/r-md for shell inputs.
const workspaceInputStyle: CSSProperties = {
  width: "100%", padding: "7px 10px",
  fontSize: 12, color: "var(--text-0)",
  background: "var(--surface-1)", border: "1px solid var(--border)",
  borderRadius: "var(--r-sm)",
  fontFamily: "var(--font-sans)",
  resize: "vertical",
};

// ─── EDIT TAB ─────────────────────────────────────────────────────────
export const EditTab: React.FC<{ room: Room }> = ({ room }) => {
  const [action, setAction] = useState("color");
  const [target, setTarget] = useState("sofa");
  const [value, setValue] = useState("deep emerald");
  const [hoverSuggest, setHoverSuggest] = useState<string | null>(null);

  const clickTargets: {
    t: string; l: string; w: string; h: string;
    label: string; hot?: boolean; sacred?: boolean;
  }[] = [
    { t: "62%", l: "10%", w: "38%", h: "22%", label: "sofa", hot: true },
    { t: "70%", l: "25%", w: "22%", h: "8%", label: "rug" },
    { t: "60%", l: "32%", w: "14%", h: "7%", label: "coffee table" },
    { t: "30%", l: "82%", w: "14%", h: "45%", label: "plant" },
    { t: "18%", l: "58%", w: "22%", h: "38%", label: "window", sacred: true },
  ];

  return (
    <div style={{
      padding: 18, display: "grid", gridTemplateColumns: "1fr 340px",
      gap: 14, height: "100%",
    }}>
      {/* Canvas with pick-mode */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <div style={{
          flex: 1, background: "var(--surface-canvas)",
          border: "1px solid var(--border)", borderRadius: "var(--r-lg)",
          overflow: "hidden", position: "relative", minHeight: 420,
        }}>
          <div style={{ position: "absolute", inset: 36 }}>
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 4 }}>
              <RoomPhoto tone={room.tone} />
            </div>
            {/* Click-targets (pick-to-edit) */}
            <div style={{ position: "absolute", inset: 0 }}>
              {clickTargets.map(b => (
                <div key={b.label}
                  onMouseEnter={() => setHoverSuggest(b.label)}
                  onMouseLeave={() => setHoverSuggest(null)}
                  style={{
                    position: "absolute", top: b.t, left: b.l, width: b.w, height: b.h,
                    border: `1px dashed ${b.sacred ? "var(--sacred)" : hoverSuggest === b.label ? "var(--amber)" : "rgba(255,255,255,0.25)"}`,
                    background: hoverSuggest === b.label ? "oklch(0.78 0.17 75 / 0.12)" : "transparent",
                    borderRadius: 3, cursor: b.sacred ? "not-allowed" : "pointer",
                    transition: "all 120ms",
                  }}
                  onClick={() => {
                    if (!b.sacred) setTarget(b.label);
                  }}
                >
                  {(hoverSuggest === b.label || b.sacred) && (
                    <div style={{
                      position: "absolute", top: -20, left: 0,
                      padding: "2px 6px", borderRadius: 3,
                      background: b.sacred ? "var(--sacred)" : "var(--amber)",
                      color: b.sacred ? "white" : "#1A1407",
                      fontSize: 9.5, fontWeight: 600,
                      fontFamily: "var(--font-mono)", whiteSpace: "nowrap",
                      display: "inline-flex", alignItems: "center", gap: 4,
                    }}>
                      {b.sacred && <Icon name="lock" size={8} />}
                      {b.label}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <WorkspaceCornerMarks />

          {/* Floating instruction */}
          <div style={{
            position: "absolute", top: 14, left: 14,
            padding: "6px 10px", background: "rgba(8,9,11,0.8)",
            backdropFilter: "blur(8px)", border: "1px solid var(--border-weak)",
            borderRadius: "var(--r-md)", fontSize: 11, color: "var(--text-1)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Icon name="edit" size={11} color="var(--amber)" />
            Click any element to edit · sacred zones locked
          </div>

          {/* Command bar */}
          <div style={{
            position: "absolute", bottom: 14, left: 14, right: 14,
            background: "rgba(8,9,11,0.88)", backdropFilter: "blur(14px)",
            border: "1px solid var(--border)", borderRadius: "var(--r-md)",
            padding: 10, display: "flex", alignItems: "center", gap: 8,
          }}>
            <span className="cap-sm">Edit</span>
            <Segment value={action} onChange={setAction} size="sm"
              options={DATA.editActions.map(a => ({ value: a.key, label: a.label, icon: a.icon }))} />
            <Divider vertical style={{ height: 20 }} />
            <input value={target} onChange={e => setTarget(e.target.value)}
              placeholder="Which element?"
              style={{ ...workspaceInputStyle, flex: "0 0 140px", background: "var(--surface-2)" }} />
            <Icon name="arrow-right" size={12} color="var(--text-3)" />
            <input value={value} onChange={e => setValue(e.target.value)}
              placeholder="Describe the change…"
              style={{ ...workspaceInputStyle, flex: 1, background: "var(--surface-2)" }} />
            <Button variant="primary" size="sm" icon="wand">Apply</Button>
          </div>
        </div>
      </div>

      {/* RIGHT — Suggestions + History */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
        <Panel title="AI suggestions" subtitle="5 generated post-stage · Claude"
          right={<Button variant="ghost" size="xs" icon="refresh">Regenerate</Button>}>
          <div style={{ padding: "4px 0" }}>
            {DATA.suggestions.map(s => <SuggestionCard key={s.id} s={s} />)}
          </div>
        </Panel>

        <Panel title="Edit history" subtitle="4 edits · undo with ⌘Z">
          <div style={{ padding: "4px 0" }}>
            {DATA.editHistory.map(e => (
              <div key={e.id} style={{
                padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 10,
                borderBottom: "1px solid var(--border-weak)", fontSize: 12,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 4, background: "var(--surface-3)",
                  border: "1px solid var(--border-weak)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon name={DATA.editActions.find(a => a.key === e.action)?.icon || "edit"}
                    size={11} color="var(--text-1)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--text-0)" }}>
                    <span style={{ color: "var(--text-2)" }}>{e.action}</span>{" "}
                    <span style={{ fontWeight: 500 }}>{e.target}</span>
                    {e.value && <> <span style={{ color: "var(--text-3)" }}>→</span> <span className="mono" style={{ fontSize: 11 }}>{e.value}</span></>}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>{e.time}</div>
                </div>
                <button style={{ ...iconBtn, width: 20, height: 20, border: "none", cursor: "pointer" }}>
                  <Icon name="refresh" size={11} color="var(--text-3)" />
                </button>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
};

const SuggestionCard: React.FC<{ s: Suggestion }> = ({ s }) => {
  const impactColors: Record<SuggestionImpact, string> = {
    low: "var(--text-2)",
    medium: "var(--amber)",
    high: "var(--err)",
  };
  const statusPill: Record<SuggestionStatus, React.ReactNode> = {
    pending: null,
    accepted: <Pill tone="ok" size="xs">Accepted</Pill>,
    rejected: <Pill tone="neutral" size="xs">Rejected</Pill>,
    applied: <Pill tone="ok" size="xs" icon="check">Applied</Pill>,
  };

  return (
    <div style={{
      padding: "12px 14px", borderBottom: "1px solid var(--border-weak)",
      opacity: s.status === "rejected" ? 0.5 : 1,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name={
            s.category === "lighting" ? "sun" :
            s.category === "furniture" ? "sofa" :
            s.category === "material" ? "layers" :
            s.category === "decor" ? "sparkle" : "camera"
          } size={12} color="var(--text-2)" />
          <span className="cap-sm">{s.category}</span>
          <span style={{
            fontSize: 10, color: impactColors[s.impact],
            fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            · {s.impact}
          </span>
        </div>
        {statusPill[s.status]}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-0)", marginBottom: 3 }}>{s.title}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 8 }}>{s.description}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{
          flex: 1, height: 2, background: "var(--surface-4)", borderRadius: 1,
        }}>
          <div style={{
            width: `${s.confidence * 100}%`, height: "100%",
            background: "var(--cyan)", borderRadius: 1,
          }} />
        </div>
        <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>
          {Math.round(s.confidence * 100)}% conf
        </span>
        {s.status === "pending" && (
          <>
            <Button size="xs" variant="ghost" icon="x">Reject</Button>
            <Button size="xs" variant="primary">Apply</Button>
          </>
        )}
      </div>
    </div>
  );
};

// ─── VARIANTS TAB ─────────────────────────────────────────────────────
export const VariantsTab: React.FC<{ room: Room }> = ({ room: _room }) => {
  const [compare, setCompare] = useState("v1");
  const [compareB, setCompareB] = useState("v4");
  const [sliderPos, setSliderPos] = useState(50);

  const vA = DATA.variants.find(v => v.id === compare) ?? DATA.variants[0];
  const vB = DATA.variants.find(v => v.id === compareB) ?? DATA.variants[3];

  return (
    <div style={{
      padding: 18, display: "flex", flexDirection: "column",
      gap: 14, height: "100%",
    }}>
      {/* Compare slider at top */}
      <Panel title="A / B compare" subtitle="Drag to reveal · same room, 6 style variants"
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Button variant="ghost" size="xs" icon="diff">Side-by-side</Button>
            <Button variant="ghost" size="xs" icon="eye">Overlay</Button>
          </div>
        }
      >
        <div style={{ padding: 14 }}>
          <div style={{
            position: "relative", aspectRatio: "3/1.2",
            borderRadius: 6, overflow: "hidden",
            background: "var(--surface-canvas)", cursor: "ew-resize",
          }}
            onMouseMove={e => {
              const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              setSliderPos(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
            }}
          >
            {/* B (full background) */}
            <div style={{ position: "absolute", inset: 0 }}>
              <RoomPhoto tone={vB.tone} label={vB.label} stage="B" />
            </div>
            {/* A (clipped) */}
            <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
              <RoomPhoto tone={vA.tone} label={vA.label} stage="A" />
            </div>
            {/* Handle */}
            <div style={{
              position: "absolute", top: 0, bottom: 0, left: `${sliderPos}%`,
              width: 2, background: "var(--amber)", boxShadow: "0 0 12px var(--amber)",
              transform: "translateX(-1px)",
            }}>
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                width: 32, height: 32, borderRadius: "50%",
                background: "var(--amber)", color: "#1A1407",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              }}>
                <Icon name="arrow-left" size={10} />
                <Icon name="arrow-right" size={10} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11.5 }}>
            <div>
              <span className="cap-sm">A</span>{" "}
              <select value={compare} onChange={e => setCompare(e.target.value)} style={{
                ...workspaceInputStyle, padding: "4px 6px", width: "auto",
                display: "inline-block", marginLeft: 4,
              }}>
                {DATA.variants.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <select value={compareB} onChange={e => setCompareB(e.target.value)} style={{
                ...workspaceInputStyle, padding: "4px 6px", width: "auto",
                display: "inline-block", marginRight: 4,
              }}>
                {DATA.variants.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
              <span className="cap-sm">B</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* Variant grid */}
      <Panel title="6 variants" subtitle="Generated in parallel · ~2m total"
        right={<Button icon="plus" variant="secondary" size="sm">Generate more</Button>}
      >
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
          {DATA.variants.map((v, i) => {
            const style = DATA.styles.find(s => s.key === v.style);
            return (
              <button key={v.id} style={{
                background: "var(--surface-1)",
                border: `1px solid ${v.id === compare || v.id === compareB ? "var(--amber)" : "var(--border-weak)"}`,
                borderRadius: "var(--r-md)", overflow: "hidden", textAlign: "left",
                outline: (v.id === compare || v.id === compareB) ? "1px solid var(--amber)" : "none",
                outlineOffset: -2, padding: 0, cursor: "pointer",
              }}>
                <div style={{ aspectRatio: "3/2", position: "relative" }}>
                  <RoomPhoto tone={v.tone} />
                  <span style={{
                    position: "absolute", top: 6, left: 6,
                    padding: "1px 5px", fontSize: 9, fontFamily: "var(--font-mono)",
                    background: "rgba(8,9,11,0.6)", borderRadius: 2, color: "white",
                  }}>{String(i + 1).padStart(2, "0")}</span>
                  {v.id === compare && <span style={tag("A")}>A</span>}
                  {v.id === compareB && <span style={tag("B", 30)}>B</span>}
                </div>
                <div style={{ padding: 8 }}>
                  <div style={{
                    display: "flex", gap: 1, marginBottom: 5, height: 4,
                    borderRadius: 1, overflow: "hidden",
                  }}>
                    {style?.palette.map(c => <div key={c} style={{ flex: 1, background: c }} />)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 500 }}>{v.label}</div>
                  <div className="mono" style={{ fontSize: 9.5, color: "var(--text-3)", marginTop: 1 }}>
                    quality {(0.82 + i * 0.015).toFixed(2)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Style DNA */}
      <Panel title="Style DNA" subtitle="Extract this room's aesthetic fingerprint for reuse"
        right={<Button icon="sparkle" variant="secondary" size="sm">Extract DNA</Button>}
      >
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <DnaCell label="Dominant palette">
            <div style={{ display: "flex", gap: 3 }}>
              {["#F0EAE0", "#C5B5A3", "#8B7E6B", "#6B5848"].map(c => (
                <div key={c} style={{ flex: 1, aspectRatio: "1", background: c, borderRadius: 3 }} />
              ))}
            </div>
          </DnaCell>
          <DnaCell label="Furniture language">
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-0)" }}>Soft Modernism</div>
            <div style={{ fontSize: 10.5, color: "var(--text-2)" }}>curved · tactile · muted</div>
          </DnaCell>
          <DnaCell label="Photography mood">
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-0)" }}>Warm filmic</div>
            <div style={{ fontSize: 10.5, color: "var(--text-2)" }}>3100K · low-contrast</div>
          </DnaCell>
          <DnaCell label="Spatial density">
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 600, color: "var(--text-0)", letterSpacing: "-0.02em" }}>0.62</span>
              <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>lived-in</span>
            </div>
          </DnaCell>
        </div>
      </Panel>
    </div>
  );
};

const tag = (label: string, left = 6): CSSProperties => ({
  position: "absolute", top: 6, left,
  padding: "1px 5px", fontSize: 9, fontFamily: "var(--font-mono)",
  background: "var(--amber)", color: "#1A1407",
  borderRadius: 2, fontWeight: 700,
});

const DnaCell: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="cap-sm" style={{ marginBottom: 6 }}>{label}</div>
    {children}
  </div>
);

// ─── EXPORT TAB ───────────────────────────────────────────────────────
export const ExportTab: React.FC<{ room: Room }> = ({ room }) => {
  const [format, setFormat] = useState("png");
  const [resolution, setResolution] = useState("web");
  const [include, setInclude] = useState<Record<string, boolean>>({
    main: true, variants: true, edits: false, masks: false,
  });

  return (
    <div style={{
      padding: 22, display: "grid", gridTemplateColumns: "1fr 380px",
      gap: 18,
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Panel title="Final render" subtitle="Staged · grade A · 0.87 overall">
          <div style={{ aspectRatio: "3/2", position: "relative" }}>
            <RoomPhoto tone={room.tone} />
            <WorkspaceCornerMarks />
          </div>
          {/* Quality scorecard */}
          <div style={{
            padding: 14, borderTop: "1px solid var(--border-weak)",
            display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10,
          }}>
            <QualCell label="Overall" value="0.87" grade="A" big />
            <QualCell label="Photoreal" value="0.91" />
            <QualCell label="Composition" value="0.84" />
            <QualCell label="Lighting" value="0.88" />
            <QualCell label="Color" value="0.85" />
            <QualCell label="Sacred" value="0.98" sacred />
          </div>
        </Panel>

        <Panel title="Listing book preview" subtitle="Multi-page PDF with before/after + variants">
          <div style={{ padding: 14, display: "flex", gap: 10, overflow: "auto" }}>
            {["Cover", "Before", "After", "Variants", "Details", "Floor plan"].map((p, i) => (
              <div key={p} style={{
                flexShrink: 0, width: 120, aspectRatio: "8.5/11",
                background: "white", border: "1px solid var(--border)",
                borderRadius: 3, padding: 6, fontSize: 9, color: "#1A1407",
                position: "relative", display: "flex", flexDirection: "column",
              }}>
                <div style={{
                  flex: 1,
                  background: "repeating-linear-gradient(45deg, #EEE 0 4px, #DDD 4px 8px)",
                  borderRadius: 2,
                }} />
                <div style={{ fontWeight: 600, marginTop: 4, fontSize: 8 }}>{p}</div>
                <div style={{
                  position: "absolute", top: 4, right: 4, fontSize: 7,
                  color: "#888", fontFamily: "var(--font-mono)",
                }}>P{i + 1}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Right — export config */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Panel title="Format">
          <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {DATA.exportFormats.map(f => (
              <button key={f.key} onClick={() => setFormat(f.key)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: 10,
                borderRadius: "var(--r-md)",
                background: format === f.key ? "var(--surface-3)" : "transparent",
                border: `1px solid ${format === f.key ? "var(--amber)" : "var(--border-weak)"}`,
                textAlign: "left", cursor: "pointer",
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 4,
                  background: "var(--surface-1)", border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)",
                  color: format === f.key ? "var(--amber)" : "var(--text-2)",
                }}>{f.label}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{f.label}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-2)" }}>{f.desc}</div>
                </div>
                <div style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: `1px solid ${format === f.key ? "var(--amber)" : "var(--border-strong)"}`,
                  background: format === f.key ? "var(--amber)" : "transparent",
                }} />
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Resolution">
          <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {DATA.resolutions.map(r => (
              <button key={r.key} onClick={() => setResolution(r.key)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                borderRadius: "var(--r-md)",
                background: resolution === r.key ? "var(--surface-3)" : "transparent",
                border: `1px solid ${resolution === r.key ? "var(--amber)" : "transparent"}`,
                textAlign: "left", cursor: "pointer",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{r.label}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--text-2)" }}>{r.dims}</div>
                </div>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{r.size}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Include">
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { key: "main", label: "Main render" },
              { key: "variants", label: "All 6 variants" },
              { key: "edits", label: "Edit history (4)" },
              { key: "masks", label: "Segmentation masks" },
            ].map(opt => (
              <label key={opt.key} style={{
                display: "flex", alignItems: "center", gap: 10,
                fontSize: 12, cursor: "pointer",
              }}>
                <div onClick={() => setInclude({ ...include, [opt.key]: !include[opt.key] })} style={{
                  width: 16, height: 16, borderRadius: 3,
                  background: include[opt.key] ? "var(--amber)" : "var(--surface-1)",
                  border: `1px solid ${include[opt.key] ? "var(--amber)" : "var(--border-strong)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {include[opt.key] && <Icon name="check" size={10} color="#1A1407" />}
                </div>
                <span style={{ flex: 1, color: "var(--text-1)" }}>{opt.label}</span>
              </label>
            ))}
          </div>
        </Panel>

        {/* Export CTA */}
        <div style={{
          padding: 14,
          background: "linear-gradient(180deg, var(--surface-2), var(--surface-1))",
          border: "1px solid var(--border)", borderRadius: "var(--r-lg)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span className="cap-sm">Download</span>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>~1.4 MB · 24h link</span>
          </div>
          <Button variant="primary" size="lg" icon="download" fullWidth>
            Export {format.toUpperCase()}
          </Button>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <Button variant="ghost" size="sm" icon="link" fullWidth>Copy link</Button>
            <Button variant="ghost" size="sm" icon="share" fullWidth>Share</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const QualCell: React.FC<{
  label: string; value: string;
  grade?: string; big?: boolean; sacred?: boolean;
}> = ({ label, value, grade, big, sacred }) => (
  <div>
    <div className="cap-sm" style={{ marginBottom: 4 }}>{label}</div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
      <span className="mono" style={{
        fontSize: big ? 20 : 15, fontWeight: 600,
        color: sacred ? "var(--sacred)" : big ? "var(--amber)" : "var(--text-0)",
      }}>{value}</span>
      {grade && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 2,
          background: "var(--ok)", color: "#062014",
        }}>{grade}</span>
      )}
    </div>
  </div>
);

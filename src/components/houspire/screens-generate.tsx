"use client";

// screens-generate.tsx — The theatrical pipeline view.
// Ported pixel-perfect from handoff/screens-generate.jsx. rAF animation loop
// drives the stage-morphing canvas, timeline playhead, and streaming logs.

import React, { useEffect, useRef, useState, CSSProperties } from "react";
import {
  Icon,
  Pill,
  Segment,
  Panel,
  BareRoomPhoto,
  iconBtn,
} from "./primitives";
import { DATA, Room } from "./data";

// ─── Workspace corner marks — SVG path version used across canvas ─────
// (distinct from primitives' border-div CornerMarks; matches the handoff
// generate/finish canvases and exported for reuse by screens-finish.)
export const WorkspaceCornerMarks: React.FC = () => {
  const mark = (style: CSSProperties) => (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ position: "absolute", ...style }}>
      <path d="M0 0 L8 0 M0 0 L0 8" stroke="var(--text-3)" strokeWidth="1" fill="none" />
    </svg>
  );
  return (
    <>
      {mark({ top: 10, left: 10 })}
      {mark({ top: 10, right: 10, transform: "scaleX(-1)" })}
      {mark({ bottom: 10, left: 10, transform: "scaleY(-1)" })}
      {mark({ bottom: 10, right: 10, transform: "scale(-1,-1)" })}
    </>
  );
};

// ─── Pipeline logs (stream reveals as the rAF clock ticks) ────────────
const logs: { t: string; tag: string; msg: string; lvl: "info" | "ok" | "warn" }[] = [
  { t: "00.2", tag: "init", msg: "Loaded scene context · 9 masks · 4 materials", lvl: "info" },
  { t: "00.4", tag: "M07", msg: "render-to-photo → flux-1.1-pro · steps=28", lvl: "info" },
  { t: "03.1", tag: "M07", msg: "Base render complete · SSIM 0.91", lvl: "ok" },
  { t: "04.5", tag: "M10", msg: "fitout → applying oak herringbone (conf 0.91)", lvl: "info" },
  { t: "07.8", tag: "M10", msg: "Wall limewash applied — sacred zones preserved", lvl: "ok" },
  { t: "09.2", tag: "M11", msg: "furniture → 7 items from brief plan", lvl: "info" },
  { t: "12.1", tag: "M11", msg: "Couch placement adjusted · occlusion check passed", lvl: "ok" },
  { t: "14.5", tag: "M11", msg: "Plant scale +12% — proportional to ceiling", lvl: "warn" },
  { t: "17.4", tag: "M12", msg: "exterior → Austin, TX · window-1 south-east", lvl: "info" },
  { t: "20.1", tag: "M08", msg: "lighting → 3200K · golden hour · shadows cast", lvl: "info" },
  { t: "23.8", tag: "M09", msg: "harmonize → warm filmic grade", lvl: "info" },
  { t: "25.4", tag: "Q18", msg: "Quality score 0.87 — grade A · passed", lvl: "ok" },
];

// ─── GenerateTab ──────────────────────────────────────────────────────
export const GenerateTab: React.FC<{ room: Room }> = ({ room: _room }) => {
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0); // seconds across the whole pipeline
  const [speed, setSpeed] = useState("1"); // Segment value is string
  const rafRef = useRef<number | null>(null);
  const totalDur = DATA.pipelineStages.reduce((a, s) => a + s.dur, 0);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setFrame(f => {
        const next = f + dt * parseFloat(speed) * 1.2;
        return next >= totalDur ? totalDur : next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, totalDur]);

  // Which stage are we in?
  let acc = 0;
  let activeStage = 0;
  let stageProgress = 0;
  for (let i = 0; i < DATA.pipelineStages.length; i++) {
    const d = DATA.pipelineStages[i].dur;
    if (frame <= acc + d) {
      activeStage = i;
      stageProgress = (frame - acc) / d;
      break;
    }
    acc += d;
  }
  if (frame >= totalDur) {
    activeStage = DATA.pipelineStages.length - 1;
    stageProgress = 1;
  }

  const overallPct = Math.min(100, (frame / totalDur) * 100);

  return (
    <div style={{
      padding: 18, display: "grid", gridTemplateColumns: "1fr 320px",
      gap: 14, height: "100%",
    }}>
      {/* CANVAS */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <div style={{
          flex: 1, background: "var(--surface-canvas)",
          border: "1px solid var(--border)", borderRadius: "var(--r-lg)",
          overflow: "hidden", position: "relative", minHeight: 420,
        }}>
          <WorkspaceCornerMarks />

          {/* The morphing image */}
          <div style={{ position: "absolute", inset: 36 }}>
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 4 }}>
              <StageCanvas stageIdx={activeStage} progress={stageProgress} />
            </div>

            {/* Sacred zone overlay */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              <svg viewBox="0 0 100 67" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
                <rect x="55" y="18" width="22" height="28" fill="none"
                  stroke="var(--sacred)" strokeWidth="0.15" strokeDasharray="0.6 0.4"
                  style={{ animation: "flicker 2.5s ease-in-out infinite" }} />
                <rect x="8" y="8" width="84" height="50" fill="none"
                  stroke="var(--sacred)" strokeWidth="0.08" strokeDasharray="0.3 0.3" opacity="0.4" />
              </svg>
            </div>
          </div>

          <StageEffect stageKey={DATA.pipelineStages[activeStage].key} progress={stageProgress} />

          {/* HUD: top-left stage readout */}
          <div style={{ position: "absolute", top: 14, left: 14, display: "flex", gap: 8 }}>
            <Pill tone="amber" dot="live" size="sm">
              {DATA.pipelineStages[activeStage].module}
            </Pill>
            <Pill tone="neutral" size="sm">
              <span style={{ fontFamily: "var(--font-mono)" }}>{DATA.pipelineStages[activeStage].key}</span>
            </Pill>
          </div>

          {/* HUD: top-right metrics */}
          <div style={{
            position: "absolute", top: 14, right: 14,
            background: "rgba(8,9,11,0.8)", backdropFilter: "blur(8px)",
            border: "1px solid var(--border-weak)", borderRadius: "var(--r-md)",
            padding: "6px 10px", display: "flex", gap: 14, fontSize: 10.5,
          }}>
            <Readout label="Frame" value={`${frame.toFixed(1)}s`} />
            <Readout label="VRAM" value="18.4 GB" />
            <Readout label="Tokens" value="14.8k" />
            <Readout label="Model" value="flux-pro 1.1" />
          </div>

          {/* HUD: bottom stage description + progress bar */}
          <div style={{
            position: "absolute", bottom: 14, left: 14, right: 14,
            background: "rgba(8,9,11,0.85)", backdropFilter: "blur(12px)",
            border: "1px solid var(--border-weak)", borderRadius: "var(--r-md)",
            padding: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 4,
                  background: "var(--amber-bg)", border: "1px solid var(--amber-dim)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span className="mono" style={{ fontSize: 9.5, color: "var(--amber)" }}>
                    {String(activeStage + 1).padStart(2, "0")}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{DATA.pipelineStages[activeStage].label}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-2)" }}>{DATA.pipelineStages[activeStage].desc}</div>
                </div>
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--amber)" }}>
                {Math.round(stageProgress * 100)}%
              </div>
            </div>
            <div style={{ height: 2, background: "var(--surface-4)", borderRadius: 1 }}>
              <div style={{
                width: `${stageProgress * 100}%`, height: "100%",
                background: "linear-gradient(90deg, var(--amber), oklch(0.85 0.2 65))",
                borderRadius: 1,
              }} />
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div style={{
          background: "var(--surface-2)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", padding: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <button onClick={() => setPlaying(p => !p)} style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "var(--amber)", color: "#1A1407",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", cursor: "pointer",
            }}>
              <Icon name={playing ? "pause" : "play"} size={13} />
            </button>
            <button onClick={() => setFrame(0)} style={{ ...iconBtn, color: "var(--text-1)", border: "none", cursor: "pointer" }}>
              <Icon name="refresh" size={13} />
            </button>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-1)", minWidth: 60 }}>
              {frame.toFixed(1)}s / {totalDur}s
            </span>
            <div style={{ flex: 1 }} />
            <span className="cap-sm">Speed</span>
            <Segment size="sm" value={speed} onChange={setSpeed} options={[
              { value: "0.5", label: "0.5×" },
              { value: "1", label: "1×" },
              { value: "2", label: "2×" },
              { value: "4", label: "4×" },
            ]} />
          </div>

          {/* Stage track */}
          <div style={{ position: "relative", height: 48 }}>
            <div style={{ display: "flex", gap: 2, height: "100%" }}>
              {DATA.pipelineStages.map((s, i) => {
                const done = i < activeStage;
                const active = i === activeStage;
                return (
                  <div key={s.key} style={{
                    flex: s.dur, position: "relative",
                    background: done ? "oklch(0.30 0.08 150 / 0.3)" :
                      active ? "var(--amber-bg)" : "var(--surface-1)",
                    border: `1px solid ${done ? "oklch(0.5 0.1 150 / 0.5)" : active ? "var(--amber)" : "var(--border-weak)"}`,
                    borderRadius: 4, padding: "6px 8px",
                    overflow: "hidden",
                  }}>
                    {active && (
                      <div style={{
                        position: "absolute", bottom: 0, left: 0, height: 2,
                        width: `${stageProgress * 100}%`, background: "var(--amber)",
                      }} />
                    )}
                    <div style={{
                      fontSize: 9.5, fontFamily: "var(--font-mono)",
                      color: done ? "var(--ok)" : active ? "var(--amber)" : "var(--text-3)",
                    }}>{s.module}</div>
                    <div style={{
                      fontSize: 11, fontWeight: 500, marginTop: 1,
                      color: done || active ? "var(--text-0)" : "var(--text-2)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>{s.label}</div>
                    <div style={{
                      fontSize: 9.5, marginTop: 1, color: "var(--text-3)",
                      fontFamily: "var(--font-mono)",
                    }}>{s.dur}s</div>
                  </div>
                );
              })}
            </div>
            {/* Playhead */}
            <div style={{
              position: "absolute", top: -4, bottom: -4,
              left: `${overallPct}%`, width: 2,
              background: "var(--amber)",
              boxShadow: "0 0 10px var(--amber)",
              pointerEvents: "none",
            }} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>0s</span>
            <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{totalDur}s</span>
          </div>
        </div>
      </div>

      {/* RIGHT RAIL */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
        <Panel title="Pipeline" subtitle={`${DATA.pipelineStages.length} stages · est ${totalDur}s`}
          right={<Pill tone="amber" size="xs" dot="live">Running</Pill>}
        >
          <div style={{ padding: "4px 0" }}>
            {DATA.pipelineStages.map((s, i) => {
              const done = i < activeStage;
              const active = i === activeStage;
              return (
                <div key={s.key} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 14px",
                  borderLeft: `2px solid ${done ? "var(--ok)" : active ? "var(--amber)" : "transparent"}`,
                  background: active ? "oklch(0.28 0.08 75 / 0.1)" : "transparent",
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    marginTop: 1,
                    background: done ? "oklch(0.55 0.14 150)" : active ? "var(--amber)" : "var(--surface-3)",
                    border: done ? "none" : active ? "none" : "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {done ? <Icon name="check" size={10} color="#0B2010" /> :
                      active ? (
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: "#1A1407",
                          animation: "pulse-dot 1.2s ease-in-out infinite",
                        }} />
                      ) :
                        <span className="mono" style={{ fontSize: 9.5, color: "var(--text-3)" }}>{i + 1}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: done || active ? "var(--text-0)" : "var(--text-2)" }}>
                        {s.label}
                      </span>
                      <span className="mono" style={{ fontSize: 9.5, color: "var(--text-3)" }}>{s.module}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--text-2)", marginTop: 2 }}>{s.desc}</div>
                    {active && (
                      <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span className="mono" style={{
                          fontSize: 9.5, padding: "2px 5px",
                          background: "var(--amber-bg)", color: "var(--amber)",
                          border: "1px solid var(--amber-dim)", borderRadius: 2,
                        }}>{Math.round(stageProgress * 100)}%</span>
                        <span className="mono" style={{ fontSize: 9.5, color: "var(--text-3)" }}>
                          eta {((1 - stageProgress) * s.dur).toFixed(1)}s
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Logs" subtitle="Verbose — filtered">
          <div style={{
            padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 10,
            maxHeight: 160, overflow: "auto", lineHeight: 1.55,
          }}>
            {logs.slice(0, Math.min(logs.length, Math.floor(frame * 2.4) + 4)).map((l, i) => (
              <div key={i} style={{
                color: l.lvl === "ok" ? "var(--ok)" : l.lvl === "warn" ? "var(--warn)" : "var(--text-2)",
                display: "flex", gap: 6,
              }}>
                <span style={{ color: "var(--text-3)" }}>{l.t}</span>
                <span style={{
                  color: l.lvl === "ok" ? "var(--ok)" : l.lvl === "warn" ? "var(--warn)" : "var(--cyan)",
                  width: 36, flexShrink: 0,
                }}>{l.tag}</span>
                <span style={{ flex: 1 }}>{l.msg}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Guardrails">
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <GuardItem icon="shield" label="Sacred zones" value="6 locked" tone="sacred" />
            <GuardItem icon="eye" label="Hallucination check" value="clean" tone="ok" />
            <GuardItem icon="lock" label="Prompt injection" value="sanitized" tone="ok" />
            <GuardItem icon="zap" label="Fallback model" value="armed" tone="amber" />
          </div>
        </Panel>
      </div>
    </div>
  );
};

// ─── Small atoms used by GenerateTab ──────────────────────────────────
const GuardItem: React.FC<{
  icon: string; label: string; value: string;
  tone: "sacred" | "ok" | "amber" | "cyan";
}> = ({ icon, label, value, tone }) => {
  const colors: Record<string, string> = {
    sacred: "var(--sacred)", ok: "var(--ok)",
    amber: "var(--amber)", cyan: "var(--cyan)",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
      <Icon name={icon} size={13} color={colors[tone]} />
      <span style={{ flex: 1, color: "var(--text-1)" }}>{label}</span>
      <span className="mono" style={{ fontSize: 10.5, color: colors[tone] }}>{value}</span>
    </div>
  );
};

const Readout: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="cap-sm" style={{ fontSize: 8.5, marginBottom: 1 }}>{label}</div>
    <div className="mono" style={{ fontSize: 11, color: "var(--text-0)" }}>{value}</div>
  </div>
);

// ─── StageCanvas — composite the image layer-by-layer as stages progress
const StageCanvas: React.FC<{ stageIdx: number; progress: number }> = ({ stageIdx, progress }) => {
  // stageIdx 0: empty -> photoreal empty room
  // stageIdx 1: + fitout (floor/wall materials)
  // stageIdx 2: + furniture silhouettes
  // stageIdx 3: + exterior window view
  // stageIdx 4: + lighting (warm golden hour)
  // stageIdx 5: + harmonize (final grade)
  const opacity = (forStage: number) => {
    if (stageIdx > forStage) return 1;
    if (stageIdx === forStage) return progress;
    return 0;
  };

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* Base: bare room */}
      <div style={{ position: "absolute", inset: 0 }}>
        <BareRoomPhoto />
      </div>
      {/* Stage 0: photo-realistic warm-up over bare room */}
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(180deg, rgba(80,70,60,${0.3 * opacity(0)}), rgba(30,20,15,${0.25 * opacity(0)}))`,
      }} />

      {/* Stage 1: fitout (herringbone floor + wall limewash) */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "35%",
        opacity: opacity(1),
        background: `repeating-linear-gradient(45deg, #5B4029 0 8px, #6A4B30 8px 16px, #4A3422 16px 24px), #5B4029`,
        transition: "opacity 200ms",
        mixBlendMode: "multiply",
      }} />
      <div style={{
        position: "absolute", inset: 0, opacity: opacity(1) * 0.3,
        background: "linear-gradient(180deg, #E6DDC8 0%, #C5B5A3 60%, transparent 62%)",
        mixBlendMode: "soft-light",
      }} />

      {/* Stage 2: furniture silhouettes */}
      <div style={{ position: "absolute", inset: 0, opacity: opacity(2), transition: "opacity 300ms" }}>
        {/* Sofa */}
        <div style={{
          position: "absolute", bottom: "18%", left: "8%", width: "42%", height: "26%",
          background: "linear-gradient(to top, #3E2E22, #6B5848)",
          borderRadius: "6px 6px 3px 3px",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.4)",
        }} />
        {/* Rug */}
        <div style={{
          position: "absolute", bottom: "12%", left: "20%", width: "55%", height: "8%",
          background: "radial-gradient(ellipse, #8A7860 0%, #5C4D3A 80%)",
          opacity: 0.7, borderRadius: 999,
        }} />
        {/* Coffee table */}
        <div style={{
          position: "absolute", bottom: "16%", left: "28%", width: "18%", height: "6%",
          background: "linear-gradient(to bottom, #C5B5A3, #8A7860)",
          borderRadius: 999,
        }} />
        {/* Plant */}
        <div style={{
          position: "absolute", bottom: "16%", right: "14%", width: "10%", height: "34%",
          background: "linear-gradient(to top, #2A3820, #4A5830)",
          borderRadius: "60% 60% 40% 40%",
          opacity: 0.85,
        }} />
        {/* Lamp */}
        <div style={{
          position: "absolute", top: "28%", left: "3%", width: "1%", height: "42%",
          background: "#8A7860",
        }} />
      </div>

      {/* Stage 3: exterior window view */}
      <div style={{
        position: "absolute", top: "18%", left: "58%", width: "22%", height: "38%",
        opacity: opacity(3), transition: "opacity 300ms",
        background: `linear-gradient(180deg,
          #E8D3B0 0%,
          #C89868 30%,
          #8B5A2B 55%,
          #3E3220 100%)`,
        boxShadow: "0 0 80px rgba(255, 200, 140, 0.6)",
      }} />

      {/* Stage 4: lighting (warm tint + vignette) */}
      <div style={{
        position: "absolute", inset: 0, opacity: opacity(4) * 0.4,
        background: "radial-gradient(ellipse at 70% 30%, rgba(255, 210, 140, 0.6) 0%, transparent 55%)",
        mixBlendMode: "screen",
      }} />
      <div style={{
        position: "absolute", inset: 0, opacity: opacity(4) * 0.3,
        background: "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.4) 100%)",
      }} />

      {/* Stage 5: harmonize (final color-grade lift) */}
      <div style={{
        position: "absolute", inset: 0, opacity: opacity(5) * 0.25,
        background: "linear-gradient(180deg, rgba(255,230,180,0.3), rgba(40,20,10,0.2))",
        mixBlendMode: "overlay",
      }} />
    </div>
  );
};

// ─── StageEffect — stage-specific overlay (scan line, grid, particles) ─
const StageEffect: React.FC<{ stageKey: string; progress: number }> = ({ stageKey, progress }) => {
  const scan = (
    <div style={{
      position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none",
    }}>
      <div style={{
        position: "absolute", left: 0, right: 0, height: 60,
        background: `linear-gradient(180deg,
          transparent 0%,
          oklch(0.78 0.17 75 / 0.15) 48%,
          oklch(0.78 0.17 75 / 0.35) 50%,
          oklch(0.78 0.17 75 / 0.15) 52%,
          transparent 100%)`,
        top: `${progress * 100}%`,
        transform: "translateY(-50%)",
        mixBlendMode: "screen",
      }} />
    </div>
  );

  const grid = (
    <div style={{
      position: "absolute", inset: 36, pointerEvents: "none", opacity: 0.4,
      backgroundImage: `
        linear-gradient(to right, oklch(0.78 0.12 210 / 0.15) 1px, transparent 1px),
        linear-gradient(to bottom, oklch(0.78 0.12 210 / 0.15) 1px, transparent 1px)
      `,
      backgroundSize: "40px 40px",
    }} />
  );

  const particles = (
    <svg viewBox="0 0 100 67" preserveAspectRatio="none"
      style={{ position: "absolute", inset: 36, pointerEvents: "none" }}>
      {[...Array(20)].map((_, i) => {
        const x = (i * 37) % 100;
        const y = ((i * 23) + Math.sin(i + progress * 8) * 10) % 67;
        return <circle key={i} cx={x} cy={y} r={0.4} fill="var(--amber)" opacity={0.6} />;
      })}
    </svg>
  );

  if (stageKey === "render-to-photo" || stageKey === "fitout") return scan;
  if (stageKey === "furniture") return <>{scan}{grid}</>;
  if (stageKey === "exterior") return grid;
  if (stageKey === "lighting") return particles;
  if (stageKey === "harmonize") return null;
  return null;
};

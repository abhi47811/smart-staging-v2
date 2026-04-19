"use client";

// screens-room.tsx — The core room workspace: Source / Brief / Analyze /
// Generate / Edit / Variants / Export tab shell. Ported pixel-perfect from
// handoff/screens-room.jsx. GenerateTab / EditTab / VariantsTab / ExportTab
// live in sibling files so the ported workspace composes cleanly.

import React, { useState, CSSProperties } from "react";
import {
  Icon,
  Button,
  Pill,
  Panel,
  Divider,
  Segment,
  Slider,
  Swatch,
  RoomPhoto,
  BareRoomPhoto,
  iconBtn,
} from "./primitives";
import { DATA, Room, Project } from "./data";
import { statusConfig } from "./screens-projects";
import { GenerateTab } from "./screens-generate";
import { EditTab, VariantsTab, ExportTab } from "./screens-finish";

// ─── Room tab definitions ────────────────────────────────────────────
const ROOM_TABS = [
  { key: "source", label: "Source", icon: "image" },
  { key: "brief", label: "Brief", icon: "sparkle" },
  { key: "analyze", label: "Analyze", icon: "layers" },
  { key: "generate", label: "Generate", icon: "wand" },
  { key: "edit", label: "Edit", icon: "edit" },
  { key: "variants", label: "Variants", icon: "copy" },
  { key: "export", label: "Export", icon: "download" },
] as const;

export type RoomTabKey = (typeof ROOM_TABS)[number]["key"];

// Local input style — matches handoff screens-room.jsx local inputStyle
// (padding 7px 10px, r-sm, font-sans, vertical resize). Distinct from
// primitives.inputStyle which is height-30/r-md for shell inputs.
const roomInputStyle: CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: 12,
  color: "var(--text-0)",
  background: "var(--surface-1)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-sm)",
  fontFamily: "var(--font-sans)",
  resize: "vertical",
  outline: "none",
};

// ─── RoomWorkspace (top-level tab shell) ─────────────────────────────
export const RoomWorkspace: React.FC<{
  project: Project;
  room: Room;
  initialTab?: RoomTabKey;
  onBack?: () => void;
}> = ({ project, room, initialTab = "generate", onBack }) => {
  const [tab, setTab] = useState<RoomTabKey>(initialTab);
  const status = statusConfig[room.status];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--surface-0)",
      }}
    >
      {/* Room header */}
      <div
        style={{
          padding: "12px 22px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          borderBottom: "1px solid var(--border-weak)",
          background: "var(--surface-1)",
        }}
      >
        <button
          onClick={onBack}
          style={{
            ...iconBtn,
            color: "var(--text-2)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Icon name="arrow-left" size={14} />
        </button>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <RoomPhoto tone={room.tone} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{room.label}</div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-2)",
              textTransform: "capitalize",
            }}
          >
            {room.type.replace("_", " ")} · {project.name}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Pill tone={status.tone} dot={status.dot}>
          {status.label}
        </Pill>
        <Divider vertical style={{ height: 22 }} />
        <Button icon="diff" variant="ghost" size="sm">
          Compare
        </Button>
        <Button icon="share" variant="ghost" size="sm">
          Share
        </Button>
        <Button icon="download" variant="secondary" size="sm">
          Export
        </Button>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          borderBottom: "1px solid var(--border-weak)",
          background: "var(--surface-1)",
          gap: 2,
          height: 36,
        }}
      >
        {ROOM_TABS.map((t, i) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                height: 32,
                padding: "0 12px",
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                color: active ? "var(--text-0)" : "var(--text-2)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                position: "relative",
                borderRadius: "var(--r-sm)",
                background: active ? "var(--surface-3)" : "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              <span
                className="mono"
                style={{ fontSize: 9.5, color: "var(--text-3)" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <Icon
                name={t.icon}
                size={12}
                color={active ? "var(--amber)" : "currentColor"}
              />
              {t.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <span className="cap-sm">Run · 24b8f</span>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--surface-0)",
        }}
      >
        {tab === "source" && <SourceTab room={room} />}
        {tab === "brief" && <BriefTab room={room} />}
        {tab === "analyze" && <AnalyzeTab room={room} />}
        {tab === "generate" && <GenerateTab room={room} />}
        {tab === "edit" && <EditTab room={room} />}
        {tab === "variants" && <VariantsTab room={room} />}
        {tab === "export" && <ExportTab room={room} />}
      </div>
    </div>
  );
};

// ─── SOURCE TAB ──────────────────────────────────────────────────────
export const SourceTab: React.FC<{ room: Room }> = ({ room }) => {
  return (
    <div
      style={{
        padding: 22,
        display: "grid",
        gridTemplateColumns: "1fr 320px",
        gap: 18,
      }}
    >
      <div>
        <Panel
          title="Source image"
          subtitle="IMG_4821.jpg · 5760×3840 · 4.2 MB"
          right={
            <div style={{ display: "flex", gap: 6 }}>
              <Button icon="refresh" variant="ghost" size="xs">
                Replace
              </Button>
              <Button icon="crop" variant="ghost" size="xs">
                Crop
              </Button>
            </div>
          }
        >
          <div style={{ aspectRatio: "3/2", position: "relative" }}>
            <BareRoomPhoto />
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                display: "flex",
                gap: 6,
              }}
            >
              <Pill tone="neutral" size="xs" icon="camera">
                24mm · f/5.6
              </Pill>
              <Pill tone="neutral" size="xs">
                sRGB
              </Pill>
              <Pill tone="neutral" size="xs">
                3:2
              </Pill>
            </div>
          </div>
          {/* EXIF strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              padding: "10px 14px",
              fontSize: 11,
              borderTop: "1px solid var(--border-weak)",
            }}
          >
            <KV k="Camera" v="Sony A7R IV" />
            <KV k="ISO" v="400" />
            <KV k="Shutter" v="1/125" />
            <KV k="Captured" v="Apr 18, 3:42p" />
          </div>
        </Panel>

        <div style={{ marginTop: 16 }}>
          <Panel
            title="Upload drop zone"
            subtitle="Drag & drop, or bulk-upload up to 12 rooms"
          >
            <div style={{ padding: 14 }}>
              <div
                style={{
                  border: "1px dashed var(--border-strong)",
                  borderRadius: "var(--r-md)",
                  padding: "32px 20px",
                  textAlign: "center",
                  background: "var(--surface-1)",
                }}
              >
                <Icon name="upload" size={22} color="var(--text-2)" />
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    marginTop: 8,
                  }}
                >
                  Drop images here
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-2)",
                    marginTop: 2,
                  }}
                >
                  JPG, PNG, TIFF, HEIC · up to 40 MB each · RAW supported via conversion
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "center",
                    marginTop: 14,
                  }}
                >
                  <Button variant="secondary" size="sm" icon="upload">
                    Browse files
                  </Button>
                  <Button variant="ghost" size="sm" icon="link">
                    Paste URL
                  </Button>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* Right rail */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Panel title="Room details">
          <div
            style={{
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <Field label="Label" value={room.label} />
            <Field label="Room type" value="Living Room" />
            <Field label="Orientation" value="South-east" />
            <Field label="Aspect ratio" value="3:2" />
            <Field
              label="Notes"
              value="Owner wants warm, inviting — no cool tones."
              textarea
            />
          </div>
        </Panel>

        <Panel title="Preflight checks" subtitle="Run before generate">
          <div style={{ padding: "4px 0" }}>
            {(
              [
                { label: "Resolution ≥ 1920px", ok: true },
                { label: "Single empty room", ok: true },
                { label: "No flash shadows", ok: true },
                {
                  label: "Horizon within ±3°",
                  ok: false,
                  warn: true,
                  note: "+1.8° tilt",
                },
                { label: "No reflective glass", ok: true },
              ] as {
                label: string;
                ok: boolean;
                warn?: boolean;
                note?: string;
              }[]
            ).map((c) => (
              <div
                key={c.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  fontSize: 12,
                }}
              >
                <Icon
                  name={c.ok ? "check" : "warning"}
                  size={13}
                  color={c.ok ? "var(--ok)" : "var(--warn)"}
                />
                <span
                  style={{
                    flex: 1,
                    color: c.ok ? "var(--text-1)" : "var(--text-0)",
                  }}
                >
                  {c.label}
                </span>
                {c.note && (
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: "var(--warn)" }}
                  >
                    {c.note}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
};

// ─── Small helpers used across the tabs ──────────────────────────────
const KV: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div>
    <div className="cap-sm">{k}</div>
    <div
      className="mono"
      style={{ fontSize: 11, color: "var(--text-0)", marginTop: 2 }}
    >
      {v}
    </div>
  </div>
);

const Field: React.FC<{
  label: string;
  value: string;
  textarea?: boolean;
}> = ({ label, value, textarea }) => (
  <div>
    <div className="cap-sm" style={{ marginBottom: 5 }}>
      {label}
    </div>
    {textarea ? (
      <textarea defaultValue={value} rows={3} style={roomInputStyle} />
    ) : (
      <input defaultValue={value} style={roomInputStyle} />
    )}
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div style={{ marginBottom: 14 }}>
    <div className="cap-sm" style={{ marginBottom: 8 }}>
      {title}
    </div>
    {children}
  </div>
);

// ─── BRIEF TAB ───────────────────────────────────────────────────────
export const BriefTab: React.FC<{ room: Room }> = ({ room: _room }) => {
  const [selectedStyle, setSelectedStyle] = useState<string>(
    "modern_contemporary"
  );
  const [prompt, setPrompt] = useState<string>(
    "Make this feel warm and inviting — think slow Sunday mornings. A walnut sideboard, a low linen sofa in oat, a sculptural floor lamp, and a wool rug with subtle herringbone. South-facing so lean into golden-hour tones."
  );
  const [budget, setBudget] = useState<string>("premium");
  const [timeOfDay, setTimeOfDay] = useState<string>("golden_hour");
  const [density, setDensity] = useState<number>(62);
  const [saturation, setSaturation] = useState<number>(38);

  return (
    <div
      style={{
        padding: 22,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 18,
      }}
    >
      {/* LEFT — input */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Panel
          title="Design brief"
          subtitle="Natural language. Claude converts this to a structured scene specification."
          right={
            <Pill tone="cyan" size="xs" icon="shield">
              Injection-safe
            </Pill>
          }
        >
          <div style={{ padding: 14 }}>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              style={{
                ...roomInputStyle,
                fontSize: 12.5,
                lineHeight: 1.55,
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 8,
              }}
            >
              <span
                className="mono"
                style={{ fontSize: 10, color: "var(--text-3)" }}
              >
                {prompt.length} / 4000 chars · sanitized against 9 injection patterns
              </span>
              <Button icon="sparkle" variant="ghost" size="xs">
                Improve with AI
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title="Style preset">
          <div
            style={{
              padding: 12,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
            }}
          >
            {DATA.styles.map((s) => {
              const active = selectedStyle === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSelectedStyle(s.key)}
                  style={{
                    padding: 10,
                    borderRadius: "var(--r-md)",
                    background: active ? "var(--surface-4)" : "var(--surface-1)",
                    border: `1px solid ${
                      active ? "var(--amber)" : "var(--border-weak)"
                    }`,
                    textAlign: "left",
                    cursor: "pointer",
                    outline: active ? "1px solid var(--amber)" : "none",
                    outlineOffset: -2,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 2,
                      marginBottom: 8,
                      height: 18,
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    {s.palette.map((c) => (
                      <div key={c} style={{ flex: 1, background: c }} />
                    ))}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: 500,
                      color: "var(--text-0)",
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 9.5,
                      color: "var(--text-3)",
                      marginTop: 1,
                    }}
                  >
                    {s.key}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Constraints">
          <div
            style={{
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div>
              <div className="cap-sm" style={{ marginBottom: 6 }}>
                Budget tier
              </div>
              <Segment
                value={budget}
                onChange={setBudget}
                options={[
                  { value: "economy", label: "Economy" },
                  { value: "mid-range", label: "Mid-range" },
                  { value: "premium", label: "Premium" },
                  { value: "luxury", label: "Luxury" },
                ]}
              />
            </div>
            <Slider
              label="Spatial density"
              value={density}
              onChange={setDensity}
              format={(v) => `${v}% — lived-in`}
            />
            <Slider
              label="Color saturation"
              value={saturation}
              onChange={setSaturation}
              format={(v) => `${v}% — muted`}
            />
            <div>
              <div className="cap-sm" style={{ marginBottom: 6 }}>
                Time of day
              </div>
              <Segment
                value={timeOfDay}
                onChange={setTimeOfDay}
                options={[
                  { value: "midday", label: "Midday", icon: "sun" },
                  { value: "golden_hour", label: "Golden", icon: "sun" },
                  { value: "twilight", label: "Twilight", icon: "moon" },
                  { value: "evening", label: "Evening", icon: "moon" },
                ]}
              />
            </div>
          </div>
        </Panel>
      </div>

      {/* RIGHT — parsed brief */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Panel
          title="Structured brief"
          subtitle="Generated by Claude · v3 · 2m ago"
          right={
            <Pill tone="ok" size="xs" icon="check">
              Validated
            </Pill>
          }
        >
          <div style={{ padding: 14 }}>
            <Section title="Style">
              <div style={{ fontSize: 12.5, color: "var(--text-0)" }}>
                Modern Contemporary{" "}
                <span style={{ color: "var(--text-3)" }}>—</span> Soft
                Modernism{" "}
                <span style={{ color: "var(--text-3)" }}>— 2020s</span>
              </div>
            </Section>
            <Section title="Color palette">
              <div style={{ display: "flex", gap: 14 }}>
                <Swatch color="#F0EAE0" label="Dominant" pct={54} />
                <Swatch color="#C5B5A3" label="Secondary" pct={28} />
                <Swatch color="#6B5848" label="Accent" pct={18} />
              </div>
            </Section>
            <Section title="Furniture plan">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {[
                  "sofa — modular sectional — linen, oat",
                  "rug — low-pile wool — herringbone",
                  "coffee table — travertine — round",
                  "floor lamp — brushed brass arc",
                  "sideboard — walnut — ribbed fronts",
                  "plant — fiddle leaf fig — terracotta pot",
                  "art — abstract diptych — muted earth tones",
                ].map((t) => (
                  <span
                    key={t}
                    style={{
                      padding: "3px 7px",
                      background: "var(--surface-1)",
                      border: "1px solid var(--border-weak)",
                      borderRadius: 3,
                      fontSize: 11,
                      color: "var(--text-1)",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Section>
            <Section title="Photography">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 8,
                  fontSize: 11,
                }}
              >
                <KV k="Lens" v="24mm" />
                <KV k="Aperture" v="f/5.6" />
                <KV k="White balance" v="3100K" />
                <KV k="Grade" v="Warm filmic" />
              </div>
            </Section>
          </div>
        </Panel>
      </div>
    </div>
  );
};

// ─── ANALYZE TAB ─────────────────────────────────────────────────────
export const AnalyzeTab: React.FC<{ room: Room }> = ({ room: _room }) => {
  const [layer, setLayer] = useState<string>("seg");

  return (
    <div
      style={{
        padding: 22,
        display: "grid",
        gridTemplateColumns: "1fr 340px",
        gap: 18,
      }}
    >
      <Panel
        title="Scene analysis"
        subtitle="Depth · segmentation · lighting · materials — computed"
        right={
          <Segment
            value={layer}
            onChange={setLayer}
            size="sm"
            options={[
              { value: "seg", label: "Segmentation", icon: "layers" },
              { value: "depth", label: "Depth", icon: "wave" },
              { value: "light", label: "Lighting", icon: "sun" },
            ]}
          />
        }
      >
        <div
          style={{
            aspectRatio: "3/2",
            position: "relative",
            background: "var(--surface-canvas)",
          }}
        >
          <BareRoomPhoto />
          {/* Overlay layer */}
          <div style={{ position: "absolute", inset: 0 }}>
            {layer === "seg" && <SegOverlay />}
            {layer === "depth" && <DepthOverlay />}
            {layer === "light" && <LightOverlay />}
          </div>

          {/* Mask legend */}
          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: 12,
              right: 12,
              padding: 10,
              background: "rgba(8,9,11,0.82)",
              backdropFilter: "blur(12px)",
              border: "1px solid var(--border-weak)",
              borderRadius: "var(--r-md)",
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {DATA.masks.map((m) => (
              <span
                key={m.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 7px",
                  background: m.sacred
                    ? "oklch(0.28 0.12 15 / 0.4)"
                    : "oklch(0.26 0.08 200 / 0.4)",
                  border: `1px solid ${
                    m.sacred ? "var(--sacred)" : "var(--cyan-dim)"
                  }`,
                  borderRadius: 3,
                  fontSize: 10.5,
                  color: m.sacred ? "var(--sacred)" : "var(--cyan)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {m.sacred && <Icon name="lock" size={9} />}
                {m.label}
                <span style={{ opacity: 0.7 }}>{(m.conf * 100).toFixed(0)}</span>
              </span>
            ))}
          </div>
        </div>
      </Panel>

      {/* Right rail */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Panel
          title="Sacred zones"
          subtitle="Never altered — doors, windows, architecture"
          right={
            <Pill tone="sacred" size="xs" icon="lock">
              6 locked
            </Pill>
          }
        >
          <div style={{ padding: "4px 0" }}>
            {DATA.masks
              .filter((m) => m.sacred)
              .map((m) => (
                <div
                  key={m.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 14px",
                    fontSize: 11.5,
                  }}
                >
                  <Icon name="lock" size={11} color="var(--sacred)" />
                  <span style={{ flex: 1, color: "var(--text-1)" }}>
                    {m.label}
                  </span>
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: "var(--text-3)" }}
                  >
                    {(m.conf * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
          </div>
        </Panel>

        <Panel title="Materials detected">
          <div
            style={{
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {DATA.materials.map((m) => (
              <div key={m.surface} style={{ fontSize: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      textTransform: "capitalize",
                      color: "var(--text-2)",
                    }}
                  >
                    {m.surface}
                  </span>
                  <span style={{ color: "var(--text-0)", fontWeight: 500 }}>
                    {m.material}
                  </span>
                </div>
                <div
                  style={{
                    height: 2,
                    background: "var(--surface-4)",
                    borderRadius: 1,
                  }}
                >
                  <div
                    style={{
                      width: `${m.conf * 100}%`,
                      height: "100%",
                      background: "var(--cyan)",
                      borderRadius: 1,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Lighting">
          <div
            style={{
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <KV k="Dominant direction" v="West — 38° above horizon" />
            <KV k="Color temperature" v="3200K — warm" />
            <KV k="Ambient" v="42%" />
            <KV k="Sources" v="2 detected (window, ceiling)" />
          </div>
        </Panel>
      </div>
    </div>
  );
};

// ─── Segmentation / Depth / Lighting overlays ─────────────────────────
const SegOverlay: React.FC = () => (
  <svg
    viewBox="0 0 300 200"
    preserveAspectRatio="none"
    style={{ width: "100%", height: "100%" }}
  >
    {/* Floor */}
    <polygon
      points="0,140 300,130 300,200 0,200"
      fill="oklch(0.55 0.15 200 / 0.35)"
      stroke="var(--cyan)"
      strokeWidth="0.5"
    />
    {/* Back wall */}
    <polygon
      points="30,40 270,40 300,130 0,140"
      fill="oklch(0.55 0.15 15 / 0.3)"
      stroke="var(--sacred)"
      strokeWidth="0.5"
    />
    {/* Left wall */}
    <polygon
      points="0,0 30,40 0,140"
      fill="oklch(0.55 0.15 15 / 0.3)"
      stroke="var(--sacred)"
      strokeWidth="0.5"
    />
    {/* Right wall */}
    <polygon
      points="270,40 300,0 300,130"
      fill="oklch(0.55 0.15 15 / 0.3)"
      stroke="var(--sacred)"
      strokeWidth="0.5"
    />
    {/* Ceiling */}
    <polygon
      points="0,0 30,40 270,40 300,0"
      fill="oklch(0.60 0.1 15 / 0.3)"
      stroke="var(--sacred)"
      strokeWidth="0.5"
    />
    {/* Window */}
    <rect
      x="170"
      y="60"
      width="70"
      height="65"
      fill="oklch(0.7 0.15 70 / 0.45)"
      stroke="var(--amber)"
      strokeWidth="0.8"
    />
  </svg>
);

const DepthOverlay: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      mixBlendMode: "screen",
      background:
        "linear-gradient(135deg, rgba(40,80,180,0.6) 0%, rgba(80,200,230,0.5) 40%, rgba(255,240,180,0.4) 75%, rgba(255,200,120,0.5) 100%)",
    }}
  />
);

const LightOverlay: React.FC = () => (
  <div style={{ position: "absolute", inset: 0 }}>
    <div
      style={{
        position: "absolute",
        top: "20%",
        left: "60%",
        width: 80,
        height: 80,
        background:
          "radial-gradient(circle, rgba(255,200,120,0.6) 0%, transparent 70%)",
      }}
    />
    <svg
      viewBox="0 0 300 200"
      preserveAspectRatio="none"
      style={{ width: "100%", height: "100%" }}
    >
      {[...Array(10)].map((_, i) => (
        <line
          key={i}
          x1={200 + i * 5}
          y1="80"
          x2={50 + i * 25}
          y2="190"
          stroke="oklch(0.8 0.15 70 / 0.35)"
          strokeWidth="0.5"
          strokeDasharray="2 3"
        />
      ))}
    </svg>
  </div>
);

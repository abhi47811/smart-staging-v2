"use client";

// screens-projects.tsx — Ported from handoff/screens-projects.jsx.
// Contains ProjectsScreen (list) and ProjectDetailScreen (single project),
// plus the helper atoms Stat, StatBig, RoomCard, and the statusConfig map
// that's re-used across room cards in other screens.

import React, { useState, CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  Icon,
  Button,
  Pill,
  PillTone,
  Kbd,
  Segment,
  RoomPhoto,
  BareRoomPhoto,
  iconBtn,
} from "./primitives";
import { DATA, Project, Room, RoomStatus } from "./data";

// ─── Status config — shared with room workspace screens ──────────────
export const statusConfig: Record<
  RoomStatus,
  { tone: PillTone; label: string; dot: false | "live" }
> = {
  staged: { tone: "ok", label: "Staged", dot: false },
  generating: { tone: "amber", label: "Generating", dot: "live" },
  analyzing: { tone: "cyan", label: "Analyzing", dot: "live" },
  draft: { tone: "neutral", label: "Draft", dot: false },
  uploaded: { tone: "neutral", label: "Uploaded", dot: false },
  error: { tone: "err", label: "Error", dot: false },
};

// ─── Small stat cluster used inside ProjectCard ──────────────────────
export const Stat: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div>
    <div
      className={mono ? "mono" : ""}
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: "var(--text-0)",
        letterSpacing: mono ? 0 : "-0.01em",
      }}
    >
      {value}
    </div>
    <div className="cap-sm" style={{ marginTop: 1 }}>
      {label}
    </div>
  </div>
);

// ─── Big stat cell used inside ProjectDetail stats strip ─────────────
type StatBigTone = "neutral" | "ok" | "amber";
export const StatBig: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: StatBigTone;
}> = ({ label, value, sub, tone = "neutral" }) => {
  const colors: Record<StatBigTone, string> = {
    neutral: "var(--text-0)",
    ok: "var(--ok)",
    amber: "var(--amber)",
  };
  return (
    <div>
      <div className="cap-sm" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: colors[tone],
            letterSpacing: "-0.02em",
          }}
        >
          {value}
        </span>
        {sub && (
          <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
};

// ─── Room card used in ProjectDetail + elsewhere ─────────────────────
export const RoomCard: React.FC<{ room: Room; onOpen?: () => void }> = ({ room, onOpen }) => {
  const cfg = statusConfig[room.status];
  return (
    <button
      onClick={onOpen}
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
        textAlign: "left",
        cursor: "pointer",
        padding: 0,
        width: "100%",
      } as CSSProperties}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      <div style={{ position: "relative", height: 150 }}>
        {room.status === "uploaded" || room.status === "draft" ? (
          <BareRoomPhoto />
        ) : (
          <RoomPhoto tone={room.tone} />
        )}
        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 6 }}>
          <Pill tone={cfg.tone} dot={cfg.dot} size="xs">
            {cfg.label}
          </Pill>
        </div>
        {room.status === "generating" && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 2,
              background: "var(--surface-4)",
            }}
          >
            <div
              style={{
                height: "100%",
                width: "62%",
                background: "var(--amber)",
                animation: "flicker 1.2s ease-in-out infinite",
              }}
            />
          </div>
        )}
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{room.label}</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>
            {room.id.toUpperCase()}
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-2)",
            marginTop: 2,
            textTransform: "capitalize",
          }}
        >
          {room.type.replace("_", " ")}
        </div>
      </div>
    </button>
  );
};

// ─── Projects list screen ────────────────────────────────────────────
export const ProjectsScreen: React.FC = () => {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("recent");

  const filtered = DATA.projects.filter(
    p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.city.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={{ padding: "20px 28px 40px", minHeight: "100%" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <div className="cap" style={{ marginBottom: 6 }}>
            Workspace
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
            Projects
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-2)", margin: "4px 0 0" }}>
            {DATA.projects.length} active · 248 rooms staged this month · 12 in progress
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button icon="download" variant="ghost" size="md">
            Export batch
          </Button>
          <Button icon="plus" variant="primary" size="md">
            New project
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div
          style={{
            flex: 1,
            maxWidth: 380,
            height: 30,
            padding: "0 10px",
            background: "var(--surface-2)",
            border: "1px solid var(--border-weak)",
            borderRadius: "var(--r-md)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="search" size={13} color="var(--text-2)" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search projects, cities, clients…"
            style={{
              flex: 1,
              fontSize: 12.5,
              color: "var(--text-0)",
              background: "transparent",
              border: "none",
              outline: "none",
            }}
          />
          <Kbd>/</Kbd>
        </div>
        <Segment
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "completed", label: "Done" },
            { value: "archive", label: "Archive" },
          ]}
        />
        <div style={{ flex: 1 }} />
        <span className="cap-sm">Sort</span>
        <Segment
          value={sort}
          onChange={setSort}
          options={[
            { value: "recent", label: "Recent" },
            { value: "name", label: "A–Z" },
            { value: "status", label: "Status" },
          ]}
        />
        <Segment
          value={view}
          onChange={v => setView(v as "grid" | "list")}
          options={[
            { value: "grid", icon: "grid", label: "" },
            { value: "list", icon: "list", label: "" },
          ]}
        />
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: view === "grid" ? "repeat(auto-fill, minmax(300px, 1fr))" : "1fr",
        }}
      >
        {filtered.map((p: Project) => (
          <button
            key={p.id}
            onClick={() => router.push(`/projects/${p.id}`)}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)",
              overflow: "hidden",
              textAlign: "left",
              boxShadow: "var(--shadow-panel)",
              cursor: "pointer",
              transition: "border-color 120ms, transform 120ms",
              padding: 0,
              width: "100%",
            } as CSSProperties}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            {/* Thumbnail strip — up to 4 rooms */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(p.rooms.length, 4)}, 1fr)`,
                height: 140,
                gap: 1,
                background: "var(--border-weak)",
              }}
            >
              {p.rooms.slice(0, 4).map(r => (
                <div key={r.id} style={{ position: "relative", overflow: "hidden" }}>
                  {r.status === "uploaded" || r.status === "draft" ? (
                    <BareRoomPhoto />
                  ) : (
                    <RoomPhoto tone={r.tone} />
                  )}
                </div>
              ))}
            </div>
            {/* Info */}
            <div style={{ padding: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 2,
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-0)" }}>
                  {p.name}
                </div>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
                  {p.id.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-2)", marginBottom: 10 }}>
                {p.city} · {p.description}
              </div>
              {/* Stats */}
              <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
                <Stat label="Rooms" value={p.rooms.length} />
                <Stat label="Staged" value={p.rooms.filter(r => r.status === "staged").length} />
                <Stat
                  label="In progress"
                  value={
                    p.rooms.filter(r => r.status === "generating" || r.status === "analyzing").length
                  }
                />
                <Stat label="Updated" value={p.updatedAt.slice(5)} mono />
              </div>
              {/* Progress bar */}
              <div
                style={{
                  height: 2,
                  background: "var(--surface-4)",
                  borderRadius: 1,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${p.progress * 100}%`,
                    height: "100%",
                    background: p.progress === 1 ? "var(--ok)" : "var(--amber)",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>
                  {Math.round(p.progress * 100)}% complete
                </span>
                <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>
                  {p.rooms.filter(r => r.status === "staged").length} / {p.rooms.length}
                </span>
              </div>
            </div>
          </button>
        ))}

        {/* New project tile */}
        <button
          style={{
            background: "transparent",
            border: "1px dashed var(--border)",
            borderRadius: "var(--r-lg)",
            minHeight: 280,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-2)",
            gap: 8,
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "var(--surface-3)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="plus" size={16} color="var(--text-1)" />
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-1)" }}>
            New project
          </span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            Start with an address or upload rooms
          </span>
        </button>
      </div>
    </div>
  );
};

// ─── Project Detail screen ───────────────────────────────────────────
export const ProjectDetailScreen: React.FC<{ project: Project }> = ({ project }) => {
  const router = useRouter();
  const [roomView, setRoomView] = useState<"grid" | "list">("grid");

  return (
    <div style={{ padding: "20px 28px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button
          onClick={() => router.push("/dashboard")}
          style={{ ...iconBtn, color: "var(--text-2)" }}
        >
          <Icon name="arrow-left" size={14} />
        </button>
        <span className="cap">Projects / {project.name}</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 280px",
          gap: 24,
          marginBottom: 22,
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
            {project.name}
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-2)", margin: "4px 0 14px" }}>
            {project.description}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill tone="neutral" icon="globe">
              {project.city}
            </Pill>
            <Pill tone="amber" dot="live">
              {
                project.rooms.filter(r => r.status === "generating" || r.status === "analyzing")
                  .length
              }{" "}
              in progress
            </Pill>
            <Pill tone="ok" icon="check">
              {project.rooms.filter(r => r.status === "staged").length} staged
            </Pill>
            <Pill tone="neutral">Updated {project.updatedAt}</Pill>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            alignItems: "flex-start",
          }}
        >
          <Button icon="share" variant="ghost">
            Share
          </Button>
          <Button icon="download" variant="outline">
            Export all
          </Button>
          <Button icon="plus" variant="primary">
            Add room
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
          marginBottom: 20,
          padding: 14,
          background: "var(--surface-2)",
          border: "1px solid var(--border-weak)",
          borderRadius: "var(--r-lg)",
        }}
      >
        <StatBig label="Rooms" value={project.rooms.length} />
        <StatBig
          label="Staged"
          value={project.rooms.filter(r => r.status === "staged").length}
          tone="ok"
        />
        <StatBig label="Total renders" value="34" />
        <StatBig label="Avg quality" value="A" tone="amber" />
        <StatBig label="Credits used" value="48" sub="of 500" />
      </div>

      {/* Rooms grid */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Rooms</h2>
        <Segment
          value={roomView}
          onChange={v => setRoomView(v as "grid" | "list")}
          options={[
            { value: "grid", icon: "grid", label: "" },
            { value: "list", icon: "list", label: "" },
          ]}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        {project.rooms.map((r: Room) => (
          <RoomCard
            key={r.id}
            room={r}
            onOpen={() => router.push(`/projects/${project.id}/rooms/${r.id}`)}
          />
        ))}
      </div>
    </div>
  );
};

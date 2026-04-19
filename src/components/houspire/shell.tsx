"use client";

// Houspire Staging — App shell (title bar + sidebar)
// Ported from handoff/shell.jsx

import React, { CSSProperties } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Icon, Kbd, RoomPhoto, iconBtn } from "./primitives";
import { DATA, Project, Room } from "./data";

export interface Breadcrumb {
  label: string;
  onClick?: () => void;
  href?: string;
}

export const AppTitleBar: React.FC<{
  breadcrumb?: Breadcrumb[];
  onCommand?: () => void;
}> = ({ breadcrumb, onCommand }) => (
  <div style={{
    height: 40, display: "flex", alignItems: "center",
    padding: "0 12px 0 14px",
    background: "var(--surface-1)",
    borderBottom: "1px solid var(--border-weak)",
    gap: 14, position: "relative",
    flexShrink: 0,
  }}>
    {/* Traffic lights — integrated (this isn't actually a browser, it's an app) */}
    <div style={{ display: "flex", gap: 7 }}>
      <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#FF5F57" }} />
      <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#FEBC2E" }} />
      <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#28C840" }} />
    </div>

    {/* Logo + wordmark */}
    <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 4, textDecoration: "none", color: "inherit" }}>
      <div style={{
        width: 20, height: 20, background: "var(--amber)", borderRadius: 5,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#1A1407", fontWeight: 700, fontSize: 11,
        fontFamily: "var(--font-mono)", letterSpacing: "-0.02em",
      }}>H</div>
      <span style={{ fontWeight: 600, fontSize: 12.5, letterSpacing: "-0.01em" }}>
        Houspire<span style={{ color: "var(--text-3)", fontWeight: 400 }}> / Staging</span>
      </span>
    </Link>

    {/* Breadcrumb */}
    {breadcrumb && breadcrumb.length > 0 && (
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-2)", fontSize: 12 }}>
        <Icon name="chevron-right" size={12} color="var(--text-3)" />
        {breadcrumb.map((b, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="chevron-right" size={11} color="var(--text-3)" />}
            {b.href ? (
              <Link href={b.href} style={{
                color: i === breadcrumb.length - 1 ? "var(--text-0)" : "var(--text-2)",
                fontWeight: i === breadcrumb.length - 1 ? 500 : 400,
                textDecoration: "none",
              }}>{b.label}</Link>
            ) : (
              <button onClick={() => b.onClick?.()}
                style={{
                  color: i === breadcrumb.length - 1 ? "var(--text-0)" : "var(--text-2)",
                  fontWeight: i === breadcrumb.length - 1 ? 500 : 400,
                  cursor: b.onClick ? "pointer" : "default",
                }}>{b.label}</button>
            )}
          </React.Fragment>
        ))}
      </div>
    )}

    <div style={{ flex: 1 }} />

    {/* Command palette */}
    <button onClick={onCommand} style={{
      height: 26, padding: "0 10px 0 8px",
      background: "var(--surface-2)", border: "1px solid var(--border-weak)",
      borderRadius: "var(--r-md)", fontSize: 11.5, color: "var(--text-2)",
      display: "flex", alignItems: "center", gap: 30,
      minWidth: 220,
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="search" size={12} />
        Search, jump, run…
      </span>
      <span style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
        <Kbd>⌘</Kbd><Kbd>K</Kbd>
      </span>
    </button>

    {/* Right actions */}
    <button style={iconBtn}><Icon name="info" size={14} color="var(--text-2)" /></button>
    <button style={iconBtn}><Icon name="settings" size={14} color="var(--text-2)" /></button>
    <div style={{
      width: 24, height: 24, borderRadius: "50%",
      background: "linear-gradient(135deg, oklch(0.7 0.12 30), oklch(0.5 0.1 50))",
      border: "1px solid var(--border-strong)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 10, fontWeight: 600, color: "white",
    }}>{DATA.user.initials}</div>
  </div>
);

// ─── Sidebar ────────────────────────────────────────────────────────
const NAV_ITEMS: Array<{ key: string; label: string; icon: string; href: string; count?: number }> = [
  { key: "projects", label: "Projects", icon: "folder", href: "/dashboard" },
  { key: "library", label: "Library", icon: "layers", href: "/library", count: 248 },
  { key: "styles", label: "Style DNA", icon: "sparkle", href: "/styles", count: 12 },
  { key: "exports", label: "Exports", icon: "download", href: "/exports" },
  { key: "api", label: "API & Webhooks", icon: "zap", href: "/api-keys" },
];

export const Sidebar: React.FC<{
  project?: Project | null;
  activeRoomId?: string | null;
}> = ({ project, activeRoomId }) => {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname?.startsWith("/projects");
    return pathname?.startsWith(href);
  };

  return (
    <aside style={{
      width: 212, background: "var(--surface-1)",
      borderRight: "1px solid var(--border-weak)",
      display: "flex", flexDirection: "column",
      flexShrink: 0,
      height: "100%",
    }}>
      <div style={{ padding: "14px 10px 10px" }}>
        <button onClick={() => router.push("/dashboard")} style={{
          width: "100%", height: 34, padding: "0 10px",
          background: "var(--surface-3)", border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          display: "flex", alignItems: "center", gap: 8,
          textAlign: "left", fontSize: 12.5, fontWeight: 500,
          color: "var(--text-0)",
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: 4, flexShrink: 0,
            background: "linear-gradient(135deg, oklch(0.55 0.15 250), oklch(0.38 0.12 270))",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: 9, fontWeight: 700,
          }}>HL</div>
          <span style={{ flex: 1 }}>{DATA.user.org}</span>
          <Icon name="chevron-down" size={12} color="var(--text-2)" />
        </button>
      </div>

      <div style={{ padding: "4px 8px" }}>
        {NAV_ITEMS.map(i => {
          const active = isActive(i.href);
          return (
            <Link key={i.key} href={i.href} style={{
              width: "100%", height: 28, padding: "0 8px",
              display: "flex", alignItems: "center", gap: 9,
              borderRadius: "var(--r-sm)",
              background: active ? "var(--surface-3)" : "transparent",
              color: active ? "var(--text-0)" : "var(--text-1)",
              fontSize: 12.5, fontWeight: active ? 500 : 400,
              textDecoration: "none",
            }}>
              <Icon name={i.icon} size={14} color={active ? "var(--amber)" : "var(--text-2)"} />
              <span style={{ flex: 1, textAlign: "left" }}>{i.label}</span>
              {i.count != null && (
                <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{i.count}</span>
              )}
            </Link>
          );
        })}
      </div>

      <div style={{ margin: "16px 12px 6px" }}>
        <div className="cap-sm">Current project</div>
      </div>
      <div style={{ padding: "0 8px", flex: 1, overflow: "auto" }}>
        {project ? (
          <>
            <Link href={`/projects/${project.id}`} style={{
              width: "100%", padding: "8px 8px",
              display: "flex", alignItems: "flex-start", gap: 8,
              borderRadius: "var(--r-sm)",
              background: pathname === `/projects/${project.id}` ? "var(--surface-3)" : "transparent",
              color: "var(--text-0)",
              textDecoration: "none",
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                overflow: "hidden", border: "1px solid var(--border-weak)",
              }}>
                <RoomPhoto tone={project.tone} />
              </div>
              <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {project.name}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>
                  {project.rooms.length} rooms · {project.city}
                </div>
              </div>
            </Link>
            <div style={{ marginTop: 4, paddingLeft: 6 }}>
              {project.rooms.map((r: Room) => {
                const active = activeRoomId === r.id;
                return (
                  <Link key={r.id} href={`/projects/${project.id}/rooms/${r.id}`} style={{
                    width: "100%", height: 26, padding: "0 8px 0 10px",
                    display: "flex", alignItems: "center", gap: 8,
                    borderRadius: "var(--r-sm)",
                    background: active ? "var(--surface-3)" : "transparent",
                    fontSize: 11.5,
                    color: active ? "var(--text-0)" : "var(--text-1)",
                    position: "relative",
                    textDecoration: "none",
                  } as CSSProperties}>
                    <span style={{
                      width: 2, height: 14, borderRadius: 1, flexShrink: 0,
                      background: active ? "var(--amber)" : "transparent",
                      marginLeft: -6,
                    }} />
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      background:
                        r.status === "staged" ? "var(--ok)" :
                        r.status === "generating" ? "var(--amber)" :
                        r.status === "analyzing" ? "var(--cyan)" :
                        "var(--text-3)",
                      animation: (r.status === "generating" || r.status === "analyzing") ? "pulse-dot 1.6s ease-in-out infinite" : "none",
                    }} />
                    <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: "var(--text-3)", padding: 8 }}>
            No project selected
          </div>
        )}
      </div>

      <div style={{ padding: 10, borderTop: "1px solid var(--border-weak)" }}>
        <div style={{
          padding: 10, background: "var(--surface-2)",
          border: "1px solid var(--border-weak)", borderRadius: "var(--r-md)",
          fontSize: 11,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Icon name="zap" size={11} color="var(--amber)" />
            <span style={{ fontWeight: 600, color: "var(--text-0)" }}>Renders this month</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 14, color: "var(--text-0)" }}>248<span style={{ color: "var(--text-3)" }}>/500</span></span>
            <span className="mono" style={{ fontSize: 10, color: "var(--text-2)" }}>49%</span>
          </div>
          <div style={{ height: 3, background: "var(--surface-4)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: "49%", height: "100%", background: "var(--amber)", borderRadius: 2 }} />
          </div>
        </div>
      </div>
    </aside>
  );
};

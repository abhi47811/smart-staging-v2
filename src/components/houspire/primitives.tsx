"use client";

// Houspire Staging — Shared low-level components
// Ported from handoff primitives.jsx — pixel-perfect, inline styles against CSS custom properties.

import React, { useState, CSSProperties, ReactNode } from "react";

// ─── Icons ──────────────────────────────────────────────────────────────
export type IconName =
  | "home" | "folder" | "room" | "plus" | "search" | "settings" | "user"
  | "chevron-right" | "chevron-down" | "chevron-left"
  | "arrow-left" | "arrow-right"
  | "upload" | "image" | "sparkle" | "wand" | "play" | "pause"
  | "check" | "x" | "download" | "eye" | "eye-off"
  | "layers" | "grid" | "list" | "edit" | "trash" | "copy" | "dots"
  | "lightbulb" | "palette" | "sofa" | "sun" | "moon" | "camera"
  | "shield" | "zap" | "wave" | "crop" | "globe" | "link" | "share"
  | "info" | "warning" | "lock" | "diff" | "refresh" | "save" | "floor" | "logo";

export const Icon: React.FC<{
  name: IconName | string;
  size?: number;
  color?: string;
  style?: CSSProperties;
}> = ({ name, size = 16, color = "currentColor", style = {} }) => {
  const s: CSSProperties = { width: size, height: size, flexShrink: 0, display: "block", ...style };
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none" as const,
    stroke: color,
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: s,
  };
  switch (name) {
    case "home": return <svg {...props}><path d="M2 7l6-5 6 5v7a1 1 0 01-1 1H3a1 1 0 01-1-1V7z"/><path d="M6 15V9h4v6"/></svg>;
    case "folder": return <svg {...props}><path d="M2 4.5a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4.5z"/></svg>;
    case "room": return <svg {...props}><rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M2 6h12M6 6v7.5"/></svg>;
    case "plus": return <svg {...props}><path d="M8 3v10M3 8h10"/></svg>;
    case "search": return <svg {...props}><circle cx="7" cy="7" r="4"/><path d="M10 10l3 3"/></svg>;
    case "settings": return <svg {...props}><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M15 8h-2M3 8H1M12.95 3.05l-1.4 1.4M4.45 11.55l-1.4 1.4M12.95 12.95l-1.4-1.4M4.45 4.45L3.05 3.05"/></svg>;
    case "user": return <svg {...props}><circle cx="8" cy="5.5" r="2.5"/><path d="M3 14c.5-2.5 2.5-4 5-4s4.5 1.5 5 4"/></svg>;
    case "chevron-right": return <svg {...props}><path d="M6 3l5 5-5 5"/></svg>;
    case "chevron-down": return <svg {...props}><path d="M3 6l5 5 5-5"/></svg>;
    case "chevron-left": return <svg {...props}><path d="M10 3l-5 5 5 5"/></svg>;
    case "arrow-left": return <svg {...props}><path d="M6 3l-5 5 5 5M1 8h14"/></svg>;
    case "arrow-right": return <svg {...props}><path d="M10 3l5 5-5 5M15 8H1"/></svg>;
    case "upload": return <svg {...props}><path d="M8 10V2m0 0L5 5m3-3l3 3"/><path d="M2 10v2a2 2 0 002 2h8a2 2 0 002-2v-2"/></svg>;
    case "image": return <svg {...props}><rect x="2" y="2" width="12" height="12" rx="1"/><circle cx="6" cy="6" r="1.2"/><path d="M14 10l-3-3-7 7"/></svg>;
    case "sparkle": return <svg {...props}><path d="M8 2l1.5 4L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5L8 2z"/></svg>;
    case "wand": return <svg {...props}><path d="M11 2l1 1M14 5l1 1M12 3l-2 2M4 13L13 4M2 15l2-2"/></svg>;
    case "play": return <svg {...props}><path d="M4 3l9 5-9 5V3z" fill="currentColor" stroke="none"/></svg>;
    case "pause": return <svg {...props}><rect x="4" y="3" width="3" height="10" fill="currentColor" stroke="none" rx="0.5"/><rect x="9" y="3" width="3" height="10" fill="currentColor" stroke="none" rx="0.5"/></svg>;
    case "check": return <svg {...props}><path d="M3 8l3.5 3.5L13 5"/></svg>;
    case "x": return <svg {...props}><path d="M4 4l8 8M12 4l-8 8"/></svg>;
    case "download": return <svg {...props}><path d="M8 2v8m0 0l-3-3m3 3l3-3"/><path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1"/></svg>;
    case "eye": return <svg {...props}><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>;
    case "eye-off": return <svg {...props}><path d="M1 8s2.5-5 7-5c1.5 0 2.8.5 4 1.3M15 8s-2.5 5-7 5c-1.5 0-2.8-.5-4-1.3"/><path d="M2 2l12 12"/></svg>;
    case "layers": return <svg {...props}><path d="M8 2l6 3-6 3-6-3 6-3zM2 8l6 3 6-3M2 11l6 3 6-3"/></svg>;
    case "grid": return <svg {...props}><rect x="2" y="2" width="5" height="5" rx="0.5"/><rect x="9" y="2" width="5" height="5" rx="0.5"/><rect x="2" y="9" width="5" height="5" rx="0.5"/><rect x="9" y="9" width="5" height="5" rx="0.5"/></svg>;
    case "list": return <svg {...props}><path d="M5 4h9M5 8h9M5 12h9"/><circle cx="2.5" cy="4" r="0.5" fill="currentColor"/><circle cx="2.5" cy="8" r="0.5" fill="currentColor"/><circle cx="2.5" cy="12" r="0.5" fill="currentColor"/></svg>;
    case "edit": return <svg {...props}><path d="M11 2l3 3-8 8H3v-3l8-8z"/></svg>;
    case "trash": return <svg {...props}><path d="M2 4h12M6 4V2h4v2M4 4l1 10a1 1 0 001 1h4a1 1 0 001-1l1-10"/></svg>;
    case "copy": return <svg {...props}><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M3 10V3a1 1 0 011-1h7"/></svg>;
    case "dots": return <svg {...props}><circle cx="3" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="13" cy="8" r="1" fill="currentColor"/></svg>;
    case "lightbulb": return <svg {...props}><path d="M6 14h4M5.5 12h5M4 8a4 4 0 118 0c0 1.5-1 2.5-1.5 3.5h-5C5 10.5 4 9.5 4 8z"/></svg>;
    case "palette": return <svg {...props}><path d="M8 2a6 6 0 100 12c.8 0 1-1 .5-1.5-.8-.8-.5-2 .5-2h2a3 3 0 003-3c0-3-2.5-5.5-6-5.5z"/><circle cx="5" cy="7" r="0.8" fill="currentColor"/><circle cx="8" cy="5" r="0.8" fill="currentColor"/><circle cx="11" cy="7" r="0.8" fill="currentColor"/></svg>;
    case "sofa": return <svg {...props}><path d="M2 10v3h12v-3M2 10V8a1 1 0 011-1v0a1 1 0 011 1v2M14 10V8a1 1 0 00-1-1v0a1 1 0 00-1 1v2M4 10h8V8a2 2 0 00-2-2H6a2 2 0 00-2 2v2z"/></svg>;
    case "sun": return <svg {...props}><circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M13 3l-1 1M4 12l-1 1"/></svg>;
    case "moon": return <svg {...props}><path d="M13 9.5A5.5 5.5 0 116.5 3a5 5 0 106.5 6.5z"/></svg>;
    case "camera": return <svg {...props}><rect x="1.5" y="4" width="13" height="9" rx="1"/><circle cx="8" cy="8.5" r="2.5"/><path d="M5 4l1-1.5h4L11 4"/></svg>;
    case "shield": return <svg {...props}><path d="M8 1.5L3 3v4.5c0 3 2.2 5.8 5 7 2.8-1.2 5-4 5-7V3l-5-1.5z"/></svg>;
    case "zap": return <svg {...props}><path d="M9 1L3 9h4l-1 6 6-8H8l1-6z" fill="currentColor" stroke="none"/></svg>;
    case "wave": return <svg {...props}><path d="M1 8s1.5-3 3.5-3S6.5 11 8.5 11 11 5 13 5s1.5 3 1.5 3"/></svg>;
    case "crop": return <svg {...props}><path d="M4 1v11h11M1 4h11v11"/></svg>;
    case "globe": return <svg {...props}><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 3 4 3 6s-1 4-3 6c-2-2-3-4-3-6s1-4 3-6z"/></svg>;
    case "link": return <svg {...props}><path d="M7 9a3 3 0 004.2 0l2-2a3 3 0 00-4.2-4.2l-1 1M9 7a3 3 0 00-4.2 0l-2 2a3 3 0 004.2 4.2l1-1"/></svg>;
    case "share": return <svg {...props}><circle cx="12" cy="3.5" r="1.8"/><circle cx="4" cy="8" r="1.8"/><circle cx="12" cy="12.5" r="1.8"/><path d="M5.5 7l5-2.5M5.5 9l5 2.5"/></svg>;
    case "info": return <svg {...props}><circle cx="8" cy="8" r="6"/><path d="M8 7.5v3M8 5v.5"/></svg>;
    case "warning": return <svg {...props}><path d="M8 2L1.5 13h13L8 2z"/><path d="M8 7v3M8 11.5v.5"/></svg>;
    case "lock": return <svg {...props}><rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V5a3 3 0 016 0v2"/></svg>;
    case "diff": return <svg {...props}><rect x="1.5" y="3" width="5.5" height="10"/><rect x="9" y="3" width="5.5" height="10"/></svg>;
    case "refresh": return <svg {...props}><path d="M13 4v3h-3M3 12V9h3"/><path d="M12.5 7A5 5 0 004 6M3.5 9a5 5 0 008.5 1"/></svg>;
    case "save": return <svg {...props}><path d="M2 3a1 1 0 011-1h9l2 2v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3z"/><path d="M4 2v4h7V2M5 10h6"/></svg>;
    case "floor": return <svg {...props}><path d="M1 13l7-11 7 11M3 9h10M5 6h6"/></svg>;
    case "logo": return <svg {...props} viewBox="0 0 16 16"><path d="M2 12V5l6-3 6 3v7h-4V9H6v3H2z" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>;
    default: return <svg {...props}><rect x="2" y="2" width="12" height="12" rx="1"/></svg>;
  }
};

// ─── Button ──────────────────────────────────────────────────────────────
export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

export const Button: React.FC<{
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconRight?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  active?: boolean;
  fullWidth?: boolean;
  style?: CSSProperties;
  type?: "button" | "submit" | "reset";
}> = ({
  children, variant = "secondary", size = "md", icon, iconRight,
  onClick, disabled, active, fullWidth, style = {}, type = "button",
}) => {
  const sizes = {
    xs: { h: 22, px: 8, fs: 11, gap: 5 },
    sm: { h: 26, px: 10, fs: 12, gap: 6 },
    md: { h: 30, px: 12, fs: 12.5, gap: 7 },
    lg: { h: 36, px: 16, fs: 13, gap: 8 },
  }[size];
  const variants = {
    primary: { bg: "var(--amber)", color: "#1A1407", border: "transparent", hoverBg: "oklch(0.82 0.17 75)" },
    secondary: { bg: "var(--surface-3)", color: "var(--text-0)", border: "var(--border)", hoverBg: "var(--surface-4)" },
    ghost: { bg: "transparent", color: "var(--text-1)", border: "transparent", hoverBg: "var(--surface-3)" },
    outline: { bg: "transparent", color: "var(--text-0)", border: "var(--border-strong)", hoverBg: "var(--surface-3)" },
    danger: { bg: "transparent", color: "var(--err)", border: "var(--border)", hoverBg: "oklch(0.30 0.12 25 / 0.3)" },
  }[variant];
  const [hover, setHover] = useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: sizes.h,
        padding: `0 ${sizes.px}px`,
        fontSize: sizes.fs,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: sizes.gap,
        background: active ? variants.hoverBg : (hover && !disabled ? variants.hoverBg : variants.bg),
        color: variants.color,
        border: `1px solid ${variants.border}`,
        borderRadius: "var(--r-md)",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 120ms, border-color 120ms, transform 80ms",
        width: fullWidth ? "100%" : "auto",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={sizes.fs + 1} />}
      {children}
      {iconRight && <Icon name={iconRight} size={sizes.fs + 1} />}
    </button>
  );
};

// ─── Panel (elevated surface) ──────────────────────────────────────────
export const Panel: React.FC<{
  children?: ReactNode;
  style?: CSSProperties;
  padding?: number | string;
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  flat?: boolean;
}> = ({ children, style = {}, padding = 0, title, subtitle, right, flat }) => (
  <div style={{
    background: "var(--surface-2)",
    border: `1px solid ${flat ? "var(--border-weak)" : "var(--border)"}`,
    borderRadius: "var(--r-lg)",
    boxShadow: flat ? "none" : "var(--shadow-panel)",
    overflow: "hidden",
    ...style,
  }}>
    {(title || right) && (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: "1px solid var(--border-weak)",
        background: "linear-gradient(to bottom, var(--surface-3), var(--surface-2))",
      }}>
        <div>
          {title && <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-0)" }}>{title}</div>}
          {subtitle && <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 1 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
    )}
    <div style={{ padding }}>{children}</div>
  </div>
);

// ─── Status pill ──────────────────────────────────────────────────────
export type PillTone = "neutral" | "amber" | "cyan" | "ok" | "err" | "sacred";
export type PillSize = "xs" | "sm" | "md";

export const Pill: React.FC<{
  children?: ReactNode;
  tone?: PillTone;
  size?: PillSize;
  dot?: boolean | "live";
  icon?: string;
}> = ({ children, tone = "neutral", size = "sm", dot, icon }) => {
  const tones = {
    neutral: { bg: "var(--surface-3)", color: "var(--text-1)", border: "var(--border)" },
    amber: { bg: "oklch(0.28 0.08 75 / 0.3)", color: "var(--amber)", border: "oklch(0.4 0.1 75 / 0.4)" },
    cyan: { bg: "oklch(0.28 0.06 210 / 0.3)", color: "var(--cyan)", border: "oklch(0.4 0.08 210 / 0.4)" },
    ok: { bg: "oklch(0.28 0.08 150 / 0.3)", color: "var(--ok)", border: "oklch(0.4 0.1 150 / 0.4)" },
    err: { bg: "oklch(0.30 0.12 25 / 0.3)", color: "var(--err)", border: "oklch(0.4 0.14 25 / 0.4)" },
    sacred: { bg: "oklch(0.30 0.14 15 / 0.25)", color: "var(--sacred)", border: "oklch(0.42 0.17 15 / 0.5)" },
  }[tone];
  const sizes = { xs: { h: 18, px: 6, fs: 10 }, sm: { h: 22, px: 8, fs: 10.5 }, md: { h: 26, px: 10, fs: 11.5 } }[size];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      height: sizes.h, padding: `0 ${sizes.px}px`,
      background: tones.bg, color: tones.color,
      border: `1px solid ${tones.border}`,
      borderRadius: 999, fontSize: sizes.fs, fontWeight: 500,
      letterSpacing: "0.01em",
      whiteSpace: "nowrap",
    }}>
      {dot && <span style={{
        width: 6, height: 6, borderRadius: 999, background: tones.color,
        animation: dot === "live" ? "pulse-dot 1.6s ease-in-out infinite" : "none",
      }} />}
      {icon && <Icon name={icon} size={sizes.fs} />}
      {children}
    </span>
  );
};

// ─── Divider ──────────────────────────────────────────────────────────
export const Divider: React.FC<{ vertical?: boolean; style?: CSSProperties }> = ({ vertical, style = {} }) =>
  vertical
    ? <div style={{ width: 1, alignSelf: "stretch", background: "var(--border-weak)", ...style }} />
    : <div style={{ height: 1, width: "100%", background: "var(--border-weak)", ...style }} />;

// ─── Keyboard key ────────────────────────────────────────────────────
export const Kbd: React.FC<{ children?: ReactNode }> = ({ children }) => (
  <kbd style={{
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: 16, height: 16, padding: "0 4px",
    fontFamily: "var(--font-mono)", fontSize: 10,
    background: "var(--surface-4)", color: "var(--text-1)",
    border: "1px solid var(--border)",
    borderRadius: 3,
    boxShadow: "0 1px 0 rgba(0,0,0,0.4)",
  }}>{children}</kbd>
);

// ─── Segment control ─────────────────────────────────────────────────
export type SegmentOption = { value: string; label: string; icon?: string };

export const Segment: React.FC<{
  options: SegmentOption[];
  value: string;
  onChange: (v: string) => void;
  size?: "sm" | "md";
}> = ({ options, value, onChange, size = "md" }) => {
  const sz = { sm: { h: 24, fs: 11, px: 8 }, md: { h: 28, fs: 12, px: 10 } }[size];
  return (
    <div style={{
      display: "inline-flex", background: "var(--surface-1)",
      padding: 2, borderRadius: "var(--r-md)",
      border: "1px solid var(--border-weak)",
    }}>
      {options.map(o => {
        const active = value === o.value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            style={{
              height: sz.h, padding: `0 ${sz.px}px`, fontSize: sz.fs,
              fontWeight: 500,
              background: active ? "var(--surface-3)" : "transparent",
              color: active ? "var(--text-0)" : "var(--text-2)",
              borderRadius: "var(--r-sm)",
              transition: "background 120ms, color 120ms",
              display: "inline-flex", alignItems: "center", gap: 5,
              border: active ? "1px solid var(--border)" : "1px solid transparent",
            }}>
            {o.icon && <Icon name={o.icon} size={sz.fs + 1} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
};

// ─── Number / range slider ───────────────────────────────────────────
export const Slider: React.FC<{
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  format?: (v: number) => string;
}> = ({ value, onChange, min = 0, max = 100, step = 1, label, format }) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span className="cap-sm">{label}</span>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-1)" }}>
            {format ? format(value) : value}
          </span>
        </div>
      )}
      <div style={{ position: "relative", height: 22, display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", left: 0, right: 0, height: 3, background: "var(--surface-4)", borderRadius: 2 }} />
        <div style={{ position: "absolute", left: 0, width: `${pct}%`, height: 3, background: "var(--amber)", borderRadius: 2 }} />
        <div style={{
          position: "absolute", left: `calc(${pct}% - 7px)`, width: 14, height: 14,
          background: "var(--text-0)", borderRadius: "50%",
          boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
        }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(+e.target.value)}
          style={{ position: "absolute", inset: 0, width: "100%", opacity: 0, cursor: "pointer" }} />
      </div>
    </div>
  );
};

// ─── Swatch ──────────────────────────────────────────────────────────
export const Swatch: React.FC<{
  color: string;
  size?: number;
  label?: string;
  pct?: number;
}> = ({ color, size = 16, label, pct }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
    <span style={{
      width: size, height: size, background: color,
      borderRadius: 3, border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.3)",
    }} />
    {label && (
      <div style={{ fontSize: 11 }}>
        <div style={{ color: "var(--text-1)" }}>{label}</div>
        {pct != null && <div className="mono" style={{ color: "var(--text-3)", fontSize: 10 }}>{pct}%</div>}
      </div>
    )}
  </div>
);

// ─── Placeholder image (striped — no AI slop SVG) ─────────────────────
export const StripedPlaceholder: React.FC<{
  label?: string;
  w?: number | string;
  h?: number | string;
  style?: CSSProperties;
}> = ({ label, w = "100%", h = "100%", style = {} }) => (
  <div style={{
    width: w, height: h, position: "relative",
    background: "repeating-linear-gradient(135deg, var(--surface-2) 0, var(--surface-2) 8px, var(--surface-3) 8px, var(--surface-3) 16px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)",
    textTransform: "uppercase", letterSpacing: "0.1em",
    border: "1px solid var(--border-weak)",
    ...style,
  }}>
    {label}
  </div>
);

// ─── Photo placeholder with tone (simulates staged interior photos) ───
export type RoomTone = "warm" | "cool" | "sun" | "evening" | "fresh" | "mono";

export const RoomPhoto: React.FC<{
  tone?: RoomTone | string;
  label?: string;
  stage?: string;
  style?: CSSProperties;
}> = ({ tone = "warm", label, stage, style = {} }) => {
  const palettes: Record<string, string[]> = {
    warm: ["#B8927C", "#8C6A52", "#5B4435", "#2E2218"],
    cool: ["#A8B3BC", "#7F8C96", "#4E5A66", "#252E38"],
    sun: ["#E6C89A", "#B8956A", "#7A5C3E", "#3A2B1E"],
    evening: ["#6B5878", "#4A3E5E", "#2C2340", "#14101F"],
    fresh: ["#C8D4C2", "#94A890", "#5F7059", "#2A362A"],
    mono: ["#D8D8D4", "#A5A6A2", "#6A6C69", "#2B2D2A"],
  };
  const p = palettes[tone as string] || ["#888", "#555", "#333", "#111"];
  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      overflow: "hidden",
      background: `
        radial-gradient(ellipse 80% 60% at 30% 40%, ${p[0]} 0%, transparent 60%),
        radial-gradient(ellipse 60% 80% at 70% 70%, ${p[1]} 0%, transparent 55%),
        radial-gradient(ellipse 100% 50% at 50% 100%, ${p[2]} 0%, transparent 70%),
        linear-gradient(180deg, ${p[1]} 0%, ${p[3]} 100%)
      `,
      ...style,
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `
          repeating-linear-gradient(0deg, rgba(0,0,0,0.0) 0px, rgba(0,0,0,0.04) 1px, transparent 2px),
          radial-gradient(ellipse at top right, rgba(255,255,255,0.12) 0%, transparent 45%)
        `,
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", top: "18%", left: "58%", width: "22%", height: "38%",
        background: "linear-gradient(to bottom, rgba(255,250,235,0.55), rgba(255,245,220,0.15))",
        border: "1px solid rgba(0,0,0,0.15)",
        boxShadow: "0 0 40px rgba(255,240,210,0.3)",
      }} />
      <div style={{
        position: "absolute", bottom: "15%", left: "8%", width: "45%", height: "28%",
        background: `linear-gradient(to top, ${p[3]}, ${p[2]})`,
        borderRadius: "6px 6px 3px 3px",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.3)",
      }} />
      {label && (
        <div style={{
          position: "absolute", bottom: 8, left: 8,
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: "rgba(255,255,255,0.85)",
          textTransform: "uppercase", letterSpacing: "0.1em",
          background: "rgba(0,0,0,0.4)", padding: "2px 6px", borderRadius: 2,
          backdropFilter: "blur(4px)",
        }}>{label}</div>
      )}
      {stage && (
        <div style={{
          position: "absolute", top: 8, right: 8,
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: "rgba(255,255,255,0.85)",
          textTransform: "uppercase", letterSpacing: "0.1em",
          background: "rgba(0,0,0,0.4)", padding: "2px 6px", borderRadius: 2,
          backdropFilter: "blur(4px)",
        }}>{stage}</div>
      )}
    </div>
  );
};

export const BareRoomPhoto: React.FC<{ style?: CSSProperties }> = ({ style = {} }) => (
  <div style={{
    position: "relative", width: "100%", height: "100%", overflow: "hidden",
    background: `
      radial-gradient(ellipse 70% 100% at 50% 0%, #4A4F54 0%, transparent 60%),
      linear-gradient(180deg, #3B4046 0%, #1E2125 100%)
    `,
    ...style,
  }}>
    <div style={{
      position: "absolute", top: "15%", left: "55%", width: "28%", height: "45%",
      background: "linear-gradient(to bottom, rgba(220,225,230,0.7), rgba(200,210,220,0.3))",
      border: "1px solid rgba(255,255,255,0.1)",
    }} />
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, height: "32%",
      background: "linear-gradient(to top, #2A2D31, transparent)",
    }} />
  </div>
);

// Used by generate/export screens — subtle corner marks overlaid on canvas
export const CornerMarks: React.FC = () => {
  const mark = (pos: CSSProperties): CSSProperties => ({
    position: "absolute", width: 12, height: 12, ...pos,
    borderColor: "rgba(255,255,255,0.3)",
  });
  return (
    <>
      <div style={{ ...mark({ top: 8, left: 8 }), borderTop: "1px solid rgba(255,255,255,0.3)", borderLeft: "1px solid rgba(255,255,255,0.3)" }} />
      <div style={{ ...mark({ top: 8, right: 8 }), borderTop: "1px solid rgba(255,255,255,0.3)", borderRight: "1px solid rgba(255,255,255,0.3)" }} />
      <div style={{ ...mark({ bottom: 8, left: 8 }), borderBottom: "1px solid rgba(255,255,255,0.3)", borderLeft: "1px solid rgba(255,255,255,0.3)" }} />
      <div style={{ ...mark({ bottom: 8, right: 8 }), borderBottom: "1px solid rgba(255,255,255,0.3)", borderRight: "1px solid rgba(255,255,255,0.3)" }} />
    </>
  );
};

// Shared iconBtn style used by shell and tabs
export const iconBtn: CSSProperties = {
  width: 26, height: 26, borderRadius: "var(--r-sm)",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  background: "transparent",
};

// Shared form input style
export const inputStyle: CSSProperties = {
  height: 30, padding: "0 10px",
  background: "var(--surface-1)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-md)",
  fontSize: 12.5,
  color: "var(--text-0)",
  width: "100%",
};

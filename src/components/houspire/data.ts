// Houspire Staging — seed data for prototype-grade UI pages.
// Keep in sync with handoff/data.js. This is mock/demo data while the real
// pages are being wired into Supabase; treat it as placeholder content
// for the design port.

export type RoomStatus = "staged" | "generating" | "analyzing" | "draft" | "uploaded" | "error";
export type SuggestionStatus = "pending" | "accepted" | "rejected" | "applied";
export type SuggestionImpact = "low" | "medium" | "high";

export interface StylePreset {
  key: string;
  label: string;
  tone: string;
  palette: string[];
}

export interface Room {
  id: string;
  label: string;
  type: string;
  status: RoomStatus;
  tone: string;
  thumbnail?: string;
}

export interface Project {
  id: string;
  name: string;
  city: string;
  description: string;
  rooms: Room[];
  progress: number;
  createdAt: string;
  updatedAt: string;
  tone: string;
}

export interface PipelineStage {
  key: string;
  label: string;
  module: string;
  desc: string;
  dur: number;
}

export interface Suggestion {
  id: string;
  category: string;
  title: string;
  description: string;
  confidence: number;
  impact: SuggestionImpact;
  status: SuggestionStatus;
}

export interface Variant {
  id: string;
  style: string;
  label: string;
  tone: string;
}

export interface SegMask {
  label: string;
  sacred: boolean;
  conf: number;
}

export interface Material {
  surface: string;
  material: string;
  conf: number;
}

export interface EditAction {
  key: string;
  label: string;
  icon: string;
}

export interface EditHistoryEntry {
  id: string;
  action: string;
  target: string;
  value: string;
  time: string;
  applied: boolean;
}

export interface ExportFormat {
  key: string;
  label: string;
  desc: string;
}

export interface Resolution {
  key: string;
  label: string;
  dims: string;
  size: string;
}

export const DATA = {
  user: { name: "Abhi Joshi", initials: "AJ", org: "Houspire Labs" },

  styles: [
    { key: "modern_contemporary", label: "Modern Contemporary", tone: "warm",
      palette: ["#F0EAE0", "#C5B5A3", "#6B5848", "#2D2520"] },
    { key: "scandinavian", label: "Scandinavian", tone: "fresh",
      palette: ["#F5F3EE", "#D4CFC4", "#8A8579", "#3E3B36"] },
    { key: "mid_century_modern", label: "Mid-Century Modern", tone: "sun",
      palette: ["#E8D3B0", "#C89868", "#8B5A2B", "#3E2817"] },
    { key: "minimalist", label: "Minimalist", tone: "mono",
      palette: ["#FAFAF8", "#D2D2CE", "#8A8A86", "#3A3A36"] },
    { key: "luxury", label: "Luxury", tone: "evening",
      palette: ["#2C2440", "#5A4A72", "#B89A6C", "#EBD9B0"] },
    { key: "japandi", label: "Japandi", tone: "warm",
      palette: ["#EFE8DC", "#A99280", "#5B4A3C", "#2A231C"] },
  ] as StylePreset[],

  projects: [
    {
      id: "p_01", name: "214 Willow Crescent", city: "Austin, TX",
      description: "Colonial revival — 4bd/3ba listing for Stanton Realty",
      rooms: [
        { id: "r_01", label: "Living Room", type: "living_room", status: "staged", tone: "warm", thumbnail: "warm" },
        { id: "r_02", label: "Primary Bedroom", type: "bedroom", status: "generating", tone: "fresh" },
        { id: "r_03", label: "Kitchen", type: "kitchen", status: "analyzing", tone: "mono" },
        { id: "r_04", label: "Dining Room", type: "dining_room", status: "draft", tone: "sun" },
        { id: "r_05", label: "Home Office", type: "office", status: "uploaded", tone: "cool" },
      ],
      progress: 0.62, createdAt: "2026-04-12", updatedAt: "2026-04-19", tone: "warm",
    },
    {
      id: "p_02", name: "Clearwater Penthouse", city: "Miami, FL",
      description: "3bd/3ba oceanfront — Okalor Residential",
      rooms: [
        { id: "r_06", label: "Great Room", type: "living_room", status: "staged", tone: "sun" },
        { id: "r_07", label: "Primary Suite", type: "bedroom", status: "staged", tone: "evening" },
        { id: "r_08", label: "Guest Bedroom", type: "bedroom", status: "staged", tone: "cool" },
      ],
      progress: 1.0, createdAt: "2026-04-02", updatedAt: "2026-04-16", tone: "sun",
    },
    {
      id: "p_03", name: "Tindermill Loft", city: "Brooklyn, NY",
      description: "2bd industrial conversion — Kessler Group",
      rooms: [
        { id: "r_09", label: "Open Plan", type: "living_room", status: "staged", tone: "evening" },
        { id: "r_10", label: "Mezzanine Bed", type: "bedroom", status: "error", tone: "evening" },
      ],
      progress: 0.75, createdAt: "2026-03-28", updatedAt: "2026-04-14", tone: "evening",
    },
    {
      id: "p_04", name: "Cedarfield Cottage", city: "Portland, OR",
      description: "Craftsman — 3bd/2ba renovation marketing",
      rooms: [
        { id: "r_11", label: "Parlour", type: "living_room", status: "draft", tone: "fresh" },
        { id: "r_12", label: "Bedroom", type: "bedroom", status: "uploaded", tone: "fresh" },
      ],
      progress: 0.15, createdAt: "2026-04-17", updatedAt: "2026-04-18", tone: "fresh",
    },
  ] as Project[],

  pipelineStages: [
    { key: "render-to-photo", label: "Render → Photo", module: "M07", desc: "Photoreal base from sketch or empty-room photo", dur: 18 },
    { key: "fitout", label: "Fitout", module: "M10", desc: "Flooring, wall finishes, ceiling treatments", dur: 14 },
    { key: "furniture", label: "Furniture", module: "M11", desc: "Place furniture per scene graph + design brief", dur: 22 },
    { key: "exterior", label: "Exterior View", module: "M12", desc: "Geolocation-accurate window view", dur: 9 },
    { key: "lighting", label: "Lighting", module: "M08", desc: "Shadows, time-of-day atmosphere, relight", dur: 12 },
    { key: "harmonize", label: "Harmonize", module: "M09", desc: "Final color-grade pass, micro-contrast", dur: 7 },
  ] as PipelineStage[],

  suggestions: [
    { id: "s1", category: "furniture", title: "Add corner plant",
      description: "The southeast corner reads empty. A fiddle leaf fig (1.8m) would balance the sofa mass and draw the eye upward.",
      confidence: 0.89, impact: "medium", status: "pending" },
    { id: "s2", category: "lighting", title: "Warm the pendant",
      description: "Current temperature (4200K) fights the walnut tones. Dropping to 2900K will harmonize the whole scene.",
      confidence: 0.94, impact: "high", status: "pending" },
    { id: "s3", category: "material", title: "Rug texture mismatch",
      description: "Flatweave rug looks synthetic against the linen sofa. Consider a low-pile wool with subtle herringbone.",
      confidence: 0.76, impact: "medium", status: "accepted" },
    { id: "s4", category: "decor", title: "Tighten shelf styling",
      description: "Bookshelf feels cluttered. Reduce to 3 object groupings with 60/30/10 height ratio.",
      confidence: 0.82, impact: "low", status: "pending" },
    { id: "s5", category: "composition", title: "Lower camera 8cm",
      description: "Current angle clips the ceiling molding. A subtle drop recovers architectural character.",
      confidence: 0.71, impact: "medium", status: "rejected" },
  ] as Suggestion[],

  qualityScore: {
    overall: 0.87, grade: "A", passed: true, needs_review: false,
    scores: {
      photorealism: 0.91, composition: 0.84, lighting: 0.88,
      color_harmony: 0.85, sacred_zone: 0.98,
    },
  },

  variants: [
    { id: "v1", style: "modern_contemporary", label: "Modern Contemporary", tone: "warm" },
    { id: "v2", style: "scandinavian", label: "Scandinavian", tone: "fresh" },
    { id: "v3", style: "mid_century_modern", label: "Mid-Century Modern", tone: "sun" },
    { id: "v4", style: "minimalist", label: "Minimalist", tone: "mono" },
    { id: "v5", style: "luxury", label: "Luxury", tone: "evening" },
    { id: "v6", style: "japandi", label: "Japandi", tone: "warm" },
  ] as Variant[],

  masks: [
    { label: "floor", sacred: false, conf: 0.96 },
    { label: "wall-back", sacred: true, conf: 0.98 },
    { label: "wall-left", sacred: true, conf: 0.97 },
    { label: "ceiling", sacred: true, conf: 0.99 },
    { label: "window-1", sacred: true, conf: 0.95 },
    { label: "window-2", sacred: true, conf: 0.93 },
    { label: "door", sacred: true, conf: 0.96 },
    { label: "radiator", sacred: false, conf: 0.82 },
    { label: "molding", sacred: true, conf: 0.88 },
  ] as SegMask[],

  materials: [
    { surface: "floor", material: "Oak herringbone", conf: 0.91 },
    { surface: "walls", material: "Limewash plaster", conf: 0.84 },
    { surface: "ceiling", material: "Smooth plaster", conf: 0.96 },
    { surface: "trim", material: "Painted MDF", conf: 0.79 },
  ] as Material[],

  editActions: [
    { key: "material", label: "Material", icon: "layers" },
    { key: "color", label: "Color", icon: "palette" },
    { key: "style", label: "Style", icon: "sparkle" },
    { key: "add", label: "Add", icon: "plus" },
    { key: "remove", label: "Remove", icon: "trash" },
    { key: "swap", label: "Swap", icon: "refresh" },
  ] as EditAction[],

  editHistory: [
    { id: "e1", action: "color", target: "sofa", value: "deep emerald", time: "2m ago", applied: true },
    { id: "e2", action: "material", target: "flooring", value: "oak herringbone", time: "5m ago", applied: true },
    { id: "e3", action: "add", target: "corner plant", value: "fiddle leaf fig", time: "8m ago", applied: true },
    { id: "e4", action: "remove", target: "wall clock", value: "", time: "12m ago", applied: true },
  ] as EditHistoryEntry[],

  exportFormats: [
    { key: "png", label: "PNG", desc: "Lossless, web-ready, large file" },
    { key: "jpg", label: "JPG", desc: "Compressed, fastest sharing" },
    { key: "tiff", label: "TIFF", desc: "Print production master" },
    { key: "pdf", label: "PDF", desc: "Listing book, multi-page" },
    { key: "zip", label: "ZIP", desc: "Everything: variants + edits + masks" },
  ] as ExportFormat[],

  resolutions: [
    { key: "web", label: "Web", dims: "1920 × 1080", size: "1.4 MB" },
    { key: "print_a4", label: "Print A4", dims: "3508 × 2480", size: "8.2 MB" },
    { key: "print_a3", label: "Print A3", dims: "4961 × 3508", size: "16 MB" },
    { key: "original", label: "Original", dims: "5760 × 3840", size: "24 MB" },
  ] as Resolution[],
};

// M06 Design Intelligence & Prompt Engine — Next.js API Route
// Generates structured design briefs from prompts or auto-infers from context.
// Called by the design-brief Edge Function (fire-and-forget).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  validateUUID,
  sanitizeBrief,
  sanitizeText,
  assertValidEnum,
  SanitizeError,
  sanitizeErrorResponse,
} from '@/lib/sanitize'

export const maxDuration = 120 // 2 minutes for LLM calls

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BriefInput {
  room_id: string
  prompt?: string
  auto_generated?: boolean
  style_override?: string
  budget_tier?: string
  language?: string
}

interface FurnitureItem {
  type: string
  sub_type: string
  position: { x: number; y: number; z: number }
  dimensions: { w: number; d: number; h: number }
  material: string
  color: string
  rotation_deg: number
}

interface DesignBrief {
  style: { primary: string; substyle: string; era: string }
  color_palette: {
    dominant: { hex: string; pct: number }
    secondary: { hex: string; pct: number }
    accent: { hex: string; pct: number }
  }
  materials_palette: {
    floor: string
    walls: string
    ceiling: string
    furniture_primary: string
    furniture_accent: string
  }
  furniture_plan: FurnitureItem[]
  accessories: Array<{ type: string; placement: string; style: string }>
  photography: {
    lens_mm: number
    aperture: string
    dof_target: string
    color_grading: string
    white_balance_k: number
    grain_intensity: number
  }
  constraints: {
    sacred_zones: string[]
    style_boundaries: string[]
    budget_tier: string
  }
  fitout_requests: Array<{
    type: string
    subtype: string
    drop_mm: number
    material: string
  }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasLLMKey(): 'openai' | 'anthropic' | null {
  if (process.env.OPENAI_API_KEY) return 'openai'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  return null
}

/**
 * Build the system prompt for LLM-based brief generation.
 */
function buildLLMPrompt(context: {
  roomType: string
  prompt: string
  styleOverride?: string
  budgetTier?: string
  language?: string
  projectLocation?: string
  projectStyle?: string
  sceneGraph: Record<string, unknown> | null
  lightingAnalysis: Record<string, unknown> | null
  materialDetections: Array<Record<string, unknown>>
  styleProfiles: Array<Record<string, unknown>>
  furnitureSpecs: Array<Record<string, unknown>>
  constructionConstraints: Array<Record<string, unknown>>
  materialPalettes: Array<Record<string, unknown>>
}): string {
  return `You are a professional interior design AI for virtual staging.
Generate a structured design brief as JSON for a ${context.roomType} room.

PROJECT CONTEXT:
- Location: ${context.projectLocation ?? 'Unknown'}
- Design language: ${context.projectStyle ?? 'Modern contemporary'}
- Budget tier: ${context.budgetTier ?? 'mid-range'}
${context.language ? `- Output language: ${context.language}` : ''}
${context.styleOverride ? `- Style override: ${context.styleOverride}` : ''}

USER PROMPT:
${context.prompt}

ROOM DATA:
- Scene graph: ${context.sceneGraph ? JSON.stringify(context.sceneGraph) : 'Not available'}
- Lighting analysis: ${context.lightingAnalysis ? JSON.stringify(context.lightingAnalysis) : 'Not available'}
- Detected materials: ${JSON.stringify(context.materialDetections)}

KNOWLEDGE BASE:
- Available style profiles: ${JSON.stringify(context.styleProfiles.map((s) => ({ id: s.style_id, name: s.name, category: s.category })))}
- Furniture specs for ${context.roomType}: ${JSON.stringify(context.furnitureSpecs.map((f) => ({ id: f.spec_id, name: f.name, category: f.category, dimensions: f.dimensions })))}
- Construction constraints: ${JSON.stringify(context.constructionConstraints.map((c) => ({ id: c.constraint_id, type: c.constraint_type, description: c.description })))}
- Material palettes: ${JSON.stringify(context.materialPalettes.map((m) => ({ id: m.material_id, name: m.name, category: m.category })))}

REQUIREMENTS:
1. All furniture must fit within room dimensions (if scene graph available).
2. Maintain 90cm minimum circulation paths between furniture.
3. Do not place anything in sacred zones (doors, windows, columns, structural walls).
4. Color palette percentages must sum to 100.
5. Photography settings should be editorial-quality real estate photography defaults.

Return ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "style": { "primary": "string", "substyle": "string", "era": "string" },
  "color_palette": {
    "dominant": { "hex": "#XXXXXX", "pct": 60 },
    "secondary": { "hex": "#XXXXXX", "pct": 30 },
    "accent": { "hex": "#XXXXXX", "pct": 10 }
  },
  "materials_palette": {
    "floor": "material_id_or_name",
    "walls": "material_id_or_name",
    "ceiling": "material_id_or_name",
    "furniture_primary": "material_id_or_name",
    "furniture_accent": "material_id_or_name"
  },
  "furniture_plan": [
    { "type": "string", "sub_type": "string", "position": {"x":0,"y":0,"z":0}, "dimensions": {"w":0,"d":0,"h":0}, "material": "string", "color": "#hex", "rotation_deg": 0 }
  ],
  "accessories": [
    { "type": "string", "placement": "string", "style": "string" }
  ],
  "photography": {
    "lens_mm": 26, "aperture": "f/8", "dof_target": "deep",
    "color_grading": "warm_natural", "white_balance_k": 5200, "grain_intensity": 0.3
  },
  "constraints": {
    "sacred_zones": [],
    "style_boundaries": [],
    "budget_tier": "string"
  },
  "fitout_requests": []
}`
}

/**
 * Call OpenAI API for brief generation.
 */
async function callOpenAI(systemPrompt: string): Promise<DesignBrief> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`OpenAI API failed (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from OpenAI')

  return JSON.parse(content) as DesignBrief
}

/**
 * Call Anthropic API for brief generation.
 */
async function callAnthropic(systemPrompt: string): Promise<DesignBrief> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        { role: 'user', content: 'Generate the design brief JSON now.' },
      ],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Anthropic API failed (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const content = data.content?.[0]?.text
  if (!content) throw new Error('Empty response from Anthropic')

  // Extract JSON from response (may have markdown wrapping)
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in Anthropic response')

  return JSON.parse(jsonMatch[0]) as DesignBrief
}

// ---------------------------------------------------------------------------
// Room type default furniture layouts for mock/rule-based generation
// ---------------------------------------------------------------------------

const DEFAULT_FURNITURE: Record<string, FurnitureItem[]> = {
  living_room: [
    { type: 'sofa', sub_type: '3-seater', position: { x: 0.5, y: 3.0, z: 0 }, dimensions: { w: 2.2, d: 0.9, h: 0.85 }, material: 'fabric', color: '#8B7355', rotation_deg: 0 },
    { type: 'coffee_table', sub_type: 'rectangular', position: { x: 1.0, y: 1.8, z: 0 }, dimensions: { w: 1.2, d: 0.6, h: 0.45 }, material: 'wood', color: '#A0522D', rotation_deg: 0 },
    { type: 'armchair', sub_type: 'accent', position: { x: 3.0, y: 2.5, z: 0 }, dimensions: { w: 0.8, d: 0.85, h: 0.9 }, material: 'fabric', color: '#C5A55A', rotation_deg: 270 },
    { type: 'side_table', sub_type: 'round', position: { x: 3.0, y: 1.5, z: 0 }, dimensions: { w: 0.45, d: 0.45, h: 0.55 }, material: 'metal', color: '#B8860B', rotation_deg: 0 },
    { type: 'rug', sub_type: 'area', position: { x: 0.8, y: 1.5, z: 0 }, dimensions: { w: 2.4, d: 1.7, h: 0.02 }, material: 'wool', color: '#D2B48C', rotation_deg: 0 },
  ],
  bedroom: [
    { type: 'bed', sub_type: 'queen', position: { x: 1.0, y: 2.5, z: 0 }, dimensions: { w: 1.6, d: 2.0, h: 0.55 }, material: 'wood', color: '#8B7355', rotation_deg: 0 },
    { type: 'nightstand', sub_type: 'single_drawer', position: { x: 0.1, y: 2.5, z: 0 }, dimensions: { w: 0.5, d: 0.4, h: 0.55 }, material: 'wood', color: '#A0522D', rotation_deg: 0 },
    { type: 'nightstand', sub_type: 'single_drawer', position: { x: 3.0, y: 2.5, z: 0 }, dimensions: { w: 0.5, d: 0.4, h: 0.55 }, material: 'wood', color: '#A0522D', rotation_deg: 0 },
    { type: 'dresser', sub_type: 'wide', position: { x: 1.0, y: 0.3, z: 0 }, dimensions: { w: 1.4, d: 0.5, h: 0.8 }, material: 'wood', color: '#A0522D', rotation_deg: 0 },
  ],
  kitchen: [
    { type: 'island', sub_type: 'with_seating', position: { x: 1.5, y: 1.5, z: 0 }, dimensions: { w: 1.8, d: 0.9, h: 0.9 }, material: 'stone', color: '#F5F0E8', rotation_deg: 0 },
    { type: 'bar_stool', sub_type: 'counter_height', position: { x: 1.2, y: 0.8, z: 0 }, dimensions: { w: 0.4, d: 0.4, h: 0.75 }, material: 'metal', color: '#2F2F2F', rotation_deg: 0 },
    { type: 'bar_stool', sub_type: 'counter_height', position: { x: 1.8, y: 0.8, z: 0 }, dimensions: { w: 0.4, d: 0.4, h: 0.75 }, material: 'metal', color: '#2F2F2F', rotation_deg: 0 },
  ],
  dining_room: [
    { type: 'dining_table', sub_type: 'rectangular', position: { x: 1.5, y: 2.0, z: 0 }, dimensions: { w: 1.8, d: 0.9, h: 0.75 }, material: 'wood', color: '#8B7355', rotation_deg: 0 },
    { type: 'dining_chair', sub_type: 'upholstered', position: { x: 1.0, y: 1.3, z: 0 }, dimensions: { w: 0.5, d: 0.55, h: 0.9 }, material: 'fabric', color: '#C5A55A', rotation_deg: 0 },
    { type: 'dining_chair', sub_type: 'upholstered', position: { x: 2.0, y: 1.3, z: 0 }, dimensions: { w: 0.5, d: 0.55, h: 0.9 }, material: 'fabric', color: '#C5A55A', rotation_deg: 0 },
    { type: 'dining_chair', sub_type: 'upholstered', position: { x: 1.0, y: 2.7, z: 0 }, dimensions: { w: 0.5, d: 0.55, h: 0.9 }, material: 'fabric', color: '#C5A55A', rotation_deg: 180 },
    { type: 'dining_chair', sub_type: 'upholstered', position: { x: 2.0, y: 2.7, z: 0 }, dimensions: { w: 0.5, d: 0.55, h: 0.9 }, material: 'fabric', color: '#C5A55A', rotation_deg: 180 },
    { type: 'buffet', sub_type: 'sideboard', position: { x: 1.5, y: 4.0, z: 0 }, dimensions: { w: 1.6, d: 0.45, h: 0.85 }, material: 'wood', color: '#A0522D', rotation_deg: 0 },
  ],
  bathroom: [
    { type: 'vanity', sub_type: 'floating', position: { x: 1.0, y: 0.3, z: 0 }, dimensions: { w: 1.2, d: 0.55, h: 0.85 }, material: 'wood', color: '#8B7355', rotation_deg: 0 },
    { type: 'mirror', sub_type: 'rectangular', position: { x: 1.0, y: 0.05, z: 1.0 }, dimensions: { w: 1.0, d: 0.05, h: 0.8 }, material: 'glass', color: '#E8E8E8', rotation_deg: 0 },
  ],
}

const DEFAULT_ACCESSORIES: Record<string, Array<{ type: string; placement: string; style: string }>> = {
  living_room: [
    { type: 'throw_pillow', placement: 'sofa', style: 'textured' },
    { type: 'vase', placement: 'coffee_table', style: 'ceramic' },
    { type: 'books', placement: 'coffee_table', style: 'stacked' },
    { type: 'floor_lamp', placement: 'corner', style: 'arc' },
    { type: 'wall_art', placement: 'above_sofa', style: 'abstract' },
  ],
  bedroom: [
    { type: 'table_lamp', placement: 'nightstand', style: 'modern' },
    { type: 'throw_blanket', placement: 'bed_foot', style: 'knit' },
    { type: 'wall_art', placement: 'above_bed', style: 'landscape' },
    { type: 'plant', placement: 'dresser', style: 'potted' },
  ],
  kitchen: [
    { type: 'pendant_light', placement: 'above_island', style: 'industrial' },
    { type: 'fruit_bowl', placement: 'island', style: 'ceramic' },
    { type: 'herb_pots', placement: 'windowsill', style: 'terracotta' },
  ],
  dining_room: [
    { type: 'centerpiece', placement: 'table_center', style: 'floral' },
    { type: 'candle_holder', placement: 'table', style: 'brass' },
    { type: 'pendant_light', placement: 'above_table', style: 'modern' },
    { type: 'wall_art', placement: 'wall', style: 'botanical' },
  ],
  bathroom: [
    { type: 'towel_set', placement: 'towel_bar', style: 'folded' },
    { type: 'soap_dispenser', placement: 'vanity', style: 'ceramic' },
    { type: 'plant', placement: 'vanity_corner', style: 'succulent' },
  ],
}

// ---------------------------------------------------------------------------
// Style palettes for rule-based generation
// ---------------------------------------------------------------------------

const STYLE_PALETTES: Record<string, {
  style: DesignBrief['style']
  colors: DesignBrief['color_palette']
  materialTypes: DesignBrief['materials_palette']
}> = {
  modern_contemporary: {
    style: { primary: 'modern', substyle: 'contemporary', era: '2020s' },
    colors: {
      dominant: { hex: '#F5F0E8', pct: 60 },
      secondary: { hex: '#8B7355', pct: 30 },
      accent: { hex: '#C5A55A', pct: 10 },
    },
    materialTypes: {
      floor: 'engineered_hardwood',
      walls: 'matte_paint',
      ceiling: 'matte_paint',
      furniture_primary: 'walnut_veneer',
      furniture_accent: 'brushed_brass',
    },
  },
  scandinavian: {
    style: { primary: 'scandinavian', substyle: 'nordic_minimal', era: '2020s' },
    colors: {
      dominant: { hex: '#FAFAFA', pct: 60 },
      secondary: { hex: '#E8DCC8', pct: 30 },
      accent: { hex: '#6B8E6B', pct: 10 },
    },
    materialTypes: {
      floor: 'light_oak',
      walls: 'white_paint',
      ceiling: 'white_paint',
      furniture_primary: 'birch_plywood',
      furniture_accent: 'matte_black_steel',
    },
  },
  mid_century_modern: {
    style: { primary: 'mid-century modern', substyle: 'retro_organic', era: '1950s-1970s' },
    colors: {
      dominant: { hex: '#F0E6D0', pct: 60 },
      secondary: { hex: '#B5651D', pct: 30 },
      accent: { hex: '#2E8B57', pct: 10 },
    },
    materialTypes: {
      floor: 'teak_hardwood',
      walls: 'warm_white_paint',
      ceiling: 'warm_white_paint',
      furniture_primary: 'teak_veneer',
      furniture_accent: 'polished_brass',
    },
  },
  minimalist: {
    style: { primary: 'minimalist', substyle: 'japanese_inspired', era: '2020s' },
    colors: {
      dominant: { hex: '#FFFFFF', pct: 60 },
      secondary: { hex: '#D4CFC4', pct: 30 },
      accent: { hex: '#2F2F2F', pct: 10 },
    },
    materialTypes: {
      floor: 'pale_bamboo',
      walls: 'off_white_plaster',
      ceiling: 'off_white_plaster',
      furniture_primary: 'light_ash',
      furniture_accent: 'matte_concrete',
    },
  },
  luxury: {
    style: { primary: 'luxury', substyle: 'transitional', era: '2020s' },
    colors: {
      dominant: { hex: '#EDE8E0', pct: 60 },
      secondary: { hex: '#5C4033', pct: 30 },
      accent: { hex: '#DAA520', pct: 10 },
    },
    materialTypes: {
      floor: 'marble_tile',
      walls: 'silk_paint',
      ceiling: 'coffered_plaster',
      furniture_primary: 'mahogany_veneer',
      furniture_accent: 'polished_gold',
    },
  },
}

/**
 * Infer a style key from project location and market segment.
 */
function inferStyleFromContext(
  location?: string,
  marketSegment?: string,
  designLanguage?: string
): string {
  // If project has an explicit design language, try to match it
  if (designLanguage) {
    const normalized = designLanguage.toLowerCase().replace(/[\s-]+/g, '_')
    if (STYLE_PALETTES[normalized]) return normalized
    // Fuzzy match
    for (const key of Object.keys(STYLE_PALETTES)) {
      if (normalized.includes(key) || key.includes(normalized)) return key
    }
  }

  // Infer from market segment
  if (marketSegment) {
    const seg = marketSegment.toLowerCase()
    if (seg.includes('luxury') || seg.includes('premium')) return 'luxury'
    if (seg.includes('minimal') || seg.includes('urban')) return 'minimalist'
    if (seg.includes('scandi') || seg.includes('nordic')) return 'scandinavian'
  }

  // Default
  return 'modern_contemporary'
}

/**
 * Generate a mock/rule-based design brief when no LLM key is available.
 */
function generateMockBrief(context: {
  roomType: string
  styleKey: string
  budgetTier: string
  sacredZoneIds: string[]
  materialDetections: Array<Record<string, unknown>>
  furnitureSpecs: Array<Record<string, unknown>>
  materialPalettes: Array<Record<string, unknown>>
}): DesignBrief {
  const palette = STYLE_PALETTES[context.styleKey] ?? STYLE_PALETTES.modern_contemporary

  // Try to pick furniture from knowledge base specs if available
  let furniturePlan: FurnitureItem[]
  if (context.furnitureSpecs.length > 0) {
    furniturePlan = context.furnitureSpecs.slice(0, 6).map((spec, i) => ({
      type: (spec.category as string) ?? 'furniture',
      sub_type: (spec.name as string) ?? 'standard',
      position: { x: 0.5 + i * 1.2, y: 1.5, z: 0 },
      dimensions: (spec.dimensions as { w: number; d: number; h: number }) ?? { w: 1.0, d: 0.6, h: 0.8 },
      material: (spec.primary_material as string) ?? 'wood',
      color: palette.colors.secondary.hex,
      rotation_deg: 0,
    }))
  } else {
    furniturePlan = DEFAULT_FURNITURE[context.roomType] ?? DEFAULT_FURNITURE.living_room
  }

  // Try to match material palette to KB materials
  const materialsPalette = { ...palette.materialTypes }
  if (context.materialPalettes.length > 0) {
    const findMaterial = (category: string) => {
      const match = context.materialPalettes.find(
        (m) => (m.category as string)?.toLowerCase().includes(category)
      )
      return (match?.material_id as string) ?? materialsPalette[category as keyof typeof materialsPalette]
    }
    materialsPalette.floor = findMaterial('floor') ?? materialsPalette.floor
    materialsPalette.walls = findMaterial('wall') ?? materialsPalette.walls
  }

  // Complement color palette with detected materials
  const colors = { ...palette.colors }
  if (context.materialDetections.length > 0) {
    // Keep the palette as-is but note detected materials influence choices
    // In production this would do color harmony analysis
  }

  const accessories = DEFAULT_ACCESSORIES[context.roomType] ?? DEFAULT_ACCESSORIES.living_room

  return {
    style: palette.style,
    color_palette: colors,
    materials_palette: materialsPalette,
    furniture_plan: furniturePlan,
    accessories,
    photography: {
      lens_mm: 26,
      aperture: 'f/8',
      dof_target: 'deep',
      color_grading: 'warm_natural',
      white_balance_k: 5200,
      grain_intensity: 0.3,
    },
    constraints: {
      sacred_zones: context.sacredZoneIds,
      style_boundaries: context.styleKey === 'minimalist'
        ? ['no_ornate', 'no_heavy_patterns']
        : context.styleKey === 'scandinavian'
          ? ['no_heavy_dark', 'no_industrial']
          : [],
      budget_tier: context.budgetTier,
    },
    fitout_requests: [],
  }
}

/**
 * Validate a generated brief against room geometry and constraints.
 */
function validateBrief(
  brief: DesignBrief,
  sceneGraph: Record<string, unknown> | null,
  sacredZoneIds: string[]
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  // Check color palette sums to 100
  const totalPct =
    brief.color_palette.dominant.pct +
    brief.color_palette.secondary.pct +
    brief.color_palette.accent.pct
  if (totalPct !== 100) {
    warnings.push(`Color palette percentages sum to ${totalPct}, expected 100`)
  }

  // Check furniture against room dimensions if scene graph available
  if (sceneGraph) {
    const roomDims = (sceneGraph.graph_data as Record<string, unknown>)?.room_dimensions as
      { width?: number; depth?: number; height?: number } | undefined

    if (roomDims) {
      for (const item of brief.furniture_plan) {
        if (item.position.x + item.dimensions.w > (roomDims.width ?? Infinity)) {
          errors.push(`${item.type} (${item.sub_type}) exceeds room width`)
        }
        if (item.position.y + item.dimensions.d > (roomDims.depth ?? Infinity)) {
          errors.push(`${item.type} (${item.sub_type}) exceeds room depth`)
        }
      }

      // Check 90cm min circulation paths
      for (let i = 0; i < brief.furniture_plan.length; i++) {
        for (let j = i + 1; j < brief.furniture_plan.length; j++) {
          const a = brief.furniture_plan[i]
          const b = brief.furniture_plan[j]
          const gapX = Math.abs((a.position.x + a.dimensions.w) - b.position.x)
          const gapY = Math.abs((a.position.y + a.dimensions.d) - b.position.y)
          const minGap = Math.min(gapX, gapY)
          if (minGap < 0.9 && minGap > 0) {
            warnings.push(
              `Tight clearance (${(minGap * 100).toFixed(0)}cm) between ${a.type} and ${b.type}. Min recommended: 90cm`
            )
          }
        }
      }
    }
  }

  // Ensure sacred zones are referenced
  if (sacredZoneIds.length > 0 && brief.constraints.sacred_zones.length === 0) {
    warnings.push('Brief does not reference any sacred zones, but room has sacred elements')
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// POST /api/design-brief
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    // 1. Parse + sanitize input (Gap 3 — prompt injection defense)
    const body: BriefInput = await request.json()
    const room_id       = validateUUID(body.room_id, 'room_id')
    const prompt        = sanitizeBrief(body.prompt ?? '', 'prompt')
    const style_override = body.style_override
      ? sanitizeText(body.style_override, 'style_override', { maxLength: 200, allowNewlines: false })
      : undefined
    const budget_tier   = body.budget_tier
      ? assertValidEnum(body.budget_tier, ['economy', 'mid-range', 'premium', 'luxury'] as const, 'budget_tier')
      : 'mid-range'
    const language      = body.language
      ? sanitizeText(body.language, 'language', { maxLength: 50, allowNewlines: false })
      : undefined
    const auto_generated = body.auto_generated

    // 2. Fetch room data
    const { data: room, error: roomError } = await supabase
      .schema('core')
      .from('rooms')
      .select('id, room_type, project_id')
      .eq('id', room_id)
      .is('deleted_at', null)
      .single()

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    const roomType: string = room.room_type ?? 'living_room'
    const projectId: string = room.project_id

    // 3. Fetch project data
    const { data: project } = await supabase
      .schema('core')
      .from('projects')
      .select('id, name, location, design_language, market_segment')
      .eq('id', projectId)
      .single()

    // 4. Fetch scene graph
    const { data: sceneGraph } = await supabase
      .schema('scene')
      .from('scene_graphs')
      .select('*')
      .eq('room_id', room_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 5. Fetch lighting analysis
    const { data: lightingAnalysis } = await supabase
      .schema('scene')
      .from('lighting_analyses')
      .select('*')
      .eq('room_id', room_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 6. Fetch material detections
    const { data: materialDetections } = await supabase
      .schema('scene')
      .from('material_detections')
      .select('*')
      .eq('room_id', room_id)

    // 7. Fetch knowledge base data
    const { data: styleProfiles } = await supabase
      .schema('knowledge')
      .from('style_profiles')
      .select('*')
      .limit(20)

    const { data: furnitureSpecs } = await supabase
      .schema('knowledge')
      .from('furniture_specs')
      .select('*')
      .or(`room_type.eq.${roomType},room_type.is.null`)
      .limit(30)

    const { data: constructionConstraints } = await supabase
      .schema('knowledge')
      .from('construction_constraints')
      .select('*')
      .limit(50)

    const { data: materialPalettes } = await supabase
      .schema('knowledge')
      .from('materials')
      .select('*')
      .limit(50)

    // Fetch sacred zone IDs
    const { data: sacredMasks } = await supabase
      .schema('scene')
      .from('segmentation_masks')
      .select('id')
      .eq('room_id', room_id)
      .eq('is_sacred', true)

    const sacredZoneIds = (sacredMasks ?? []).map((m: Record<string, unknown>) => m.id as string)

    // 8. Generate brief
    let briefData: DesignBrief
    const resolvedBudgetTier = budget_tier ?? 'mid-range'

    if (auto_generated) {
      // ---- Zero-prompt mode ----
      const styleKey = inferStyleFromContext(
        project?.location,
        project?.market_segment,
        style_override ?? project?.design_language
      )

      const llmProvider = hasLLMKey()
      if (llmProvider) {
        // Use LLM even in auto mode, but with a system-generated prompt
        const autoPrompt = `Auto-stage this ${roomType} in ${styleKey.replace(/_/g, ' ')} style. ` +
          `Location: ${project?.location ?? 'unspecified'}. ` +
          `Market: ${project?.market_segment ?? 'general'}. ` +
          `Select furniture appropriate for ${resolvedBudgetTier} budget.`

        const systemPrompt = buildLLMPrompt({
          roomType,
          prompt: autoPrompt,
          styleOverride: style_override,
          budgetTier: resolvedBudgetTier,
          language,
          projectLocation: project?.location,
          projectStyle: project?.design_language,
          sceneGraph,
          lightingAnalysis,
          materialDetections: materialDetections ?? [],
          styleProfiles: styleProfiles ?? [],
          furnitureSpecs: furnitureSpecs ?? [],
          constructionConstraints: constructionConstraints ?? [],
          materialPalettes: materialPalettes ?? [],
        })

        briefData = llmProvider === 'openai'
          ? await callOpenAI(systemPrompt)
          : await callAnthropic(systemPrompt)
      } else {
        // Rule-based mock generation
        briefData = generateMockBrief({
          roomType,
          styleKey,
          budgetTier: resolvedBudgetTier,
          sacredZoneIds,
          materialDetections: materialDetections ?? [],
          furnitureSpecs: furnitureSpecs ?? [],
          materialPalettes: materialPalettes ?? [],
        })
      }
    } else {
      // ---- Prompt-based mode ----
      const llmProvider = hasLLMKey()

      if (llmProvider) {
        const systemPrompt = buildLLMPrompt({
          roomType,
          prompt: prompt ?? '',
          styleOverride: style_override,
          budgetTier: resolvedBudgetTier,
          language,
          projectLocation: project?.location,
          projectStyle: project?.design_language,
          sceneGraph,
          lightingAnalysis,
          materialDetections: materialDetections ?? [],
          styleProfiles: styleProfiles ?? [],
          furnitureSpecs: furnitureSpecs ?? [],
          constructionConstraints: constructionConstraints ?? [],
          materialPalettes: materialPalettes ?? [],
        })

        briefData = llmProvider === 'openai'
          ? await callOpenAI(systemPrompt)
          : await callAnthropic(systemPrompt)
      } else {
        // No LLM key — fall back to rule-based generation
        const styleKey = style_override
          ? style_override.toLowerCase().replace(/[\s-]+/g, '_')
          : inferStyleFromContext(
              project?.location,
              project?.market_segment,
              project?.design_language
            )

        briefData = generateMockBrief({
          roomType,
          styleKey,
          budgetTier: resolvedBudgetTier,
          sacredZoneIds,
          materialDetections: materialDetections ?? [],
          furnitureSpecs: furnitureSpecs ?? [],
          materialPalettes: materialPalettes ?? [],
        })
      }
    }

    // 9. Validate brief
    const validation = validateBrief(briefData, sceneGraph, sacredZoneIds)

    // 10. Store brief — set previous is_current=false, insert new version
    const { data: currentBrief } = await supabase
      .schema('generation')
      .from('design_briefs')
      .select('version')
      .eq('room_id', room_id)
      .eq('is_current', true)
      .maybeSingle()

    if (currentBrief) {
      await supabase
        .schema('generation')
        .from('design_briefs')
        .update({ is_current: false })
        .eq('room_id', room_id)
        .eq('is_current', true)
    }

    const newVersion = ((currentBrief?.version as number) ?? 0) + 1

    const { data: newBrief, error: insertError } = await supabase
      .schema('generation')
      .from('design_briefs')
      .insert({
        room_id,
        version: newVersion,
        is_current: true,
        brief_data: briefData,
        auto_generated: auto_generated ?? false,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json(
        { error: `Failed to store brief: ${insertError.message}` },
        { status: 500 }
      )
    }

    // Update room status
    await supabase
      .schema('core')
      .from('rooms')
      .update({ status: 'brief_generated' })
      .eq('id', room_id)

    return NextResponse.json({
      status: 'completed',
      room_id,
      brief_id: newBrief.id,
      version: newVersion,
      auto_generated: auto_generated ?? false,
      brief_data: briefData,
      validation,
    })
  } catch (err) {
    if (err instanceof SanitizeError) {
      return NextResponse.json(sanitizeErrorResponse(err), { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Design brief generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

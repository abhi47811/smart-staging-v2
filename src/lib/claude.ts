/**
 * Smart Staging v2 — Claude API helper
 *
 * M06  Prompt Conversion Engine: NL → structured design brief JSON
 * M14  Edit Command Parser: NL → structured edit action with ambiguity resolution
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL = 'claude-sonnet-4-6'

// ─── Base caller ──────────────────────────────────────────────────────────────
async function callClaude(
  system: string,
  user: string,
  maxTokens = 4096
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Claude API error (${res.status}): ${body}`)
  }

  const data = await res.json()
  return (data.content[0]?.text ?? '') as string
}

function extractJson<T>(raw: string): T {
  // Strip markdown fences if present
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/)
  const jsonStr = match?.[1] ?? match?.[0] ?? raw
  try {
    return JSON.parse(jsonStr.trim()) as T
  } catch {
    throw new Error(`Claude returned invalid JSON:\n${raw.slice(0, 500)}`)
  }
}

// ─── M06: Prompt Conversion Engine ───────────────────────────────────────────
export interface DesignBriefData {
  style: string
  sub_style?: string
  palette: { primary: string; secondary: string; accent: string; neutral: string }
  mood?: string
  furniture_plan: Array<{
    item: string
    style: string
    material: string
    color: string
    quantity?: number
    dimensions?: { w: number; d: number; h: number }
    position?: { x: number; y: number; z: number }
  }>
  fitout_requests: Array<{
    type: string
    subtype?: string
    finish?: string
    color?: string
    material?: string
  }>
  photography: {
    camera_angle: string
    focal_length_mm: number
    aperture: string
    lighting_style: string
  }
  constraints: {
    preserve_windows: boolean
    preserve_structural: boolean
    budget_tier: string
    vastu_compliant?: boolean
    sacred_zones: string[]
  }
}

export async function convertPromptToBrief(
  prompt: string,
  roomType: string,
  projectContext: {
    location?: string
    design_language?: string
    market_segment?: string
    name?: string
  },
  options?: {
    style_override?: string
    budget_tier?: string
    language?: string
  }
): Promise<DesignBriefData> {
  const system = `You are an expert Indian interior designer AI for Smart Staging — a platform converting 3D CG renders into photorealistic staged photographs. Convert natural language design prompts into structured JSON design briefs.

Output ONLY raw JSON (no markdown, no explanation). Follow this schema exactly:
{
  "style": "modern|contemporary|traditional|transitional|scandinavian|industrial|bohemian|minimalist|luxury|eclectic",
  "sub_style": "optional refinement string",
  "palette": {
    "primary": "#hexcolor",
    "secondary": "#hexcolor",
    "accent": "#hexcolor",
    "neutral": "#hexcolor"
  },
  "mood": "brief mood description",
  "furniture_plan": [
    {
      "item": "furniture name",
      "style": "style descriptor",
      "material": "main material",
      "color": "color name or hex",
      "quantity": 1,
      "dimensions": { "w": 2.0, "d": 0.9, "h": 0.8 },
      "position": { "x": 0.5, "y": 0.5, "z": 0.0 }
    }
  ],
  "fitout_requests": [
    {
      "type": "false_ceiling|wall_paneling|wardrobe|tv_wall|kitchen|bathroom|curtains|flooring|moldings|lighting_fixture",
      "subtype": "specific type",
      "finish": "finish type",
      "color": "color",
      "material": "material"
    }
  ],
  "photography": {
    "camera_angle": "straight_on|three_quarter|corner|low_angle|overhead",
    "focal_length_mm": 35,
    "aperture": "f/2.8",
    "lighting_style": "natural_day|golden_hour|evening_ambiance|dramatic|flat_bright"
  },
  "constraints": {
    "preserve_windows": true,
    "preserve_structural": true,
    "budget_tier": "economy|standard|premium|luxury",
    "vastu_compliant": false,
    "sacred_zones": []
  }
}

Context: Indian market, cities include Hyderabad, Bangalore, Mumbai, Delhi, Pune, Chennai. Incorporate Vastu principles when relevant. Use warm neutrals and rich accent colors for modern Indian aesthetic.`

  const userMsg = `Project: ${projectContext.name ?? 'Unnamed'}
Room type: ${roomType}
Location: ${projectContext.location ?? 'India'}
Design language preference: ${projectContext.design_language ?? 'not specified'}
Market segment: ${projectContext.market_segment ?? 'residential'}
${options?.style_override ? `Style override: ${options.style_override}` : ''}
${options?.budget_tier ? `Budget tier: ${options.budget_tier}` : ''}
${options?.language ? `Language/cultural notes: ${options.language}` : ''}

User prompt: "${prompt}"

Generate the structured design brief JSON.`

  const raw = await callClaude(system, userMsg)
  return extractJson<DesignBriefData>(raw)
}

// Auto-brief: generate without user prompt (zero-prompt mode)
export async function generateAutoBrief(
  roomType: string,
  projectContext: {
    location?: string
    design_language?: string
    market_segment?: string
    name?: string
  },
  sceneContext?: {
    detected_style?: string
    dominant_colors?: string[]
    room_dimensions?: { width?: number; depth?: number; height?: number }
  }
): Promise<DesignBriefData> {
  const prompt = `Create an optimal ${roomType} design that maximizes appeal for the ${
    projectContext.market_segment ?? 'residential'
  } market in ${projectContext.location ?? 'India'}.
${sceneContext?.detected_style ? `The existing space has a ${sceneContext.detected_style} aesthetic.` : ''}
${sceneContext?.dominant_colors?.length ? `Dominant colors detected: ${sceneContext.dominant_colors.join(', ')}.` : ''}
Make it photogenic, aspirational, and market-appropriate.`

  return convertPromptToBrief(prompt, roomType, projectContext)
}

// ─── M14: Edit Command Parser ─────────────────────────────────────────────────
export interface ParsedEditCommand {
  action: 'replace' | 'add' | 'remove' | 'recolor' | 'relight' | 'retexture' | 'restyle' | 'adjust_camera' | 'swap_material'
  target: string
  scope: 'global' | 'zone' | 'layer'
  layer: 0 | 1 | 2 | null
  parameters: {
    style?: string
    color?: string
    material?: string
    intensity?: number
    camera_angle?: string
    finish?: string
    prompt_addition?: string
  }
  confidence: number
  ambiguous: boolean
  clarification_options: string[]
  negative_prompt?: string
}

export async function parseEditCommand(
  prompt: string,
  sceneContext: {
    room_type?: string
    current_style?: string
    current_palette?: Record<string, string>
    layers?: Array<{ layer: number; label: string; element_type?: string }>
  }
): Promise<ParsedEditCommand> {
  const system = `You are an expert interior design edit command parser for Smart Staging. Convert natural language edit commands into structured JSON.

Scene layers:
  Layer 0 = architecture (walls, floors, ceiling, windows) — SACRED/STRUCTURAL, rarely modified
  Layer 1 = fitout (false ceiling, wall paneling, wardrobes, TV walls, flooring) — construction elements
  Layer 2 = staging (furniture, decor, soft furnishings, accessories) — freely changeable

Output ONLY raw JSON:
{
  "action": "replace|add|remove|recolor|relight|retexture|restyle|adjust_camera|swap_material",
  "target": "what to change (be specific)",
  "scope": "global|zone|layer",
  "layer": 0|1|2|null,
  "parameters": {
    "style": "optional style",
    "color": "#optional_hex",
    "material": "optional material name",
    "intensity": 0.7,
    "camera_angle": "optional angle",
    "finish": "optional finish",
    "prompt_addition": "text to add to generation prompt"
  },
  "confidence": 0.95,
  "ambiguous": false,
  "clarification_options": [],
  "negative_prompt": "optional negative prompt to remove"
}`

  const layerCtx = sceneContext.layers
    ?.map((l) => `  Layer ${l.layer}: ${l.label}`)
    .join('\n') ?? '  No scene elements detected'

  const userMsg = `Room type: ${sceneContext.room_type ?? 'unknown'}
Current style: ${sceneContext.current_style ?? 'not set'}
Current palette: ${JSON.stringify(sceneContext.current_palette ?? {})}
Scene elements:
${layerCtx}

Edit command: "${prompt}"

Parse into structured edit action. Set ambiguous=true and provide clarification_options if the command could be interpreted multiple ways.`

  const raw = await callClaude(system, userMsg, 1024)
  return extractJson<ParsedEditCommand>(raw)
}

// ─── Style DNA extractor ──────────────────────────────────────────────────────
export interface StyleDNAData {
  primary_style: string
  secondary_styles: string[]
  color_dna: {
    palette: string[]
    temperature: 'warm' | 'cool' | 'neutral'
    saturation: 'muted' | 'medium' | 'vivid'
  }
  material_dna: {
    dominant_materials: string[]
    finish_preference: string
    texture_density: 'minimal' | 'moderate' | 'rich'
  }
  furniture_dna: {
    silhouette: 'angular' | 'curved' | 'mixed'
    scale: 'compact' | 'standard' | 'oversized'
    arrangement_style: string
  }
  lighting_dna: {
    preferred_style: string
    natural_light_usage: 'minimal' | 'moderate' | 'maximized'
    artificial_layers: string[]
  }
  cultural_elements: string[]
  design_principles: string[]
  confidence: number
}

export async function extractStyleDNA(
  imageDescriptions: string[],
  roomType: string
): Promise<StyleDNAData> {
  const system = `You are an expert interior design analyst. Extract a "Style DNA" — a comprehensive design fingerprint — from descriptions of completed interior design renders. Output ONLY raw JSON matching the StyleDNAData schema.`

  const userMsg = `Room type: ${roomType}
Number of reference images: ${imageDescriptions.length}

Image analysis descriptions:
${imageDescriptions.map((d, i) => `[Image ${i + 1}]: ${d}`).join('\n\n')}

Extract the Style DNA as JSON.`

  const raw = await callClaude(system, userMsg, 2048)
  return extractJson<StyleDNAData>(raw)
}

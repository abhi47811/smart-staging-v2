// Render Suggestions Analysis — Next.js API Route
// AI-powered analysis of generated renders to suggest improvements.
// Uses VLM when API key available, falls back to rule-based heuristics.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateUUID, SanitizeError, sanitizeErrorResponse } from '@/lib/sanitize'

export const maxDuration = 120

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Suggestion {
  category: string
  title: string
  description: string
  confidence: number
  impact: 'low' | 'medium' | 'high'
  parameter_changes: Record<string, unknown>
}

interface QualityScores {
  composition_score: number | null
  lighting_score: number | null
  material_score: number | null
  photorealism_score: number | null
  overall_score: number | null
}

// ---------------------------------------------------------------------------
// POST /api/suggestions
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()
    const room_id = validateUUID(body.room_id, 'room_id')
    const run_id  = validateUUID(body.run_id,  'run_id')

    // ---------------------------------------------------------------------
    // 1. Fetch room data and project context
    // ---------------------------------------------------------------------
    const { data: room, error: roomError } = await supabase
      .schema('core')
      .from('rooms')
      .select('*, projects(id, name, style, market_segment)')
      .eq('id', room_id)
      .is('deleted_at', null)
      .single()

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    const project = Array.isArray(room.projects) ? room.projects[0] : room.projects
    const style = project?.style ?? 'modern'
    const marketSegment = project?.market_segment ?? 'mid-range'
    const roomType = room.room_type ?? 'living_room'

    // ---------------------------------------------------------------------
    // 2. Fetch current design brief
    // ---------------------------------------------------------------------
    const { data: brief } = await supabase
      .schema('generation')
      .from('design_briefs')
      .select('*')
      .eq('room_id', room_id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const briefData = brief?.brief_data ?? {}
    const currentFurniture: string[] = briefData.furniture_list ?? []

    // ---------------------------------------------------------------------
    // 3. Fetch quality scores for this run
    // ---------------------------------------------------------------------
    const { data: qualityScores } = await supabase
      .schema('quality')
      .from('quality_scores')
      .select('*')
      .eq('run_id', run_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const scores: QualityScores = {
      composition_score: qualityScores?.composition_score ?? null,
      lighting_score: qualityScores?.lighting_score ?? null,
      material_score: qualityScores?.material_score ?? null,
      photorealism_score: qualityScores?.photorealism_score ?? null,
      overall_score: qualityScores?.overall_score ?? null,
    }

    // ---------------------------------------------------------------------
    // 4. Fetch scene graph (elements, room dimensions)
    // ---------------------------------------------------------------------
    const { data: sceneElements } = await supabase
      .schema('scene')
      .from('segmentation_masks')
      .select('label, is_sacred, confidence_score')
      .eq('room_id', room_id)

    const elementLabels = (sceneElements ?? []).map((e) => e.label)

    // Room dimensions from depth/scene data
    const { data: roomDimensions } = await supabase
      .schema('scene')
      .from('room_measurements')
      .select('width_mm, length_mm, height_mm')
      .eq('room_id', room_id)
      .limit(1)
      .maybeSingle()

    const dimensions = {
      width: roomDimensions?.width_mm ?? 4000,
      length: roomDimensions?.length_mm ?? 5000,
      height: roomDimensions?.height_mm ?? 2700,
    }

    // ---------------------------------------------------------------------
    // 5. Fetch knowledge base context
    // ---------------------------------------------------------------------
    const { data: styleProfile } = await supabase
      .schema('knowledge')
      .from('styles')
      .select('*')
      .ilike('style_id', `%${style}%`)
      .limit(1)
      .maybeSingle()

    const { data: furnitureSpecs } = await supabase
      .schema('knowledge')
      .from('furniture')
      .select('*')
      .ilike('room_type', `%${roomType}%`)
      .limit(20)

    const availableFurniture = (furnitureSpecs ?? []).map((f) => f.name ?? f.spec_id)

    const { data: materialRules } = await supabase
      .schema('knowledge')
      .from('materials')
      .select('name, category, compatible_styles')
      .limit(30)

    // ---------------------------------------------------------------------
    // 6. Generate suggestions (AI or rule-based)
    // ---------------------------------------------------------------------
    let suggestions: Suggestion[]

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    const openaiKey = process.env.OPENAI_API_KEY

    if (anthropicKey || openaiKey) {
      suggestions = await generateAISuggestions({
        roomType,
        style,
        marketSegment,
        currentFurniture,
        scores,
        dimensions,
        elementLabels,
        styleProfile,
        availableFurniture,
        materialRules: materialRules ?? [],
        anthropicKey,
        openaiKey,
      })
    } else {
      suggestions = generateRuleBasedSuggestions({
        roomType,
        style,
        currentFurniture,
        scores,
        elementLabels,
        availableFurniture,
        briefData,
      })
    }

    // ---------------------------------------------------------------------
    // 7. Store suggestions
    // ---------------------------------------------------------------------
    const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }

    // Sort by impact (high first) then confidence DESC
    suggestions.sort((a, b) => {
      const impactDiff = (impactOrder[a.impact] ?? 2) - (impactOrder[b.impact] ?? 2)
      if (impactDiff !== 0) return impactDiff
      return b.confidence - a.confidence
    })

    const rows = suggestions.map((s, idx) => ({
      run_id,
      room_id,
      category: s.category,
      title: s.title,
      description: s.description,
      confidence: s.confidence,
      impact: s.impact,
      parameter_changes: s.parameter_changes,
      sort_order: idx,
      status: 'pending',
    }))

    const { data: inserted, error: insertError } = await supabase
      .schema('quality')
      .from('render_suggestions')
      .insert(rows)
      .select()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json(inserted)
  } catch (err) {
    if (err instanceof SanitizeError) {
      return NextResponse.json(sanitizeErrorResponse(err), { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Suggestion analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// AI-powered suggestion generation (Anthropic or OpenAI)
// ---------------------------------------------------------------------------

interface AIContext {
  roomType: string
  style: string
  marketSegment: string
  currentFurniture: string[]
  scores: QualityScores
  dimensions: { width: number; length: number; height: number }
  elementLabels: string[]
  styleProfile: Record<string, unknown> | null
  availableFurniture: string[]
  materialRules: Record<string, unknown>[]
  anthropicKey?: string
  openaiKey?: string
}

async function generateAISuggestions(ctx: AIContext): Promise<Suggestion[]> {
  const prompt = buildAnalysisPrompt(ctx)

  try {
    if (ctx.anthropicKey) {
      return await callAnthropic(ctx.anthropicKey, prompt)
    }
    if (ctx.openaiKey) {
      return await callOpenAI(ctx.openaiKey, prompt)
    }
  } catch {
    // Fall back to rule-based if AI call fails
  }

  return generateRuleBasedSuggestions({
    roomType: ctx.roomType,
    style: ctx.style,
    currentFurniture: ctx.currentFurniture,
    scores: ctx.scores,
    elementLabels: ctx.elementLabels,
    availableFurniture: ctx.availableFurniture,
    briefData: {},
  })
}

function buildAnalysisPrompt(ctx: AIContext): string {
  return `Analyze this staged interior render. Room type: ${ctx.roomType}, Style: ${ctx.style}, Market: ${ctx.marketSegment}.
Current furniture: ${ctx.currentFurniture.join(', ') || 'none listed'}.
Quality scores: composition=${ctx.scores.composition_score ?? 'N/A'}, lighting=${ctx.scores.lighting_score ?? 'N/A'}, material=${ctx.scores.material_score ?? 'N/A'}, photorealism=${ctx.scores.photorealism_score ?? 'N/A'}, overall=${ctx.scores.overall_score ?? 'N/A'}.
Room dimensions: ${ctx.dimensions.width}x${ctx.dimensions.length}x${ctx.dimensions.height}mm.
Detected elements: ${ctx.elementLabels.join(', ') || 'none'}.
Available furniture not yet used: ${ctx.availableFurniture.filter((f) => !ctx.currentFurniture.includes(f)).join(', ') || 'none'}.
Style profile: ${ctx.styleProfile ? JSON.stringify(ctx.styleProfile) : 'N/A'}.

Suggest 3-8 improvements. For each suggestion provide a JSON object with:
- category: one of [composition, lighting, color_palette, furniture, decor, material, scale, photography, style]
- title: short label (5-10 words)
- description: detailed explanation (1-2 sentences)
- confidence: 0.0-1.0
- impact: low/medium/high
- parameter_changes: JSON object with specific design brief changes

Focus on: empty corners needing decor, lighting improvements, color balance, proportion issues, missing accessories, style coherence.

Return ONLY a JSON array of suggestion objects, no other text.`
}

async function callAnthropic(apiKey: string, prompt: string): Promise<Suggestion[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  const data = await response.json()
  const text = data.content?.[0]?.text ?? '[]'
  return parseSuggestions(text)
}

async function callOpenAI(apiKey: string, prompt: string): Promise<Suggestion[]> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert interior designer and virtual staging quality analyst. Return only valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2048,
      temperature: 0.4,
    }),
  })

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content ?? '[]'
  return parseSuggestions(text)
}

function parseSuggestions(text: string): Suggestion[] {
  // Extract JSON array from response (handle markdown code fences)
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  try {
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    const validCategories = new Set([
      'composition', 'lighting', 'color_palette', 'furniture',
      'decor', 'material', 'scale', 'photography', 'style',
    ])
    const validImpacts = new Set(['low', 'medium', 'high'])

    return parsed
      .filter(
        (s: Record<string, unknown>) =>
          validCategories.has(s.category as string) &&
          typeof s.title === 'string' &&
          typeof s.description === 'string' &&
          typeof s.confidence === 'number' &&
          validImpacts.has(s.impact as string)
      )
      .map((s: Record<string, unknown>) => ({
        category: s.category as string,
        title: s.title as string,
        description: s.description as string,
        confidence: Math.max(0, Math.min(1, s.confidence as number)),
        impact: s.impact as 'low' | 'medium' | 'high',
        parameter_changes: (s.parameter_changes as Record<string, unknown>) ?? {},
      }))
      .slice(0, 8)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Rule-based suggestion generation (fallback / mock mode)
// ---------------------------------------------------------------------------

interface RuleContext {
  roomType: string
  style: string
  currentFurniture: string[]
  scores: QualityScores
  elementLabels: string[]
  availableFurniture: string[]
  briefData: Record<string, unknown>
}

function generateRuleBasedSuggestions(ctx: RuleContext): Suggestion[] {
  const suggestions: Suggestion[] = []

  // Rule 1: Check if room has plants — if not, suggest adding one
  const hasPlants = ctx.elementLabels.some((l) =>
    /plant|fern|succulent|greenery/i.test(l)
  ) || ctx.currentFurniture.some((f) => /plant|fern|succulent|greenery/i.test(f))

  if (!hasPlants) {
    suggestions.push({
      category: 'decor',
      title: 'Add a statement plant for visual warmth',
      description:
        'The room lacks greenery. Adding a potted plant in a visible corner would soften the space and improve visual appeal for buyers.',
      confidence: 0.85,
      impact: 'medium',
      parameter_changes: {
        add_elements: [{ type: 'plant', subtype: 'fiddle_leaf_fig', placement: 'corner' }],
      },
    })
  }

  // Rule 2: Lighting score below threshold
  if (ctx.scores.lighting_score !== null && ctx.scores.lighting_score < 0.7) {
    suggestions.push({
      category: 'lighting',
      title: 'Switch to golden hour lighting variant',
      description:
        `Lighting score is ${ctx.scores.lighting_score.toFixed(2)}. A warm golden-hour lighting setup would create a more inviting atmosphere and improve perceived quality.`,
      confidence: 0.82,
      impact: 'high',
      parameter_changes: {
        lighting: {
          time_of_day: 'golden_hour',
          color_temperature_k: 4500,
          ambient_boost: 0.15,
        },
      },
    })
  }

  // Rule 3: Composition score below threshold
  if (ctx.scores.composition_score !== null && ctx.scores.composition_score < 0.7) {
    suggestions.push({
      category: 'composition',
      title: 'Add a visual anchor to ground the layout',
      description:
        `Composition score is ${ctx.scores.composition_score.toFixed(2)}. Adding an area rug or coffee table as a central visual anchor would improve the room's balance.`,
      confidence: 0.78,
      impact: 'high',
      parameter_changes: {
        add_elements: [{ type: 'rug', subtype: 'area_rug', placement: 'center' }],
        composition: { focal_point: 'center', balance: 'symmetric' },
      },
    })
  }

  // Rule 4: Check for monotone color palette
  const hasAccentColor = ctx.currentFurniture.some((f) =>
    /accent|colorful|bright|vibrant/i.test(f)
  )
  if (!hasAccentColor) {
    suggestions.push({
      category: 'color_palette',
      title: 'Introduce an accent color for depth',
      description:
        'The staging appears tonally uniform. Adding throw pillows or artwork with an accent color that complements the style would create visual interest.',
      confidence: 0.72,
      impact: 'medium',
      parameter_changes: {
        color_palette: { add_accent: true, accent_type: 'complementary' },
        add_elements: [
          { type: 'throw_pillow', color: 'accent', placement: 'sofa' },
          { type: 'artwork', color: 'accent', placement: 'wall' },
        ],
      },
    })
  }

  // Rule 5: Scale violations — check if any furniture proportion seems off
  if (ctx.scores.material_score !== null && ctx.scores.material_score < 0.65) {
    suggestions.push({
      category: 'scale',
      title: 'Adjust furniture proportions to room size',
      description:
        'Some furniture items may be out of proportion with the room dimensions. Resizing key pieces to match standard proportion rules would improve realism.',
      confidence: 0.68,
      impact: 'high',
      parameter_changes: {
        scale_correction: { auto_fit: true, reference: 'room_dimensions' },
      },
    })
  }

  // Rule 6: Empty corners — check if detected elements are sparse
  const hasCornerElements = ctx.elementLabels.some((l) =>
    /lamp|plant|shelf|bookcase|console|side_table/i.test(l)
  )
  if (!hasCornerElements && ctx.elementLabels.length < 6) {
    suggestions.push({
      category: 'furniture',
      title: 'Fill empty corners with accent furniture',
      description:
        'The room has sparse corners. Adding a floor lamp or accent shelf would make the space feel more complete and livable.',
      confidence: 0.75,
      impact: 'medium',
      parameter_changes: {
        add_elements: [
          { type: 'floor_lamp', placement: 'corner', style: ctx.style },
          { type: 'side_table', placement: 'corner', style: ctx.style },
        ],
      },
    })
  }

  // Rule 7: Photography — check overall/photorealism score
  if (
    ctx.scores.photorealism_score !== null &&
    ctx.scores.photorealism_score < 0.75
  ) {
    suggestions.push({
      category: 'photography',
      title: 'Enhance camera angle and depth of field',
      description:
        `Photorealism score is ${ctx.scores.photorealism_score.toFixed(2)}. A slightly lower camera angle with shallow depth of field would improve the realistic feel of the render.`,
      confidence: 0.7,
      impact: 'medium',
      parameter_changes: {
        camera: {
          height_offset_mm: -200,
          depth_of_field: 'shallow',
          focal_length_mm: 35,
        },
      },
    })
  }

  // Rule 8: Style coherence — if style profile available, check for mismatches
  if (ctx.availableFurniture.length > 0) {
    const unusedStyleFurniture = ctx.availableFurniture
      .filter((f) => !ctx.currentFurniture.includes(f))
      .slice(0, 2)

    if (unusedStyleFurniture.length > 0) {
      suggestions.push({
        category: 'style',
        title: `Consider adding ${ctx.style} style elements`,
        description:
          `Available ${ctx.style} furniture not yet placed: ${unusedStyleFurniture.join(', ')}. Adding these would strengthen style coherence.`,
        confidence: 0.65,
        impact: 'low',
        parameter_changes: {
          add_elements: unusedStyleFurniture.map((name) => ({
            type: 'furniture',
            name,
            style: ctx.style,
          })),
        },
      })
    }
  }

  return suggestions
}

// M16 Multi-Variant & Style Intelligence — Next.js API Route
// Generates N design variants from a single analysis pass and extracts Style DNA.
// Called by the variants Edge Function (fire-and-forget).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createPipelineRun,
  completePipelineRun,
  failPipelineRun,
} from '@/lib/pipeline'
import {
  fetchSceneContext,
  storeGenerationResult,
  getReplicateClient,
} from '@/lib/generation'
import type { SceneContext, StageResult } from '@/lib/generation'
import {
  extractStyleDNA,
  generateVariationParams,
  applyVariationToBrief,
} from '@/lib/style-dna'
import type { StyleDNAData, VariationParam } from '@/lib/style-dna'
import { validateUUID, SanitizeError, sanitizeErrorResponse } from '@/lib/sanitize'

export const maxDuration = 300 // 5 minutes

// ---------------------------------------------------------------------------
// Pipeline stage imports (same as /api/generate)
// ---------------------------------------------------------------------------

import { executeRenderToPhoto } from '../generate/render-to-photo/route'
import { executeFitoutGeneration } from '../generate/fitout/route'
import { executeFurnitureGeneration } from '../generate/furniture/route'
import { executeExteriorGeneration } from '../generate/exterior/route'
import { executeLightingShadow } from '../generate/lighting/route'
import { executeHarmonization } from '../generate/harmonize/route'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VariantGenerateInput {
  room_id: string
  count: number
  style_dna_id?: string
  variation_params?: VariationParam[]
  run_ids?: string[]       // Pre-created by edge function
  parent_run_id?: string
}

interface StyleExtractInput {
  room_id?: string
  run_id?: string
  name: string
  org_id: string
  project_id?: string
  from_references?: boolean
  image_paths?: string[]
}

interface VariantResult {
  variant_index: number
  run_id: string
  status: 'completed' | 'failed'
  brief_id?: string
  results: Record<string, StageResult | null>
  error?: string
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
 * Fetch the current design brief for a room.
 */
async function fetchCurrentBrief(
  supabase: ReturnType<Awaited<ReturnType<typeof createClient>> extends infer T ? () => T : never> extends () => infer U ? U : never,
  roomId: string
) {
  const { data, error } = await (supabase as any)
    .schema('generation')
    .from('design_briefs')
    .select('*')
    .eq('room_id', roomId)
    .eq('is_current', true)
    .maybeSingle()

  if (error) throw new Error(`Failed to fetch design brief: ${error.message}`)
  return data as Record<string, unknown> | null
}

/**
 * Store a variant design brief.
 */
async function storeVariantBrief(
  supabase: any,
  roomId: string,
  briefData: Record<string, unknown>,
  variantIndex: number,
  baseVersion: number
) {
  const { data, error } = await supabase
    .schema('generation')
    .from('design_briefs')
    .insert({
      room_id: roomId,
      version: baseVersion + variantIndex + 1,
      is_current: false,   // Variants are not the "current" brief
      brief_data: briefData,
      auto_generated: true,
      user_prompt: `Variant ${variantIndex + 1}`,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to store variant brief: ${error.message}`)
  return data as Record<string, unknown>
}

/**
 * Run the full generation pipeline for a single variant.
 */
async function runVariantPipeline(
  supabase: any,
  roomId: string,
  runId: string
): Promise<Record<string, StageResult | null>> {
  const results: Record<string, StageResult | null> = {
    render_to_photo: null,
    fitout: null,
    furniture: null,
    exterior: null,
    lighting: null,
    harmonized: null,
    final: null,
  }

  const stages = [
    { key: 'render_to_photo', execute: () => executeRenderToPhoto(roomId, runId) },
    { key: 'fitout', execute: () => executeFitoutGeneration(roomId, runId) },
    { key: 'furniture', execute: () => executeFurnitureGeneration(roomId, runId) },
    { key: 'exterior', execute: () => executeExteriorGeneration(roomId, runId) },
    { key: 'lighting', execute: () => executeLightingShadow(roomId, runId) },
    { key: 'harmonized', execute: () => executeHarmonization(roomId, runId) },
  ]

  for (const stage of stages) {
    const stageResult = await stage.execute()
    results[stage.key] = stageResult
    if (stage.key === 'harmonized') {
      results.final = stageResult
    }
  }

  return results
}

/**
 * Extract Style DNA from a completed room (mock mode).
 * In production this would use CLIP embeddings and VLM.
 */
async function extractStyleDNAFromRoom(
  supabase: any,
  roomId: string,
  runId?: string
): Promise<{ dnaData: StyleDNAData; confidence: number }> {
  // Fetch the design brief
  const brief = await fetchCurrentBrief(supabase, roomId)
  if (!brief) throw new Error('No design brief found for this room')

  // Fetch generation results
  let resultsQuery = supabase
    .schema('generation')
    .from('generation_results')
    .select('*')
    .eq('room_id', roomId)

  if (runId) {
    resultsQuery = resultsQuery.eq('run_id', runId)
  }

  const { data: results } = await resultsQuery
    .order('created_at', { ascending: false })
    .limit(10)

  // Fetch scene context for material/lighting enrichment
  let sceneContext: Record<string, unknown> = {}
  try {
    const ctx = await fetchSceneContext(supabase, roomId)
    sceneContext = ctx as unknown as Record<string, unknown>
  } catch {
    // Scene context is optional for extraction
  }

  const dnaData = extractStyleDNA(brief, results ?? [], sceneContext)

  // Confidence is higher when we have more data sources
  let confidence = 0.6
  if (results && results.length > 0) confidence += 0.1
  if (sceneContext.lightingAnalysis) confidence += 0.1
  if (sceneContext.materialDetections) confidence += 0.1
  confidence = Math.min(1, confidence)

  return { dnaData, confidence }
}

/**
 * Extract Style DNA from reference images (mock mode).
 * In production this would use CLIP to encode each image and compute
 * average style embeddings, then use VLM to describe the style.
 */
function extractStyleDNAFromReferences(
  imagePaths: string[]
): { dnaData: StyleDNAData; confidence: number } {
  // Mock extraction — in production, each image would be:
  // 1. Encoded with CLIP to get visual embeddings
  // 2. Analyzed by VLM for style description
  // 3. Averaged across all reference images

  const dnaData: StyleDNAData = {
    color_palette: {
      dominant: ['#F5F0E8'],
      secondary: ['#8B7355'],
      accent: ['#C5A55A'],
      warmth: 'warm',
    },
    material_vocabulary: [
      { material_id: 'engineered_hardwood', usage: 'floor', frequency: 0.8 },
      { material_id: 'matte_paint', usage: 'walls', frequency: 0.9 },
      { material_id: 'walnut_veneer', usage: 'furniture', frequency: 0.7 },
    ],
    furniture_language: {
      primary_style: 'modern',
      substyle: 'contemporary',
      era_range: '2020s',
      proportion_preference: 'standard',
      density: 'moderate',
    },
    photography_mood: {
      color_grading: 'warm_natural',
      lighting_style: 'natural',
      grain_level: 0.2,
      contrast_preference: 'medium',
    },
    cultural_elements: [],
    spatial_density: 0.5,
  }

  // Confidence scales with number of reference images
  const confidence = Math.min(0.95, 0.5 + (imagePaths.length * 0.05))

  return { dnaData, confidence }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Handle multi-variant generation.
 */
async function handleVariantGeneration(
  supabase: any,
  input: VariantGenerateInput
): Promise<NextResponse> {
  const { room_id, count, style_dna_id, run_ids, parent_run_id } = input

  // 1. Fetch scene context (shared across all variants — key optimization)
  const sceneContext = await fetchSceneContext(supabase, room_id)

  // 2. Fetch current brief as the base
  const baseBrief = await fetchCurrentBrief(supabase, room_id)
  if (!baseBrief) {
    return NextResponse.json(
      { error: 'No design brief found. Generate a brief first.' },
      { status: 400 }
    )
  }
  const baseVersion = (baseBrief.version as number) ?? 1

  // 3. Fetch Style DNA if specified
  let styleDna: StyleDNAData | undefined
  if (style_dna_id) {
    const { data: dnaRecord, error: dnaError } = await supabase
      .schema('knowledge')
      .from('style_dna')
      .select('*')
      .eq('id', style_dna_id)
      .single()

    if (dnaError || !dnaRecord) {
      return NextResponse.json({ error: 'Style DNA not found' }, { status: 404 })
    }

    styleDna = dnaRecord.dna_data as StyleDNAData

    // Increment used_count
    await supabase
      .schema('knowledge')
      .from('style_dna')
      .update({ used_count: (dnaRecord.used_count ?? 0) + 1 })
      .eq('id', style_dna_id)
  }

  // 4. Generate variation params if not provided
  const variationParams = input.variation_params?.length === count
    ? input.variation_params
    : generateVariationParams(count, baseBrief)

  // 5. Run each variant
  const variantResults: VariantResult[] = []

  for (let i = 0; i < count; i++) {
    const variation = variationParams[i]
    const runId = run_ids?.[i] ?? null

    try {
      // Generate variant brief
      const variantBriefData = applyVariationToBrief(
        baseBrief.brief_data as Record<string, unknown>,
        variation,
        styleDna
      )

      // Store the variant brief
      const storedBrief = await storeVariantBrief(
        supabase,
        room_id,
        variantBriefData,
        i,
        baseVersion
      )

      // Update pipeline run status to running (if pre-created by edge function)
      if (runId) {
        await supabase
          .schema('generation')
          .from('pipeline_runs')
          .update({
            status: 'running',
            started_at: new Date().toISOString(),
            design_brief_id: storedBrief.id,
          })
          .eq('id', runId)
      }

      const effectiveRunId = runId ?? (await createPipelineRun(supabase, room_id, 'variant' as any)).id

      // If this is not the first variant, link to parent
      if (i > 0 && parent_run_id && !runId) {
        await supabase
          .schema('generation')
          .from('pipeline_runs')
          .update({ parent_run_id })
          .eq('id', effectiveRunId)
      }

      // Run the full generation pipeline
      const results = await runVariantPipeline(supabase, room_id, effectiveRunId)

      // Store the final result with variant metadata
      if (results.final?.result) {
        await storeGenerationResult(
          supabase,
          effectiveRunId,
          room_id,
          'variant',
          results.final.result.storage_path,
          {
            width: results.final.result.width,
            height: results.final.result.height,
          },
          results.final.result.quality_scores ?? undefined,
          {
            variant_index: i,
            variation_description: variation.description,
            style_dna_id: style_dna_id ?? null,
            palette_shift: variation.palette_shift ?? null,
            density_override: variation.density_override ?? null,
          }
        )
      }

      // Complete the pipeline run
      await completePipelineRun(supabase, effectiveRunId)

      variantResults.push({
        variant_index: i,
        run_id: effectiveRunId,
        status: 'completed',
        brief_id: storedBrief.id as string,
        results,
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : `Variant ${i} failed`

      if (runId) {
        await failPipelineRun(supabase, runId, errMsg, 'variant_generation').catch(() => {})
      }

      variantResults.push({
        variant_index: i,
        run_id: runId ?? 'unknown',
        status: 'failed',
        results: {},
        error: errMsg,
      })
    }
  }

  const completedCount = variantResults.filter((r) => r.status === 'completed').length

  return NextResponse.json({
    status: completedCount === count ? 'completed' : completedCount > 0 ? 'partial' : 'failed',
    room_id,
    count,
    completed: completedCount,
    failed: count - completedCount,
    parent_run_id,
    style_dna_id: style_dna_id ?? null,
    variants: variantResults,
  })
}

/**
 * Handle Style DNA extraction (from completed room or reference images).
 */
async function handleStyleExtraction(
  supabase: any,
  input: StyleExtractInput
): Promise<NextResponse> {
  let dnaData: StyleDNAData
  let confidence: number
  let sourceType: string
  let referenceImages: string[] = []

  if (input.from_references && input.image_paths?.length) {
    // Extract from reference images
    const result = extractStyleDNAFromReferences(input.image_paths)
    dnaData = result.dnaData
    confidence = result.confidence
    sourceType = 'reference_images'
    referenceImages = input.image_paths
  } else if (input.room_id) {
    // Extract from completed room
    const result = await extractStyleDNAFromRoom(supabase, input.room_id, input.run_id)
    dnaData = result.dnaData
    confidence = result.confidence
    sourceType = 'extracted'
  } else {
    return NextResponse.json(
      { error: 'Either room_id or (from_references + image_paths) is required' },
      { status: 400 }
    )
  }

  // Store the Style DNA
  const { data: styleDna, error: insertError } = await supabase
    .schema('knowledge')
    .from('style_dna')
    .insert({
      org_id: input.org_id,
      project_id: input.project_id ?? null,
      name: input.name,
      dna_data: dnaData,
      source_type: sourceType,
      reference_images: referenceImages,
      confidence,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json(
      { error: `Failed to store Style DNA: ${insertError.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    status: 'completed',
    style_dna: styleDna,
    dna_data: dnaData,
    confidence,
    source_type: sourceType,
  })
}

// ---------------------------------------------------------------------------
// POST /api/variants
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    const body = await request.json()

    // Route based on action query param
    if (action === 'extract-style') {
      return handleStyleExtraction(supabase, body as StyleExtractInput)
    }

    // Default: variant generation
    const input = body as VariantGenerateInput

    // Validate UUIDs before processing
    validateUUID(input.room_id, 'room_id')
    if (input.style_dna_id) validateUUID(input.style_dna_id, 'style_dna_id')

    if (!input.count || input.count < 1 || input.count > 10) {
      return NextResponse.json(
        { error: 'count must be between 1 and 10' },
        { status: 400 }
      )
    }

    return handleVariantGeneration(supabase, input)
  } catch (err) {
    if (err instanceof SanitizeError) {
      return NextResponse.json(sanitizeErrorResponse(err), { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Variant generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// M08 Lighting & Shadow — Next.js API Route
// Generates shadow maps, light-guided illumination (LGI), and time-of-day variants.
// Uses IC-Light or SpotLight models for shadow-guided relighting.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createPipelineStage,
  updateStageStatus,
  failPipelineRun,
} from '@/lib/pipeline'
import {
  fetchSceneContext,
  storeGenerationResult,
  runWithFallback,
  getReplicateClient,
  getSignedUrl,
  type StageResult,
  type GenerationResult,
  type LightSource,
  type SceneContext,
} from '@/lib/generation'

export const maxDuration = 300 // 5 minutes

// ---------------------------------------------------------------------------
// Lighting Models
// ---------------------------------------------------------------------------

const IC_LIGHT = {
  model: 'zsxkib/ic-light-background',
  version: 'latest',
}

const IC_LIGHT_FALLBACK = {
  model: 'zsxkib/ic-light-background',
  version: 'latest',
}

// ---------------------------------------------------------------------------
// Time-of-day presets
// ---------------------------------------------------------------------------

interface TimeOfDayPreset {
  color_temp_k: number
  shadow_length: 'short' | 'medium' | 'long'
  tones: string
  ambient_multiplier: number
  description: string
}

const TIME_OF_DAY_PRESETS: Record<string, TimeOfDayPreset> = {
  golden_hour: {
    color_temp_k: 2500,
    shadow_length: 'long',
    tones: 'warm golden',
    ambient_multiplier: 0.7,
    description: 'Golden hour warm lighting with long dramatic shadows',
  },
  midday: {
    color_temp_k: 5500,
    shadow_length: 'short',
    tones: 'neutral',
    ambient_multiplier: 1.0,
    description: 'Bright midday lighting with short shadows',
  },
  twilight: {
    color_temp_k: 4500,
    shadow_length: 'medium',
    tones: 'purple and blue ambient',
    ambient_multiplier: 0.5,
    description: 'Twilight with cool purple-blue ambient light',
  },
  evening: {
    color_temp_k: 3200,
    shadow_length: 'medium',
    tones: 'warm artificial',
    ambient_multiplier: 0.4,
    description: 'Evening with warm artificial indoor lighting only',
  },
  overcast: {
    color_temp_k: 6500,
    shadow_length: 'short',
    tones: 'diffuse cool',
    ambient_multiplier: 0.9,
    description: 'Overcast diffuse lighting with minimal shadows',
  },
  night: {
    color_temp_k: 2700,
    shadow_length: 'long',
    tones: 'warm artificial with city glow',
    ambient_multiplier: 0.3,
    description: 'Night scene with artificial light and city ambient glow',
  },
}

// ---------------------------------------------------------------------------
// Shadow position computation
// ---------------------------------------------------------------------------

interface ShadowMapData {
  element_id: string
  element_label: string
  shadow_direction: string
  shadow_length: string
  opacity: number
  color_bleed: string | null
}

function computeShadowPositions(
  context: SceneContext,
  timePreset: TimeOfDayPreset | null
): ShadowMapData[] {
  const lightSources = context.lightingAnalysis?.light_sources ?? [
    { type: 'ambient', direction: 'above', intensity: 0.5 },
  ]

  const primaryLight =
    lightSources.find((s: LightSource) => s.intensity >= 0.6) ??
    lightSources[0]

  const shadowDirection = invertDirection(primaryLight.direction)
  const shadowLength = timePreset?.shadow_length ?? 'medium'

  // Build shadow data for scene graph elements (layers 1 + 2 = furniture + decor)
  const sceneGraph = context.sceneGraph
  if (!sceneGraph?.layers) {
    // No scene graph: generate generic shadows for detected masks
    return context.allMasks
      .filter((m) => !m.is_sacred)
      .map((mask) => ({
        element_id: mask.id,
        element_label: mask.label,
        shadow_direction: shadowDirection,
        shadow_length: shadowLength,
        opacity: primaryLight.intensity * 0.6,
        color_bleed: null,
      }))
  }

  const shadows: ShadowMapData[] = []
  for (const layer of sceneGraph.layers) {
    if (layer.layer_id > 2) continue // Only Layer 1 (furniture) and Layer 2 (decor)

    for (const element of layer.elements) {
      // Find material color for the surface this element sits on
      const surfaceMaterial = context.materialDetections.find(
        (m) => m.surface_type === 'floor'
      )

      shadows.push({
        element_id: element.id,
        element_label: element.label,
        shadow_direction: shadowDirection,
        shadow_length: shadowLength,
        opacity: primaryLight.intensity * (0.5 + element.depth * 0.1),
        color_bleed: surfaceMaterial?.detected_material ?? null,
      })
    }
  }

  return shadows
}

function invertDirection(direction: string): string {
  const inverseMap: Record<string, string> = {
    left: 'right',
    right: 'left',
    above: 'below',
    below: 'above',
    omnidirectional: 'below',
    'upper-left': 'lower-right',
    'upper-right': 'lower-left',
    'lower-left': 'upper-right',
    'lower-right': 'upper-left',
  }
  return inverseMap[direction] ?? 'below'
}

// ---------------------------------------------------------------------------
// LGI (Light-Guided Illumination) computation
// ---------------------------------------------------------------------------

interface LgiMapData {
  color_bleeding: { source_material: string; color_shift: string; intensity: number }[]
  ambient_occlusion_strength: number
  gi_bounce_count: number
}

function computeLgiMap(context: SceneContext): LgiMapData {
  // Simplified LGI: compute color bleeding based on material colors
  const colorBleeding = context.materialDetections.map((mat) => {
    const colorShift = materialToColorShift(mat.detected_material)
    return {
      source_material: mat.detected_material,
      color_shift: colorShift,
      intensity: 0.15 * mat.confidence_score,
    }
  })

  const ambientLevel = context.lightingAnalysis?.ambient_level ?? 0.5

  return {
    color_bleeding: colorBleeding,
    ambient_occlusion_strength: 1.0 - ambientLevel,
    gi_bounce_count: 2,
  }
}

function materialToColorShift(material: string): string {
  const shiftMap: Record<string, string> = {
    hardwood: '#D4A574',
    granite: '#808080',
    marble: '#F0EDE8',
    'painted drywall': '#FAFAFA',
    concrete: '#B0B0B0',
    carpet: '#C4B5A0',
    tile: '#E0D8D0',
    brick: '#C45A3A',
    stone: '#A0998E',
  }
  return shiftMap[material.toLowerCase()] ?? '#E0E0E0'
}

// ---------------------------------------------------------------------------
// Core execution function (importable by orchestrator)
// ---------------------------------------------------------------------------

export async function executeLightingShadow(
  roomId: string,
  runId: string,
  timeOfDay?: string
): Promise<StageResult> {
  const supabase = await createClient()
  const context = await fetchSceneContext(supabase, roomId)
  const projectId = context.project.id

  const stage = await createPipelineStage(supabase, runId, 'lighting_shadow')

  try {
    const replicate = getReplicateClient()
    const timePreset = timeOfDay ? TIME_OF_DAY_PRESETS[timeOfDay] ?? null : null
    const shadowMaps = computeShadowPositions(context, timePreset)
    const lgiMap = computeLgiMap(context)

    let shadowResult: GenerationResult | null = null
    const shadowStoragePath = `pipeline/${projectId}/${roomId}/shadow_maps.json`
    const lgiStoragePath = `pipeline/${projectId}/${roomId}/lgi_map.json`

    if (replicate) {
      // ----- Real model call for relighting -----

      // Get the render-to-photo result as the base image
      const { data: renderResult } = await supabase
        .schema('generation')
        .from('generation_results')
        .select('*')
        .eq('run_id', runId)
        .eq('result_type', 'render_to_photo')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const baseImagePath = renderResult?.storage_path ?? context.upload.storage_path
      const baseImageBucket = renderResult ? 'pipeline' : 'uploads'
      const baseImageUrl = await getSignedUrl(supabase, baseImageBucket, baseImagePath)

      // Build relighting prompt based on lighting analysis + time of day
      const lightingPrompt = timePreset
        ? `${timePreset.description}, color temperature ${timePreset.color_temp_k}K, ${timePreset.tones} tones`
        : `Natural indoor lighting, color temperature ${context.lightingAnalysis?.color_temperature_k ?? 5500}K, soft shadows`

      const primaryInput: Record<string, unknown> = {
        image: baseImageUrl,
        prompt: lightingPrompt,
        light_source: context.lightingAnalysis?.dominant_direction ?? 'left',
        light_source_strength: 1.0,
      }

      const output = await runWithFallback(
        replicate,
        { ...IC_LIGHT, input: primaryInput },
        { ...IC_LIGHT_FALLBACK, input: primaryInput },
        90_000
      )

      const relitUrl =
        typeof output === 'string'
          ? output
          : Array.isArray(output)
            ? (output as string[])[0] ?? ''
            : ''

      // Store relit image
      if (relitUrl) {
        const relitStoragePath = `pipeline/${projectId}/${roomId}/lighting_relit.png`
        const imageResp = await fetch(relitUrl)
        const imageBuffer = await imageResp.arrayBuffer()
        await supabase.storage
          .from('pipeline')
          .upload(relitStoragePath, imageBuffer, {
            contentType: 'image/png',
            upsert: true,
          })
      }

      // Store shadow maps as JSON
      const shadowJson = JSON.stringify({ shadows: shadowMaps, lgi: lgiMap }, null, 2)
      await supabase.storage
        .from('pipeline')
        .upload(shadowStoragePath, new TextEncoder().encode(shadowJson), {
          contentType: 'application/json',
          upsert: true,
        })

      // Store LGI map
      const lgiJson = JSON.stringify(lgiMap, null, 2)
      await supabase.storage
        .from('pipeline')
        .upload(lgiStoragePath, new TextEncoder().encode(lgiJson), {
          contentType: 'application/json',
          upsert: true,
        })

      shadowResult = await storeGenerationResult(
        supabase,
        runId,
        roomId,
        'lighting_shadow',
        shadowStoragePath,
        {
          width: context.upload.width ?? 1024,
          height: context.upload.height ?? 768,
        },
        {
          shadow_count: shadowMaps.length,
          lgi_bounces: lgiMap.gi_bounce_count,
          color_bleeding_sources: lgiMap.color_bleeding.length,
          model_confidence: 0.85,
        },
        {
          model_used: IC_LIGHT.model,
          time_of_day: timeOfDay ?? null,
          time_preset: timePreset,
          shadow_maps: shadowMaps,
          lgi_map: lgiMap,
        }
      )
    } else {
      // ----- Mock mode -----
      console.log(
        '[M08 lighting] Mock mode — generating placeholder shadow/LGI data'
      )

      // Store shadow maps as JSON
      const shadowJson = JSON.stringify({ shadows: shadowMaps, lgi: lgiMap }, null, 2)
      try {
        await supabase.storage
          .from('pipeline')
          .upload(shadowStoragePath, new TextEncoder().encode(shadowJson), {
            contentType: 'application/json',
            upsert: true,
          })
      } catch {
        // Storage may not be available in mock mode
      }

      // Store LGI map
      const lgiJson = JSON.stringify(lgiMap, null, 2)
      try {
        await supabase.storage
          .from('pipeline')
          .upload(lgiStoragePath, new TextEncoder().encode(lgiJson), {
            contentType: 'application/json',
            upsert: true,
          })
      } catch {
        // Storage may not be available in mock mode
      }

      shadowResult = await storeGenerationResult(
        supabase,
        runId,
        roomId,
        'lighting_shadow',
        shadowStoragePath,
        {
          width: context.upload.width ?? 1024,
          height: context.upload.height ?? 768,
        },
        {
          shadow_count: shadowMaps.length,
          lgi_bounces: lgiMap.gi_bounce_count,
          color_bleeding_sources: lgiMap.color_bleeding.length,
          model_confidence: 0.0,
        },
        {
          model_used: 'mock-computed',
          mock_mode: true,
          time_of_day: timeOfDay ?? null,
          time_preset: timePreset,
          shadow_maps: shadowMaps,
          lgi_map: lgiMap,
        }
      )
    }

    await updateStageStatus(supabase, stage.id, 'completed', {
      model: replicate ? IC_LIGHT.model : 'mock-computed',
      shadow_count: shadowMaps.length,
      time_of_day: timeOfDay ?? 'default',
      lgi_bounce_count: lgiMap.gi_bounce_count,
    })

    return {
      run_id: runId,
      stage_id: stage.id,
      result: shadowResult,
      metadata: {
        shadow_maps: shadowMaps,
        lgi_map: lgiMap,
        time_of_day: timeOfDay ?? null,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lighting & shadow failed'
    await updateStageStatus(supabase, stage.id, 'failed')
    await failPipelineRun(supabase, runId, msg, 'lighting_shadow')
    throw err
  }
}

// ---------------------------------------------------------------------------
// POST /api/generate/lighting
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { room_id, run_id, time_of_day } = body as {
      room_id?: string
      run_id?: string
      time_of_day?: string
    }

    if (!room_id) {
      return NextResponse.json(
        { error: 'room_id is required' },
        { status: 400 }
      )
    }

    if (!run_id) {
      return NextResponse.json(
        { error: 'run_id is required' },
        { status: 400 }
      )
    }

    if (time_of_day && !TIME_OF_DAY_PRESETS[time_of_day]) {
      return NextResponse.json(
        {
          error: `Invalid time_of_day. Valid values: ${Object.keys(TIME_OF_DAY_PRESETS).join(', ')}`,
        },
        { status: 400 }
      )
    }

    const stageResult = await executeLightingShadow(room_id, run_id, time_of_day)

    return NextResponse.json({
      status: 'completed',
      ...stageResult,
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Lighting & shadow failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

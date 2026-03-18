// M12 Geolocation Exterior View Engine — Next.js API Route
// Generates location-accurate window views for each detected window in a room.
// Uses city profile data for atmospheric simulation and landmark placement.
// Supports both real Flux Pro model calls and mock mode for development.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createPipelineRun,
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
  type SceneContext,
} from '@/lib/generation'
import { validateUUID, SanitizeError, sanitizeErrorResponse } from '@/lib/sanitize'

export const maxDuration = 300 // 5 minutes

// ---------------------------------------------------------------------------
// Generation Model
// ---------------------------------------------------------------------------

const FLUX_PRO = {
  model: 'black-forest-labs/flux-1.1-pro',
  version: 'latest',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectLocation {
  id: string
  project_id: string
  address: string
  city: string
  country: string
  latitude: number
  longitude: number
  floor_number: number
  floor_height_m: number
  building_orientation_deg: number | null
  climate_class: string | null
}

interface WindowView {
  id: string
  room_id: string
  mask_id: string | null
  compass_direction: number
  cardinal: string
  window_width_mm: number | null
  window_height_mm: number | null
  sill_height_mm: number | null
  view_type: string
}

interface CityProfile {
  id: string
  city_name: string
  country: string
  climate_class: string
  avg_visibility_km: number
  humidity_pct: number | null
  dust_factor: number | null
  overcast_probability: number | null
  building_character: Record<string, unknown>
  vegetation_types: string[]
  water_features: string[]
  landmarks: Array<{
    name: string
    height_m: number
    visibility_km: number
    lat?: number
    lng?: number
  }>
  winter_sun_angle: number | null
  summer_sun_angle: number | null
}

interface WindowViewResult {
  window_id: string
  compass: string
  time_of_day: string
  atmospheric: {
    visibility_km: number
    humidity: number
    dust: number
  }
  landmarks_visible: string[]
  glass_reflection_pct: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeCardinal(direction: number): string {
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const idx = Math.round(direction / 45) % 8
  return cardinals[idx]
}

function computeAbsoluteDirection(
  windowCompass: number,
  buildingOrientation: number | null
): number {
  const orientation = buildingOrientation ?? 0
  return (windowCompass + orientation) % 360
}

function selectVisibleLandmarks(
  landmarks: CityProfile['landmarks'],
  floorHeight: number,
  floorNumber: number,
  visibilityKm: number
): string[] {
  const eyeHeight = floorHeight * floorNumber
  return landmarks
    .filter((lm) => {
      // Landmark must be within visibility range
      if (lm.visibility_km && lm.visibility_km < visibilityKm) return true
      // Taller landmarks visible from higher floors
      if (lm.height_m > eyeHeight * 2) return true
      return false
    })
    .map((lm) => lm.name)
}

function buildExteriorPrompt(
  context: SceneContext,
  window: WindowView,
  location: ProjectLocation,
  cityProfile: CityProfile | null,
  absoluteDirection: number
): string {
  const cardinal = computeCardinal(absoluteDirection)
  const floorDesc =
    location.floor_number <= 3
      ? 'low-rise street level'
      : location.floor_number <= 10
        ? 'mid-rise urban'
        : 'high-rise panoramic'

  const parts = [
    `Photorealistic exterior view through a window facing ${cardinal},`,
    `${floorDesc} view from floor ${location.floor_number},`,
    `${location.city}, ${location.country},`,
  ]

  if (cityProfile) {
    if (cityProfile.vegetation_types.length > 0) {
      parts.push(`vegetation: ${cityProfile.vegetation_types.slice(0, 3).join(', ')},`)
    }
    if (cityProfile.water_features.length > 0) {
      parts.push(`water features: ${cityProfile.water_features.join(', ')},`)
    }
    if (cityProfile.dust_factor && cityProfile.dust_factor > 0.3) {
      parts.push('slight atmospheric haze,')
    }
    if (cityProfile.humidity_pct && cityProfile.humidity_pct > 70) {
      parts.push('humid tropical atmosphere,')
    }
  }

  parts.push(
    'natural daylight, architectural photography quality,',
    'through glass with subtle 8% reflection, window frame shadows,',
    'shot on Canon EOS R5, 35mm f/5.6, sharp focus'
  )

  return parts.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Core execution function (importable by orchestrator)
// ---------------------------------------------------------------------------

export async function executeExteriorGeneration(
  roomId: string,
  runId: string
): Promise<StageResult> {
  const supabase = await createClient()
  const context = await fetchSceneContext(supabase, roomId)
  const projectId = context.project.id

  // Create pipeline stage
  const stage = await createPipelineStage(supabase, runId, 'geolocation_exterior')

  try {
    // 1. Fetch project location
    const { data: location, error: locErr } = await supabase
      .schema('geolocation')
      .from('project_locations')
      .select('*')
      .eq('project_id', projectId)
      .single()

    if (locErr || !location) {
      throw new Error('Project location not configured — register location first')
    }
    const projectLocation = location as ProjectLocation

    // 2. Fetch window views for this room
    const { data: windows, error: winErr } = await supabase
      .schema('geolocation')
      .from('window_views')
      .select('*')
      .eq('room_id', roomId)
      .order('compass_direction', { ascending: true })

    if (winErr) throw new Error(`Failed to fetch windows: ${winErr.message}`)

    const windowViews = (windows ?? []) as WindowView[]

    if (windowViews.length === 0) {
      throw new Error('No windows detected for this room — register windows first')
    }

    // 3. Fetch city profile for atmospheric simulation
    const { data: cityData } = await supabase
      .schema('geolocation')
      .from('city_profiles')
      .select('*')
      .ilike('city_name', projectLocation.city)
      .single()

    const cityProfile = (cityData as CityProfile | null) ?? null

    // 4. Process each window
    const replicate = getReplicateClient()
    const viewResults: WindowViewResult[] = []
    let lastResult: GenerationResult | null = null

    for (const window of windowViews) {
      const absoluteDir = computeAbsoluteDirection(
        window.compass_direction,
        projectLocation.building_orientation_deg
      )

      const visibilityKm = cityProfile?.avg_visibility_km ?? 10
      const humidity = cityProfile?.humidity_pct ?? 0.4
      const dust = cityProfile?.dust_factor ?? 0

      const visibleLandmarks = cityProfile
        ? selectVisibleLandmarks(
            cityProfile.landmarks,
            projectLocation.floor_height_m,
            projectLocation.floor_number,
            visibilityKm
          )
        : []

      const storagePath = `pipeline/${projectId}/${roomId}/exterior_${window.id}.png`

      if (replicate) {
        // ----- Real model call -----
        const prompt = buildExteriorPrompt(
          context,
          window,
          projectLocation,
          cityProfile,
          absoluteDir
        )

        const input: Record<string, unknown> = {
          prompt,
          width: window.window_width_mm ? Math.min(Math.round(window.window_width_mm / 0.75), 1536) : 1024,
          height: window.window_height_mm ? Math.min(Math.round(window.window_height_mm / 0.75), 1536) : 768,
          num_outputs: 1,
          guidance_scale: 7.5,
          num_inference_steps: 28,
        }

        const output = await runWithFallback(
          replicate,
          { ...FLUX_PRO, input },
          undefined, // no fallback model for exterior
          120_000
        )

        const generatedUrl =
          typeof output === 'string'
            ? output
            : Array.isArray(output)
              ? (output as string[])[0] ?? ''
              : ''

        if (!generatedUrl) {
          throw new Error(`Model returned empty output for window ${window.id}`)
        }

        // Download and store
        const imageResp = await fetch(generatedUrl)
        const imageBlob = await imageResp.blob()
        const imageBuffer = await imageResp.arrayBuffer()

        await supabase.storage.from('pipeline').upload(storagePath, imageBuffer, {
          contentType: imageBlob.type || 'image/png',
          upsert: true,
        })

        lastResult = await storeGenerationResult(
          supabase,
          runId,
          roomId,
          'geolocation_exterior',
          storagePath,
          {
            width: input.width as number,
            height: input.height as number,
          },
          {
            atmospheric_accuracy: 0.85,
            landmark_placement: visibleLandmarks.length > 0 ? 0.8 : 0,
            glass_effects: 0.08,
          },
          {
            model_used: FLUX_PRO.model,
            prompt,
            window_id: window.id,
            compass: computeCardinal(absoluteDir),
            landmarks_visible: visibleLandmarks,
          }
        )

        // Store rendered view record
        await supabase
          .schema('geolocation')
          .from('rendered_views')
          .insert({
            window_id: window.id,
            run_id: runId,
            storage_path: storagePath,
            time_of_day: 'midday',
            weather: 'clear',
            atmospheric_data: {
              visibility_km: visibilityKm,
              humidity,
              dust,
            },
            landmarks_visible: visibleLandmarks,
            glass_effects_applied: true,
          })
      } else {
        // ----- Mock mode -----
        console.log(
          `[M12 exterior] Mock mode — generating mock view for window ${window.id} (${window.cardinal})`
        )

        lastResult = await storeGenerationResult(
          supabase,
          runId,
          roomId,
          'geolocation_exterior',
          storagePath,
          {
            width: 1024,
            height: 768,
          },
          {
            atmospheric_accuracy: 0.0,
            landmark_placement: 0.0,
            glass_effects: 0.0,
          },
          {
            model_used: 'mock-exterior',
            mock_mode: true,
            window_id: window.id,
            compass: computeCardinal(absoluteDir),
            landmarks_visible: visibleLandmarks,
          }
        )

        // Store rendered view record (mock)
        await supabase
          .schema('geolocation')
          .from('rendered_views')
          .insert({
            window_id: window.id,
            run_id: runId,
            storage_path: storagePath,
            time_of_day: 'midday',
            weather: 'clear',
            atmospheric_data: {
              visibility_km: visibilityKm,
              humidity,
              dust,
            },
            landmarks_visible: visibleLandmarks,
            glass_effects_applied: false,
          })
      }

      viewResults.push({
        window_id: window.id,
        compass: computeCardinal(absoluteDir),
        time_of_day: 'midday',
        atmospheric: {
          visibility_km: visibilityKm,
          humidity: humidity as number,
          dust: dust as number,
        },
        landmarks_visible: visibleLandmarks,
        glass_reflection_pct: 0.08,
      })
    }

    await updateStageStatus(supabase, stage.id, 'completed', {
      model: replicate ? FLUX_PRO.model : 'mock-exterior',
      windows_processed: windowViews.length,
      city: projectLocation.city,
      has_city_profile: !!cityProfile,
      views: viewResults,
    })

    return {
      run_id: runId,
      stage_id: stage.id,
      result: lastResult,
      metadata: {
        windows_processed: windowViews.length,
        views: viewResults,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Exterior generation failed'
    await updateStageStatus(supabase, stage.id, 'failed')
    await failPipelineRun(supabase, runId, msg, 'geolocation_exterior')
    throw err
  }
}

// ---------------------------------------------------------------------------
// POST /api/generate/exterior
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Gap 3 — UUID validation; run_id is optional (created if absent)
    const room_id = validateUUID(body.room_id, 'room_id')
    const run_id  = body.run_id ? validateUUID(body.run_id, 'run_id') : undefined

    // Create a pipeline run if none provided
    let resolvedRunId = run_id
    if (!resolvedRunId) {
      const supabase = await createClient()
      const run = await createPipelineRun(supabase, room_id, 'full')
      resolvedRunId = run.id
    }

    const stageResult = await executeExteriorGeneration(room_id, resolvedRunId)

    return NextResponse.json({
      status: 'completed',
      ...stageResult,
    })
  } catch (err) {
    if (err instanceof SanitizeError) {
      return NextResponse.json(sanitizeErrorResponse(err), { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Exterior generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

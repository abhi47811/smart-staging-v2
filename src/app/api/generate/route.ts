// Full Generation Pipeline Orchestrator — Next.js API Route
// Executes the complete staging pipeline sequentially:
//   M07 (Render-to-Photo) → M10 (Fitout) → M11 (Furniture) →
//   M12 (Exterior Views) → M08 (Lighting & Shadow) → M09 (Harmonization)
// Calls stage functions directly (no HTTP roundtrips).
// M13 (Hallucination Defense) wraps each generation stage automatically.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createPipelineRun,
  completePipelineRun,
  failPipelineRun,
} from '@/lib/pipeline'
import { logTelemetry, releaseRoomLock } from '@/lib/cache'
import {
  validateUUID,
  sanitizeText,
  assertValidEnum,
  sanitizeStringArray,
  SanitizeError,
  sanitizeErrorResponse,
} from '@/lib/sanitize'
import { executeRenderToPhoto } from './render-to-photo/route'
import { executeFitoutGeneration } from './fitout/route'
import { executeFurnitureGeneration } from './furniture/route'
import { executeExteriorGeneration } from './exterior/route'
import { executeLightingShadow } from './lighting/route'
import { executeHarmonization } from './harmonize/route'
import type { StageResult } from '@/lib/generation'

export const maxDuration = 300 // 5 minutes

// ---------------------------------------------------------------------------
// Pipeline stage definitions (execution order)
// ---------------------------------------------------------------------------

interface PipelineStageConfig {
  key: string
  skipKey: string
  execute: (roomId: string, runId: string, opts?: unknown) => Promise<StageResult>
}

// ---------------------------------------------------------------------------
// POST /api/generate
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  let runId: string | null = null

  try {
    // -----------------------------------------------------------------------
    // 1. Validate input
    // -----------------------------------------------------------------------
    const body = await request.json()

    // Gap 3 — structural validation
    const room_id      = validateUUID(body.room_id, 'room_id')
    const skip_stages  = body.skip_stages
      ? sanitizeStringArray(body.skip_stages, 'skip_stages', { maxItems: 20, maxItemLength: 60 })
      : undefined
    const time_of_day  = body.time_of_day
      ? sanitizeText(body.time_of_day, 'time_of_day', { maxLength: 50, allowNewlines: false })
      : undefined
    const run_type_raw = body.run_type
      ? assertValidEnum(body.run_type, ['full', 'scene_only', 'generation_only', 'refinement'] as const, 'run_type')
      : 'full'

    // Verify room exists
    const { data: room, error: roomError } = await supabase
      .schema('core')
      .from('rooms')
      .select('id, status')
      .eq('id', room_id)
      .is('deleted_at', null)
      .single()

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    const skippedSet = new Set(skip_stages ?? [])

    // -----------------------------------------------------------------------
    // 2. Create pipeline run
    // -----------------------------------------------------------------------
    const resolvedRunType = run_type_raw as 'full' | 'scene_only' | 'generation_only' | 'refinement'
    const pipelineRun = await createPipelineRun(supabase, room_id, resolvedRunType)
    runId = pipelineRun.id

    // Log pipeline start telemetry
    logTelemetry(supabase, {
      run_id: runId,
      stage_name: 'pipeline',
      event_type: 'start',
      metadata: { room_id, run_type: resolvedRunType, skip_stages: skip_stages ?? [] },
    })

    const results: Record<string, StageResult | null> = {
      render_to_photo: null,
      fitout: null,
      furniture: null,
      exterior: null,
      lighting: null,
      harmonized: null,
      final: null,
    }

    // -----------------------------------------------------------------------
    // Define pipeline stages in execution order
    // -----------------------------------------------------------------------
    const stages: PipelineStageConfig[] = [
      {
        key: 'render_to_photo',
        skipKey: 'render_to_photo',
        execute: (rid, runid) => executeRenderToPhoto(rid, runid),
      },
      {
        key: 'fitout',
        skipKey: 'fitout_generation',
        execute: (rid, runid) => executeFitoutGeneration(rid, runid),
      },
      {
        key: 'furniture',
        skipKey: 'furniture_generation',
        execute: (rid, runid) => executeFurnitureGeneration(rid, runid),
      },
      {
        key: 'exterior',
        skipKey: 'geolocation_exterior',
        execute: (rid, runid) => executeExteriorGeneration(rid, runid),
      },
      {
        key: 'lighting',
        skipKey: 'lighting_shadow',
        execute: (rid, runid) => executeLightingShadow(rid, runid, time_of_day),
      },
      {
        key: 'harmonized',
        skipKey: 'harmonization',
        execute: (rid, runid) => executeHarmonization(rid, runid),
      },
    ]

    // -----------------------------------------------------------------------
    // 3. Execute stages sequentially
    // -----------------------------------------------------------------------
    for (const stage of stages) {
      if (skippedSet.has(stage.skipKey)) continue

      const stageStart = Date.now()
      logTelemetry(supabase, { run_id: runId, stage_name: stage.key, event_type: 'start' })

      try {
        const stageResult = await stage.execute(room_id, runId)
        results[stage.key] = stageResult

        logTelemetry(supabase, {
          run_id: runId,
          stage_name: stage.key,
          event_type: 'complete',
          duration_ms: Date.now() - stageStart,
        })

        // Final output comes from the last completed stage (harmonization)
        if (stage.key === 'harmonized') {
          results.final = stageResult
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : `${stage.key} failed`
        logTelemetry(supabase, {
          run_id: runId,
          stage_name: stage.key,
          event_type: 'error',
          duration_ms: Date.now() - stageStart,
          metadata: { error: msg },
        })
        await failPipelineRun(supabase, runId, msg, stage.skipKey)
        return NextResponse.json(
          {
            error: msg,
            stage: stage.key,
            run_id: runId,
            partial_results: results,
          },
          { status: 500 }
        )
      }
    }

    // -----------------------------------------------------------------------
    // 4. Complete pipeline
    // -----------------------------------------------------------------------
    await completePipelineRun(supabase, runId)

    logTelemetry(supabase, {
      run_id: runId,
      stage_name: 'pipeline',
      event_type: 'complete',
      metadata: { room_id, stages_completed: Object.keys(results).filter(k => results[k] !== null) },
    })

    // Release room lock (best effort)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) releaseRoomLock(supabase, room_id, user.id).catch(() => {})

    // Update room status to 'staged'
    await supabase
      .schema('core')
      .from('rooms')
      .update({ status: 'staged' })
      .eq('id', room_id)

    // -----------------------------------------------------------------------
    // 5. Post-pipeline: quality scoring + suggestions (fire-and-forget)
    //    These run asynchronously so they never delay the response.
    // -----------------------------------------------------------------------
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    // M18: Quality scoring
    fetch(`${appUrl}/api/quality`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: runId, room_id }),
    })
      .then(async (qualityRes) => {
        if (!qualityRes.ok) return
        const qualityData = await qualityRes.json() as { report?: { passed: boolean } }
        // M18 AI Suggestions — only trigger if quality passed
        if (qualityData?.report?.passed) {
          fetch(`${appUrl}/api/suggestions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ run_id: runId, room_id }),
          }).catch(() => {})
        }
      })
      .catch(() => {})

    return NextResponse.json({
      status: 'completed',
      run_id: runId,
      room_id,
      results,
    })
  } catch (err) {
    if (err instanceof SanitizeError) {
      return NextResponse.json(sanitizeErrorResponse(err), { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Generation pipeline failed'

    if (runId) {
      await failPipelineRun(supabase, runId, message, 'unknown').catch(
        () => {}
      )
    }

    return NextResponse.json(
      { error: message, run_id: runId },
      { status: 500 }
    )
  }
}

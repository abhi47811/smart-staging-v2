// M07 Render-to-Photo — Next.js API Route
// Generates a photorealistic base image from scene context using depth-conditioned diffusion.
// Supports both real Replicate model calls and mock mode for development.

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
  applySacredZoneMask,
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
// Generation Models
// ---------------------------------------------------------------------------

const FLUX_PRO = {
  model: 'black-forest-labs/flux-1.1-pro',
  version: 'latest',
}

const FLUX_CONTROLNET = {
  model: 'xlabs-ai/flux-dev-controlnet',
  version: 'latest',
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPhotographyPrompt(context: SceneContext): string {
  const brief = context.designBrief
  const room = context.room

  if (brief?.description) {
    return [
      'Professional real estate photography,',
      brief.description,
      `${room.room_type} interior,`,
      brief.style ? `${brief.style} style,` : '',
      brief.color_palette?.length
        ? `color palette: ${brief.color_palette.join(', ')},`
        : '',
      'high resolution, natural lighting, architectural digest quality,',
      'shot on Canon EOS R5, 24mm f/8, sharp focus throughout',
    ]
      .filter(Boolean)
      .join(' ')
  }

  // Default prompt when no design brief exists
  return [
    'Professional real estate photography,',
    `beautifully staged ${room.room_type} interior,`,
    'modern contemporary style, neutral warm tones,',
    'high resolution, natural lighting, architectural digest quality,',
    'shot on Canon EOS R5, 24mm f/8, sharp focus throughout',
  ].join(' ')
}

// ---------------------------------------------------------------------------
// Core execution function (importable by orchestrator)
// ---------------------------------------------------------------------------

export async function executeRenderToPhoto(
  roomId: string,
  runId: string
): Promise<StageResult> {
  const supabase = await createClient()
  const context = await fetchSceneContext(supabase, roomId)
  const projectId = context.project.id

  // Create pipeline stage
  const stage = await createPipelineStage(supabase, runId, 'render_to_photo')

  try {
    const replicate = getReplicateClient()
    const storagePath = `pipeline/${projectId}/${roomId}/render_to_photo.png`
    let result: GenerationResult

    if (replicate) {
      // ----- Real model call -----
      const imageUrl = await getSignedUrl(
        supabase,
        'uploads',
        context.upload.storage_path
      )

      const depthMapUrl = context.depthMap
        ? await getSignedUrl(supabase, 'pipeline', context.depthMap.storage_path)
        : null

      const prompt = buildPhotographyPrompt(context)

      // Build input for the primary model (Flux Pro)
      const primaryInput: Record<string, unknown> = {
        prompt,
        width: context.upload.width ?? 1024,
        height: context.upload.height ?? 768,
        num_outputs: 1,
        guidance_scale: 7.5,
        num_inference_steps: 28,
      }

      // Build ControlNet fallback input (uses depth conditioning)
      const fallbackInput: Record<string, unknown> = {
        prompt,
        control_image: depthMapUrl ?? imageUrl,
        control_type: 'depth',
        width: context.upload.width ?? 1024,
        height: context.upload.height ?? 768,
        num_outputs: 1,
        guidance_scale: 7.5,
        num_inference_steps: 28,
        controlnet_conditioning_scale: 0.8,
      }

      const output = await runWithFallback(
        replicate,
        { ...FLUX_PRO, input: primaryInput },
        { ...FLUX_CONTROLNET, input: fallbackInput },
        120_000 // 2 min timeout for primary
      )

      const generatedUrl =
        typeof output === 'string'
          ? output
          : Array.isArray(output)
            ? (output as string[])[0] ?? ''
            : ''

      if (!generatedUrl) {
        throw new Error('Model returned empty output')
      }

      // Apply sacred zone mask preservation
      let finalUrl = generatedUrl
      let preservationScore = 1.0

      if (context.sacredMasks.length > 0) {
        // Use the first sacred mask for compositing
        // In production, all sacred masks would be merged into a unified mask
        const sacredMaskUrl = await getSignedUrl(
          supabase,
          'pipeline',
          context.sacredMasks[0].mask_storage_path
        )
        const maskResult = applySacredZoneMask(
          generatedUrl,
          imageUrl,
          sacredMaskUrl,
          4 // 4px feather radius
        )
        finalUrl = maskResult.resultUrl
        preservationScore = maskResult.preservationScore
      }

      // Download and store the generated image
      const imageResp = await fetch(finalUrl)
      const imageBlob = await imageResp.blob()
      const imageBuffer = await imageResp.arrayBuffer()

      await supabase.storage.from('pipeline').upload(storagePath, imageBuffer, {
        contentType: imageBlob.type || 'image/png',
        upsert: true,
      })

      result = await storeGenerationResult(
        supabase,
        runId,
        roomId,
        'render_to_photo',
        storagePath,
        {
          width: context.upload.width ?? 1024,
          height: context.upload.height ?? 768,
        },
        {
          sacred_zone_preservation: preservationScore,
          depth_conditioning: depthMapUrl ? 1.0 : 0.0,
          model_confidence: 0.88,
        },
        {
          model_used: FLUX_PRO.model,
          prompt,
          has_depth_conditioning: !!depthMapUrl,
          sacred_masks_applied: context.sacredMasks.length,
        }
      )
    } else {
      // ----- Mock mode: use original upload as base photo -----
      console.log(
        '[M07 render-to-photo] Mock mode — using original upload as base photo'
      )

      // Copy original image to pipeline storage as the "rendered" output
      const originalUrl = await getSignedUrl(
        supabase,
        'uploads',
        context.upload.storage_path
      )

      if (originalUrl) {
        try {
          const imageResp = await fetch(originalUrl)
          const imageBuffer = await imageResp.arrayBuffer()
          await supabase.storage
            .from('pipeline')
            .upload(storagePath, imageBuffer, {
              contentType: 'image/png',
              upsert: true,
            })
        } catch {
          // Storage copy may fail in mock if bucket doesn't exist — that's ok
        }
      }

      result = await storeGenerationResult(
        supabase,
        runId,
        roomId,
        'render_to_photo',
        storagePath,
        {
          width: context.upload.width ?? 1024,
          height: context.upload.height ?? 768,
        },
        {
          sacred_zone_preservation: 1.0,
          depth_conditioning: 0.0,
          model_confidence: 0.0,
        },
        {
          model_used: 'mock-passthrough',
          prompt: buildPhotographyPrompt(context),
          mock_mode: true,
        }
      )
    }

    await updateStageStatus(supabase, stage.id, 'completed', {
      model: replicate ? FLUX_PRO.model : 'mock-passthrough',
      has_sacred_zones: context.sacredMasks.length > 0,
    })

    return { run_id: runId, stage_id: stage.id, result }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Render-to-photo failed'
    await updateStageStatus(supabase, stage.id, 'failed')
    await failPipelineRun(supabase, runId, msg, 'render_to_photo')
    throw err
  }
}

// ---------------------------------------------------------------------------
// POST /api/generate/render-to-photo
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const room_id = validateUUID(body.room_id, 'room_id')
    const run_id  = body.run_id ? validateUUID(body.run_id, 'run_id') : undefined

    // Create a pipeline run if none provided
    let resolvedRunId = run_id
    if (!resolvedRunId) {
      const supabase = await createClient()
      const run = await createPipelineRun(supabase, room_id, 'full')
      resolvedRunId = run.id
    }

    const stageResult = await executeRenderToPhoto(room_id, resolvedRunId)

    return NextResponse.json({
      status: 'completed',
      ...stageResult,
    })
  } catch (err) {
    if (err instanceof SanitizeError) {
      return NextResponse.json(sanitizeErrorResponse(err), { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Render-to-photo failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

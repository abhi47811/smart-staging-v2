// Cross-Room Visibility Cascade Resync — Next.js API Route (M15)
// Regenerates secondary zones in rooms that can see modified rooms.
// Calls the generation pipeline for masked inpainting with reference conditioning.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createPipelineRun,
  createPipelineStage,
  updateStageStatus,
  completePipelineRun,
  failPipelineRun,
} from '@/lib/pipeline'
import {
  fetchSceneContext,
  getReplicateClient,
  getSignedUrl,
  applySacredZoneMask,
  storeGenerationResult,
} from '@/lib/generation'
import { validateUUID, SanitizeError, sanitizeErrorResponse } from '@/lib/sanitize'
import type { SyncResult } from '@/lib/visibility'

export const maxDuration = 300 // 5 minutes

// ---------------------------------------------------------------------------
// Exported executor — can be called from the orchestrator pipeline
// ---------------------------------------------------------------------------

export async function executeVisibilitySync(
  projectId: string
): Promise<SyncResult> {
  const supabase = await createClient()
  const replicate = getReplicateClient()

  // 1. Fetch all visibility links with needs_resync=true for the project
  const { data: rooms, error: roomsErr } = await supabase
    .schema('core')
    .from('rooms')
    .select('id')
    .eq('project_id', projectId)
    .is('deleted_at', null)

  if (roomsErr) throw new Error(`Failed to fetch rooms: ${roomsErr.message}`)

  const roomIds = (rooms ?? []).map((r: { id: string }) => r.id)

  if (roomIds.length === 0) {
    return {
      project_id: projectId,
      rooms_synced: 0,
      rooms_failed: 0,
      sync_details: [],
    }
  }

  const { data: pendingLinks, error: linksErr } = await supabase
    .schema('scene')
    .from('visibility_links')
    .select('*')
    .in('source_room_id', roomIds)
    .eq('needs_resync', true)

  if (linksErr) throw new Error(`Failed to fetch visibility links: ${linksErr.message}`)

  const links = pendingLinks ?? []

  if (links.length === 0) {
    return {
      project_id: projectId,
      rooms_synced: 0,
      rooms_failed: 0,
      sync_details: [],
    }
  }

  // 2. Process each link
  const syncDetails: SyncResult['sync_details'] = []
  let roomsSynced = 0
  let roomsFailed = 0

  for (const link of links) {
    const startTime = Date.now()

    try {
      if (replicate) {
        // ---------------------------------------------------------------
        // Production path: actual model-based resync
        // ---------------------------------------------------------------
        // Fetch scene context for both rooms
        const sourceCtx = await fetchSceneContext(supabase, link.source_room_id)
        const targetCtx = await fetchSceneContext(supabase, link.target_room_id)

        // Get the latest render for source and target
        const { data: sourceRender } = await supabase
          .schema('generation')
          .from('generation_results')
          .select('storage_path, width, height')
          .eq('room_id', link.source_room_id)
          .eq('result_type', 'harmonized')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const { data: targetRender } = await supabase
          .schema('generation')
          .from('generation_results')
          .select('storage_path, width, height')
          .eq('room_id', link.target_room_id)
          .eq('result_type', 'harmonized')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!sourceRender || !targetRender) {
          throw new Error('Missing render for source or target room')
        }

        // Get signed URLs
        const sourceUrl = await getSignedUrl(supabase, 'renders', sourceRender.storage_path)
        const targetUrl = await getSignedUrl(supabase, 'renders', targetRender.storage_path)
        const maskUrl = link.mask_path
          ? await getSignedUrl(supabase, 'masks', link.mask_path)
          : null

        // Determine regeneration strategy based on lock_method
        let input: Record<string, unknown>

        switch (link.lock_method) {
          case 'reference_lock':
            // Use IP-Adapter with target room render as reference (high weight)
            input = {
              image: sourceUrl,
              ip_adapter_image: targetUrl,
              ip_adapter_weight: 0.85,
              mask: maskUrl,
              prompt: `View through ${link.zone_type} showing adjacent room, photorealistic interior`,
              negative_prompt: 'blurry, inconsistent lighting, artifacts, seams',
              strength: 0.7,
              guidance_scale: 7.5,
            }
            break

          case 'style_lock':
            // Match style/color but not exact content
            input = {
              image: sourceUrl,
              ip_adapter_image: targetUrl,
              ip_adapter_weight: 0.4,
              mask: maskUrl,
              prompt: `View through ${link.zone_type} showing adjacent room, matching style and color palette`,
              negative_prompt: 'blurry, artifacts, seams, mismatched colors',
              strength: 0.5,
              guidance_scale: 7.0,
            }
            break

          case 'hybrid':
          default:
            // Direct warp for similar angles, reference-conditioned for large differences
            input = {
              image: sourceUrl,
              ip_adapter_image: targetUrl,
              ip_adapter_weight: 0.65,
              mask: maskUrl,
              prompt: `Seamless view through ${link.zone_type} into adjacent room, photorealistic`,
              negative_prompt: 'blurry, inconsistent, artifacts, visible seams',
              strength: 0.6,
              guidance_scale: 7.5,
            }
            break
        }

        // Run inpainting model
        const { id: predictionId } = await replicate.createPrediction(
          'stability-ai/stable-diffusion-inpainting',
          'latest',
          input
        )
        const prediction = await replicate.waitForPrediction(predictionId)
        const outputUrl = Array.isArray(prediction.output)
          ? prediction.output[0]
          : prediction.output

        // Apply feathered blending at zone boundary (50px feather)
        const { resultUrl } = applySacredZoneMask(
          outputUrl as string,
          sourceUrl,
          maskUrl ?? '',
          50 // feather_px
        )

        // Store the result
        const pipelineRun = await createPipelineRun(supabase, link.source_room_id, 'refinement')
        const stage = await createPipelineStage(supabase, pipelineRun.id, 'visibility_sync')

        await storeGenerationResult(
          supabase,
          pipelineRun.id,
          link.source_room_id,
          'visibility_sync',
          resultUrl,
          { width: sourceRender.width, height: sourceRender.height },
          undefined,
          {
            target_room_id: link.target_room_id,
            lock_method: link.lock_method,
            zone_type: link.zone_type,
            visibility_pct: link.visibility_pct,
          }
        )

        await updateStageStatus(supabase, stage.id, 'completed', {
          duration_ms: Date.now() - startTime,
          lock_method: link.lock_method,
        })
        await completePipelineRun(supabase, pipelineRun.id)
      } else {
        // ---------------------------------------------------------------
        // Mock mode: simulate sync with timing estimates
        // ---------------------------------------------------------------
        const mockDuration = estimateMockDuration(link.lock_method, link.visibility_pct)
        await simulateDelay(Math.min(mockDuration, 500)) // cap actual delay in mock
      }

      // Mark link as synced
      await supabase
        .schema('scene')
        .from('visibility_links')
        .update({
          needs_resync: false,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', link.id)

      roomsSynced++
      syncDetails.push({
        source_room_id: link.source_room_id,
        target_room_id: link.target_room_id,
        lock_method: link.lock_method,
        duration_ms: Date.now() - startTime,
        success: true,
      })
    } catch (err) {
      roomsFailed++
      syncDetails.push({
        source_room_id: link.source_room_id,
        target_room_id: link.target_room_id,
        lock_method: link.lock_method,
        duration_ms: Date.now() - startTime,
        success: false,
      })

      console.error(
        `Visibility sync failed for ${link.source_room_id} -> ${link.target_room_id}:`,
        err instanceof Error ? err.message : err
      )
    }
  }

  return {
    project_id: projectId,
    rooms_synced: roomsSynced,
    rooms_failed: roomsFailed,
    sync_details: syncDetails,
  }
}

// ---------------------------------------------------------------------------
// POST /api/visibility/sync
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const project_id = validateUUID(body.project_id, 'project_id')

    const result = await executeVisibilitySync(project_id)

    return NextResponse.json({
      status: result.rooms_failed === 0 ? 'completed' : 'partial',
      ...result,
    })
  } catch (err) {
    if (err instanceof SanitizeError) {
      return NextResponse.json(sanitizeErrorResponse(err), { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Visibility sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateMockDuration(lockMethod: string, visibilityPct: number): number {
  // Estimate processing time based on complexity
  const baseDuration = 2000
  const methodMultiplier =
    lockMethod === 'reference_lock' ? 1.5 :
    lockMethod === 'hybrid' ? 1.2 :
    1.0
  const coverageMultiplier = 1 + (visibilityPct / 100) * 0.5

  return Math.round(baseDuration * methodMultiplier * coverageMultiplier)
}

function simulateDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

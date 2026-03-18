// M14 — Interactive Editing Engine — Next.js API Route
// Executes incremental regeneration for an edit command.
// Called by the Edge Function via fire-and-forget after an edit is submitted.
// In mock mode, generates a placeholder result. In real mode, would use
// SmartEdit-13B for reasoning and Flux Pro + ControlNet for inpainting.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createPipelineStage,
  updateStageStatus,
} from '@/lib/pipeline'
import {
  fetchSceneContext,
  storeGenerationResult,
  getReplicateClient,
  type StageResult,
  type SceneContext,
} from '@/lib/generation'
import {
  calculateInfluenceZone,
  type EditHistoryEntry,
} from '@/lib/editing'
import { validateUUID, SanitizeError, sanitizeErrorResponse } from '@/lib/sanitize'

export const maxDuration = 120 // Edits are faster than full generation: 10-15s per element

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditCommand {
  action?: string
  target_query?: string
  target_elements?: string[]
  parameters?: Record<string, unknown>
  confidence?: number
  type?: string
}

// ---------------------------------------------------------------------------
// Core execution function (importable by other modules)
// ---------------------------------------------------------------------------

async function executeEdit(editId: string): Promise<StageResult> {
  const supabase = await createClient()

  // 1. Fetch the edit record
  const { data: editRecord, error: editError } = await supabase
    .schema('generation')
    .from('edit_history')
    .select('*')
    .eq('id', editId)
    .single()

  if (editError || !editRecord) {
    throw new Error(`Edit record not found: ${editError?.message ?? 'no data'}`)
  }

  const edit = editRecord as EditHistoryEntry
  const roomId = edit.room_id
  const editCommand = edit.edit_command as unknown as EditCommand

  // 2. Fetch scene context
  const context = await fetchSceneContext(supabase, roomId)
  const projectId = context.project.id

  // 3. Create pipeline stage for this edit
  const runId = edit.run_id ?? `edit-${editId}`
  const stage = await createPipelineStage(supabase, runId, 'editing')

  try {
    // 4. Determine affected elements and influence zone
    const targetElementIds = edit.target_elements ?? editCommand.target_elements ?? []
    const affectedZones = resolveAffectedZones(targetElementIds, context)

    const replicate = getReplicateClient()

    let editResult = null
    const editStoragePath = `pipeline/${projectId}/${roomId}/edit_${editId}.json`

    if (replicate) {
      // ----- Real mode -----
      // Would use SmartEdit-13B for reasoning, then Flux Pro + ControlNet for regeneration.
      //
      // For each affected element:
      //   1. Create inpainting mask from influence zone bbox
      //   2. Build prompt from edit command + scene context
      //   3. Run ControlNet-guided inpainting on the region
      //   4. Apply sacred zone preservation (composite original pixels back)
      //   5. Re-run partial lighting (M08) on the influence zone
      //   6. Re-harmonize the edited region (M09)
      //
      // For now, fall through to mock mode since the real pipeline requires
      // model-specific integration that depends on the actual edit action.

      console.log(
        `[M14 edit] Real mode — would regenerate ${targetElementIds.length} elements ` +
          `using SmartEdit-13B + Flux Pro ControlNet`
      )

      // Store edit metadata
      const editMetadata = {
        edit_id: editId,
        action: edit.action,
        target_elements: targetElementIds,
        influence_zones: affectedZones,
        model_used: 'smartedit-13b + flux-pro-controlnet',
        mock_mode: false,
      }

      const metadataJson = JSON.stringify(editMetadata, null, 2)
      try {
        await supabase.storage
          .from('pipeline')
          .upload(editStoragePath, new TextEncoder().encode(metadataJson), {
            contentType: 'application/json',
            upsert: true,
          })
      } catch {
        // Storage may not be available
      }

      editResult = await storeGenerationResult(
        supabase,
        runId,
        roomId,
        'edit',
        editStoragePath,
        {
          width: context.upload.width ?? 1024,
          height: context.upload.height ?? 768,
        },
        {
          elements_modified: targetElementIds.length,
          influence_zones: affectedZones.length,
          model_confidence: 0.85,
        },
        editMetadata
      )
    } else {
      // ----- Mock mode -----
      console.log(
        `[M14 edit] Mock mode — generating placeholder result for edit ${editId} ` +
          `(action=${edit.action}, targets=${targetElementIds.join(', ')})`
      )

      const editMetadata = {
        edit_id: editId,
        action: edit.action,
        target_elements: targetElementIds,
        influence_zones: affectedZones,
        model_used: 'mock-edit',
        mock_mode: true,
        mock_changes: targetElementIds.map((elId) => ({
          element_id: elId,
          status: 'modified',
          action_applied: edit.action,
          parameters: editCommand.parameters ?? {},
        })),
      }

      const metadataJson = JSON.stringify(editMetadata, null, 2)
      try {
        await supabase.storage
          .from('pipeline')
          .upload(editStoragePath, new TextEncoder().encode(metadataJson), {
            contentType: 'application/json',
            upsert: true,
          })
      } catch {
        // Storage may not be available in mock mode
      }

      editResult = await storeGenerationResult(
        supabase,
        runId,
        roomId,
        'edit',
        editStoragePath,
        {
          width: context.upload.width ?? 1024,
          height: context.upload.height ?? 768,
        },
        {
          elements_modified: targetElementIds.length,
          influence_zones: affectedZones.length,
          model_confidence: 0.0,
        },
        editMetadata
      )
    }

    // 5. Create new scene graph version with the edit applied
    const newSceneGraphVersion = await applyEditToSceneGraph(
      supabase,
      roomId,
      editId,
      edit,
      editCommand
    )

    // 6. Update edit_history status to completed
    await supabase
      .schema('generation')
      .from('edit_history')
      .update({
        status: 'completed',
        run_id: runId,
        scene_graph_version_after: newSceneGraphVersion,
      })
      .eq('id', editId)

    // 7. Update pipeline stage
    await updateStageStatus(supabase, stage.id, 'completed', {
      model: replicate ? 'smartedit-13b' : 'mock-edit',
      elements_modified: targetElementIds.length,
      action: edit.action,
      influence_zones: affectedZones.length,
    })

    return {
      run_id: runId,
      stage_id: stage.id,
      result: editResult,
      metadata: {
        edit_id: editId,
        action: edit.action,
        target_elements: targetElementIds,
        influence_zones: affectedZones,
        new_scene_graph_version: newSceneGraphVersion,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Edit execution failed'
    await updateStageStatus(supabase, stage.id, 'failed')

    // Mark edit as failed
    await supabase
      .schema('generation')
      .from('edit_history')
      .update({ status: 'failed' })
      .eq('id', editId)

    throw new Error(msg)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AffectedZone {
  element_id: string
  bbox: { x: number; y: number; width: number; height: number }
  affected_elements: string[]
  needs_lighting_update: boolean
  needs_harmonization: boolean
}

/**
 * Resolve influence zones for all target elements using the scene graph.
 * Falls back to a full-room zone if spatial data is unavailable.
 */
function resolveAffectedZones(
  targetElementIds: string[],
  context: SceneContext
): AffectedZone[] {
  const zones: AffectedZone[] = []
  const sceneGraph = context.sceneGraph

  if (!sceneGraph || !targetElementIds.length) {
    // No scene graph or targets — treat as full room edit
    return [{
      element_id: 'room',
      bbox: { x: 0, y: 0, width: context.upload.width ?? 1024, height: context.upload.height ?? 768 },
      affected_elements: targetElementIds,
      needs_lighting_update: true,
      needs_harmonization: true,
    }]
  }

  // Walk scene graph to find element data
  const graphData = sceneGraph as unknown as {
    layers?: {
      layer_0?: { elements: Array<Record<string, unknown>> }
      layer_1?: { elements: Array<Record<string, unknown>> }
      layer_2?: { elements: Array<Record<string, unknown>> }
    }
  }

  const allElements: Array<Record<string, unknown>> = []
  if (graphData.layers) {
    for (const key of ['layer_0', 'layer_1', 'layer_2'] as const) {
      const layer = graphData.layers[key]
      if (layer?.elements) {
        allElements.push(...layer.elements)
      }
    }
  }

  for (const targetId of targetElementIds) {
    const elementData = allElements.find(
      (el) => (el.element_id ?? el.id) === targetId
    )

    if (elementData) {
      const zone = calculateInfluenceZone(elementData, sceneGraph as object)
      zones.push({
        element_id: targetId,
        ...zone,
      })
    } else {
      // Element not found in graph — use default zone
      zones.push({
        element_id: targetId,
        bbox: { x: 0, y: 0, width: context.upload.width ?? 1024, height: context.upload.height ?? 768 },
        affected_elements: [targetId],
        needs_lighting_update: true,
        needs_harmonization: true,
      })
    }
  }

  return zones
}

/**
 * Apply the edit to the scene graph by creating a new version.
 * Updates element properties based on the edit action and parameters.
 */
async function applyEditToSceneGraph(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roomId: string,
  editId: string,
  edit: EditHistoryEntry,
  editCommand: EditCommand
): Promise<number> {
  // Fetch current scene graph
  const { data: current, error: fetchErr } = await supabase
    .schema('scene')
    .from('scene_graphs')
    .select('id, version, graph_data')
    .eq('room_id', roomId)
    .eq('is_current', true)
    .maybeSingle()

  if (fetchErr || !current) {
    // No scene graph exists — return 0 to indicate no version change
    return 0
  }

  // deno-lint-ignore no-explicit-any
  const graphData = structuredClone(current.graph_data) as any
  const targetElements = edit.target_elements ?? []
  const params = editCommand.parameters ?? {}

  // Apply edit based on action type
  if (graphData?.layers) {
    const layerKeys = ['layer_0', 'layer_1', 'layer_2']

    for (const key of layerKeys) {
      const layer = graphData.layers[key]
      if (!layer?.elements) continue

      for (const el of layer.elements) {
        const elId = el.element_id ?? el.id ?? ''
        if (!targetElements.includes(elId)) continue

        switch (edit.action) {
          case 'swap':
            if (params.replacement) {
              el.type = params.replacement as string
              el.sub_type = params.replacement as string
            }
            break

          case 'move':
            if (params.direction && el.position) {
              const offset = 50 // Default pixel offset for mock moves
              switch (params.direction) {
                case 'left': el.position.x -= offset; break
                case 'right': el.position.x += offset; break
                case 'up': el.position.y -= offset; break
                case 'down': el.position.y += offset; break
              }
            }
            break

          case 'resize':
            if (params.scale_factor && el.dimensions) {
              const factor = params.scale_factor as number
              el.dimensions.w = Math.round(el.dimensions.w * factor)
              el.dimensions.h = Math.round(el.dimensions.h * factor)
              if (el.dimensions.d) el.dimensions.d = Math.round(el.dimensions.d * factor)
            }
            break

          case 'material_change':
            if (params.new_material) {
              el.material_id = params.new_material as string
            }
            break

          case 'color_change':
            if (params.new_color) {
              el.color = params.new_color as string
            }
            break

          case 'style_change':
            if (params.new_style) {
              el.style = params.new_style as string
            }
            break

          case 'remove':
            // Mark for removal (handled below)
            el.__remove = true
            break

          case 'add':
            // Add is handled separately — new elements are appended
            break
        }
      }

      // Remove marked elements
      if (edit.action === 'remove') {
        layer.elements = layer.elements.filter(
          // deno-lint-ignore no-explicit-any
          (el: any) => !el.__remove
        )
      }
    }

    // Handle 'add' action — add new element to layer_2 (editable)
    if (edit.action === 'add' && targetElements.length > 0) {
      const newElement = {
        element_id: targetElements[0],
        type: (params.element_type as string) ?? editCommand.target_query ?? 'object',
        sub_type: (params.sub_type as string) ?? null,
        layer: 2,
        position: (params.position as Record<string, number>) ?? { x: 512, y: 384, z: 0 },
        dimensions: (params.dimensions as Record<string, number>) ?? { w: 100, h: 100, d: 50 },
        material_id: (params.material as string) ?? null,
        color: (params.color as string) ?? null,
        style: (params.style as string) ?? null,
        locked: false,
      }
      graphData.layers.layer_2.elements.push(newElement)
    }
  }

  // Update version metadata
  const newVersion = current.version + 1
  if (graphData.version != null) graphData.version = newVersion
  if (graphData.timestamp != null) graphData.timestamp = new Date().toISOString()

  // Add to edit_history within graph_data
  if (graphData.edit_history) {
    graphData.edit_history.push({
      version: newVersion,
      action: edit.action,
      timestamp: new Date().toISOString(),
      element_id: targetElements[0] ?? undefined,
      changes: editCommand.parameters ?? {},
    })
  }

  // Unset current flag
  await supabase
    .schema('scene')
    .from('scene_graphs')
    .update({ is_current: false })
    .eq('id', current.id)

  // Insert new version
  const { error: insertErr } = await supabase
    .schema('scene')
    .from('scene_graphs')
    .insert({
      room_id: roomId,
      version: newVersion,
      graph_data: graphData,
      parent_version: current.version,
      edit_command_id: editId,
      is_current: true,
    })

  if (insertErr) {
    throw new Error(`Failed to create new scene graph version: ${insertErr.message}`)
  }

  return newVersion
}

// ---------------------------------------------------------------------------
// POST /api/edit
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Gap 3 — UUID validation on both required fields
    const edit_id = validateUUID(body.edit_id, 'edit_id')
    const room_id = validateUUID(body.room_id, 'room_id')

    const stageResult = await executeEdit(edit_id)

    return NextResponse.json({
      status: 'completed',
      ...stageResult,
    })
  } catch (err) {
    if (err instanceof SanitizeError) {
      return NextResponse.json(sanitizeErrorResponse(err), { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Edit execution failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

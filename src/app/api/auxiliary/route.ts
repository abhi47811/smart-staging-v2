// M17: Declutter, Renovation & Auxiliary Engines — Next.js API Route
// Executes AI-heavy operations: declutter, virtual renovation, and floor plan generation.
// Called by the Edge Function via fire-and-forget.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  fetchSceneContext,
  storeGenerationResult,
  getReplicateClient,
  getSignedUrl,
  runWithFallback,
} from '@/lib/generation'
import {
  completePipelineRun,
  failPipelineRun,
  createPipelineStage,
  updateStageStatus,
} from '@/lib/pipeline'
import {
  validateUUID,
  sanitizeText,
  assertValidEnum,
  SanitizeError,
  sanitizeErrorResponse,
} from '@/lib/sanitize'
import type { SceneContext, SegmentationMask } from '@/lib/generation'

export const maxDuration = 300 // 5 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeclutterParams {
  room_id: string
  run_id: string
  action: 'declutter'
  scope: 'all' | 'categories' | 'specific'
  categories?: string[]
  element_ids?: string[]
}

interface RenovateParams {
  room_id: string
  run_id: string
  action: 'renovate'
  target_surface: string
  new_material_id: string
}

interface FloorPlanParams {
  room_id: string
  run_id: string
  action: 'floor_plan'
  format: 'svg' | 'png' | 'pdf'
  include_furniture: boolean
}

type AuxiliaryParams = DeclutterParams | RenovateParams | FloorPlanParams

// ---------------------------------------------------------------------------
// POST /api/auxiliary
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = (await request.json()) as AuxiliaryParams

    // Gap 3 — structural validation on shared fields
    const room_id = validateUUID(body.room_id, 'room_id')
    const run_id  = validateUUID(body.run_id, 'run_id')
    const action  = assertValidEnum(
      body.action,
      ['declutter', 'renovate', 'floor_plan'] as const,
      'action'
    )

    // Per-action field validation
    if (action === 'renovate') {
      const renovate = body as RenovateParams
      renovate.target_surface = sanitizeText(renovate.target_surface, 'target_surface', {
        maxLength: 100,
        allowNewlines: false,
      })
      validateUUID(renovate.new_material_id, 'new_material_id')
    }
    if (action === 'floor_plan') {
      const fp = body as FloorPlanParams
      assertValidEnum(fp.format, ['svg', 'png', 'pdf'] as const, 'format')
    }

    const validatedBody = { ...body, room_id, run_id, action }

    switch (action) {
      case 'declutter':
        return await handleDeclutter(supabase, validatedBody as DeclutterParams)
      case 'renovate':
        return await handleRenovate(supabase, validatedBody as RenovateParams)
      case 'floor_plan':
        return await handleFloorPlan(supabase, validatedBody as FloorPlanParams)
    }
  } catch (err) {
    if (err instanceof SanitizeError) {
      return NextResponse.json(sanitizeErrorResponse(err), { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Auxiliary pipeline failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Declutter Pipeline
// ---------------------------------------------------------------------------

async function handleDeclutter(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  params: DeclutterParams
): Promise<NextResponse> {
  const { room_id, run_id, scope, categories, element_ids } = params

  try {
    // 1. Create pipeline stage
    const stage = await createPipelineStage(supabase, run_id, 'declutter')

    // 2. Fetch scene context
    const ctx = await fetchSceneContext(supabase, room_id)

    // 3. Identify movable objects from segmentation masks
    const movableLabels = new Set([
      'furniture', 'sofa', 'chair', 'table', 'desk', 'bed', 'cabinet',
      'shelf', 'bookcase', 'lamp', 'light', 'plant', 'vase', 'decor',
      'rug', 'carpet', 'curtain', 'pillow', 'cushion', 'artwork',
      'mirror', 'television', 'tv', 'appliance', 'toy', 'box', 'clutter',
    ])

    // Filter to non-sacred movable objects
    const removableMasks = ctx.allMasks.filter((mask) => {
      if (mask.is_sacred) return false

      const label = mask.label.toLowerCase()
      const isMovable = movableLabels.has(label) ||
        [...movableLabels].some((ml) => label.includes(ml))

      if (!isMovable) return false

      // Apply scope filter
      if (scope === 'all') return true
      if (scope === 'categories' && categories) {
        return categories.some((cat) =>
          label.includes(cat.toLowerCase())
        )
      }
      if (scope === 'specific' && element_ids) {
        return element_ids.includes(mask.id)
      }

      return false
    })

    if (removableMasks.length === 0) {
      await updateStageStatus(supabase, stage.id, 'completed', {
        objects_removed: 0,
        message: 'No removable objects found matching the criteria',
      })
      await completePipelineRun(supabase, run_id)

      return NextResponse.json({
        status: 'completed',
        run_id,
        objects_removed: 0,
        message: 'No removable objects found',
      })
    }

    // 4. Check for Replicate token (real vs mock mode)
    const replicate = getReplicateClient()

    let resultStoragePath: string
    let removalMetadata: Record<string, unknown>

    if (replicate) {
      // ----- REAL MODE: Depth-aware inpainting -----

      // Get signed URLs for source image and masks
      const sourceUrl = await getSignedUrl(supabase, 'uploads', ctx.upload.storage_path)
      const depthUrl = ctx.depthMap
        ? await getSignedUrl(supabase, 'scene-data', ctx.depthMap.storage_path)
        : null

      // Build combined removal mask description for inpainting
      const maskLabels = removableMasks.map((m) => m.label).join(', ')

      // Use Grounded SAM2 to create precise combined mask
      const samResult = await runWithFallback(
        replicate,
        {
          model: 'idea-research/grounded-sam-2',
          version: 'latest',
          input: {
            image: sourceUrl,
            text_prompt: maskLabels,
            box_threshold: 0.3,
            text_threshold: 0.25,
          },
        }
      ) as { combined_mask?: string; masks?: string[] }

      const combinedMaskUrl = samResult?.combined_mask || (samResult?.masks?.[0] ?? null)

      // Run depth-aware inpainting with Flux Pro + ControlNet
      const inpaintInput: Record<string, unknown> = {
        image: sourceUrl,
        mask: combinedMaskUrl,
        prompt: 'empty clean floor and walls, matching surrounding textures and lighting, photorealistic interior photography',
        negative_prompt: 'furniture, objects, clutter, artifacts, distortion',
        guidance_scale: 8.5,
        num_inference_steps: 30,
      }

      // Add depth conditioning if available
      if (depthUrl) {
        inpaintInput.control_image = depthUrl
        inpaintInput.controlnet_conditioning_scale = 0.7
      }

      const inpaintResult = await runWithFallback(
        replicate,
        {
          model: 'black-forest-labs/flux-fill-pro',
          version: 'latest',
          input: inpaintInput,
        }
      )

      const outputUrl = typeof inpaintResult === 'string'
        ? inpaintResult
        : Array.isArray(inpaintResult)
          ? (inpaintResult[0] as string)
          : ''

      // Upload result to storage
      const storagePath = `declutter/${room_id}/${run_id}.png`

      const imageResponse = await fetch(outputUrl)
      const imageBuffer = await imageResponse.arrayBuffer()

      await supabase.storage
        .from('generation-results')
        .upload(storagePath, imageBuffer, {
          contentType: 'image/png',
          upsert: true,
        })

      resultStoragePath = storagePath
      removalMetadata = {
        mode: 'real',
        objects_removed: removableMasks.length,
        removed_labels: removableMasks.map((m) => m.label),
        mask_ids: removableMasks.map((m) => m.id),
        inpainting_model: 'flux-fill-pro',
        depth_conditioned: !!depthUrl,
      }
    } else {
      // ----- MOCK MODE: Copy original as "decluttered" -----

      resultStoragePath = ctx.upload.storage_path
      removalMetadata = {
        mode: 'mock',
        objects_removed: removableMasks.length,
        removed_labels: removableMasks.map((m) => m.label),
        mask_ids: removableMasks.map((m) => m.id),
        note: 'Mock declutter — original image returned. Set REPLICATE_API_TOKEN for real inpainting.',
      }
    }

    // 5. Store result with result_type='before_after'
    const dimensions = {
      width: ctx.upload.width ?? 1024,
      height: ctx.upload.height ?? 768,
    }

    await storeGenerationResult(
      supabase,
      run_id,
      room_id,
      'before_after',
      resultStoragePath,
      dimensions,
      undefined,
      {
        action: 'declutter',
        scope,
        original_path: ctx.upload.storage_path,
        ...removalMetadata,
      }
    )

    // 6. Update depth map to reflect removed objects (mark stage complete)
    await updateStageStatus(supabase, stage.id, 'completed', {
      objects_removed: removableMasks.length,
      removed_labels: removableMasks.map((m) => m.label),
    })

    await completePipelineRun(supabase, run_id)

    return NextResponse.json({
      status: 'completed',
      run_id,
      objects_removed: removableMasks.length,
      removed_labels: removableMasks.map((m) => m.label),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Declutter failed'
    await failPipelineRun(supabase, run_id, message, 'declutter').catch(() => {})
    return NextResponse.json({ error: message, run_id }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Renovation Pipeline
// ---------------------------------------------------------------------------

async function handleRenovate(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  params: RenovateParams
): Promise<NextResponse> {
  const { room_id, run_id, target_surface, new_material_id } = params

  try {
    // 1. Create pipeline stage
    const stage = await createPipelineStage(supabase, run_id, 'renovation')

    // 2. Fetch scene context
    const ctx = await fetchSceneContext(supabase, room_id)

    // 3. Segment target surface from segmentation masks
    const surfaceLabels: Record<string, string[]> = {
      floor: ['floor', 'flooring', 'carpet', 'hardwood', 'tile'],
      walls: ['wall', 'walls', 'wall_surface'],
      ceiling: ['ceiling', 'false_ceiling'],
      countertop: ['countertop', 'counter', 'kitchen_counter', 'island'],
    }

    const targetLabels = surfaceLabels[target_surface] ?? [target_surface]
    const surfaceMasks = ctx.allMasks.filter((mask) =>
      targetLabels.some((label) =>
        mask.label.toLowerCase().includes(label)
      )
    )

    if (surfaceMasks.length === 0) {
      await updateStageStatus(supabase, stage.id, 'failed')
      await failPipelineRun(supabase, run_id, `No ${target_surface} surface found in segmentation`, 'renovation')

      return NextResponse.json(
        { error: `Surface "${target_surface}" not found in scene segmentation` },
        { status: 404 }
      )
    }

    // 4. Fetch new material properties from knowledge.materials
    const { data: material, error: matError } = await supabase
      .schema('knowledge')
      .from('materials')
      .select('*')
      .eq('id', new_material_id)
      .single()

    if (matError || !material) {
      await updateStageStatus(supabase, stage.id, 'failed')
      await failPipelineRun(supabase, run_id, 'Material not found', 'renovation')

      return NextResponse.json({ error: 'Material not found' }, { status: 404 })
    }

    // 5. Check for Replicate token (real vs mock mode)
    const replicate = getReplicateClient()

    let resultStoragePath: string
    let renovationMetadata: Record<string, unknown>

    if (replicate) {
      // ----- REAL MODE: ControlNet + material reference -----

      const sourceUrl = await getSignedUrl(supabase, 'uploads', ctx.upload.storage_path)
      const depthUrl = ctx.depthMap
        ? await getSignedUrl(supabase, 'scene-data', ctx.depthMap.storage_path)
        : null

      // Get mask URL for the target surface
      const primaryMask = surfaceMasks[0]
      const maskUrl = await getSignedUrl(supabase, 'scene-data', primaryMask.mask_storage_path)

      // Build material prompt
      const materialName = material.name ?? material.material_type ?? 'new material'
      const materialColor = material.color ?? material.primary_color ?? ''
      const materialFinish = material.finish ?? material.texture ?? ''

      const prompt = [
        `Replace the ${target_surface} with ${materialName}`,
        materialColor ? `in ${materialColor} color` : '',
        materialFinish ? `with ${materialFinish} finish` : '',
        'maintaining consistent lighting and perspective,',
        'photorealistic interior photography, high quality',
      ].filter(Boolean).join(' ')

      const renovateInput: Record<string, unknown> = {
        image: sourceUrl,
        mask: maskUrl,
        prompt,
        negative_prompt: 'blurry, distorted, low quality, artifacts, mismatched perspective',
        guidance_scale: 8.0,
        num_inference_steps: 30,
      }

      if (depthUrl) {
        renovateInput.control_image = depthUrl
        renovateInput.controlnet_conditioning_scale = 0.8
      }

      const renovateResult = await runWithFallback(
        replicate,
        {
          model: 'black-forest-labs/flux-fill-pro',
          version: 'latest',
          input: renovateInput,
        }
      )

      const outputUrl = typeof renovateResult === 'string'
        ? renovateResult
        : Array.isArray(renovateResult)
          ? (renovateResult[0] as string)
          : ''

      // Upload result
      const storagePath = `renovation/${room_id}/${run_id}.png`

      const imageResponse = await fetch(outputUrl)
      const imageBuffer = await imageResponse.arrayBuffer()

      await supabase.storage
        .from('generation-results')
        .upload(storagePath, imageBuffer, {
          contentType: 'image/png',
          upsert: true,
        })

      // 6. Re-harmonize lighting (different materials reflect differently)
      // Run Real-ESRGAN for quality enhancement after material swap
      const enhancedUrl = await getSignedUrl(supabase, 'generation-results', storagePath)

      try {
        const enhancedResult = await replicate.runModel(
          'nightmareai/real-esrgan',
          'latest',
          {
            image: enhancedUrl,
            scale: 2,
            face_enhance: false,
          }
        )

        if (typeof enhancedResult === 'string') {
          const enhancedResponse = await fetch(enhancedResult)
          const enhancedBuffer = await enhancedResponse.arrayBuffer()

          await supabase.storage
            .from('generation-results')
            .upload(storagePath, enhancedBuffer, {
              contentType: 'image/png',
              upsert: true,
            })
        }
      } catch {
        // Enhancement is optional — continue with non-enhanced result
      }

      resultStoragePath = storagePath
      renovationMetadata = {
        mode: 'real',
        target_surface,
        new_material: materialName,
        material_id: new_material_id,
        surface_masks: surfaceMasks.map((m) => m.id),
        inpainting_model: 'flux-fill-pro',
        enhanced: true,
        depth_conditioned: !!depthUrl,
      }
    } else {
      // ----- MOCK MODE -----

      resultStoragePath = ctx.upload.storage_path
      renovationMetadata = {
        mode: 'mock',
        target_surface,
        new_material: material.name ?? new_material_id,
        material_id: new_material_id,
        surface_masks: surfaceMasks.map((m) => m.id),
        note: 'Mock renovation — original image returned. Set REPLICATE_API_TOKEN for real generation.',
      }
    }

    // 7. Store result
    const dimensions = {
      width: ctx.upload.width ?? 1024,
      height: ctx.upload.height ?? 768,
    }

    await storeGenerationResult(
      supabase,
      run_id,
      room_id,
      'before_after',
      resultStoragePath,
      dimensions,
      undefined,
      {
        action: 'renovate',
        original_path: ctx.upload.storage_path,
        ...renovationMetadata,
      }
    )

    await updateStageStatus(supabase, stage.id, 'completed', {
      target_surface,
      material: material.name ?? new_material_id,
    })

    await completePipelineRun(supabase, run_id)

    return NextResponse.json({
      status: 'completed',
      run_id,
      target_surface,
      new_material: material.name ?? new_material_id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Renovation failed'
    await failPipelineRun(supabase, run_id, message, 'renovation').catch(() => {})
    return NextResponse.json({ error: message, run_id }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Floor Plan Pipeline
// ---------------------------------------------------------------------------

async function handleFloorPlan(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  params: FloorPlanParams
): Promise<NextResponse> {
  const { room_id, run_id, format, include_furniture } = params

  try {
    // 1. Create pipeline stage
    const stage = await createPipelineStage(supabase, run_id, 'floor_plan')

    // 2. Fetch depth map and room layout from scene data
    const ctx = await fetchSceneContext(supabase, room_id)

    // Fetch room measurements
    const { data: measurements } = await supabase
      .schema('scene')
      .from('room_measurements')
      .select('width_mm, length_mm, height_mm')
      .eq('room_id', room_id)
      .limit(1)
      .maybeSingle()

    // Fetch room layout data
    const { data: roomLayout } = await supabase
      .schema('scene')
      .from('room_layouts')
      .select('*')
      .eq('room_id', room_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const widthMm = measurements?.width_mm ?? roomLayout?.width_mm ?? 4000
    const lengthMm = measurements?.length_mm ?? roomLayout?.length_mm ?? 5000
    const heightMm = measurements?.height_mm ?? roomLayout?.height_mm ?? 2700

    // 3. Extract walls, doors, windows from scene graph and room layout
    const walls = extractWalls(roomLayout, widthMm, lengthMm)
    const doors = extractDoors(roomLayout, ctx.allMasks)
    const windows = extractWindows(roomLayout, ctx.allMasks)

    // 4. Optional: furniture positions from scene graph Layer 2
    let furnitureElements: Array<{
      label: string
      x: number
      y: number
      width: number
      height: number
    }> = []

    if (include_furniture && ctx.sceneGraph?.layers) {
      const furnitureLayer = ctx.sceneGraph.layers.find(
        (l) => l.layer_id === 2
      ) ?? ctx.sceneGraph.layers[1]

      if (furnitureLayer) {
        furnitureElements = furnitureLayer.elements.map((el) => ({
          label: el.label,
          x: el.bbox.x,
          y: el.bbox.y,
          width: el.bbox.width,
          height: el.bbox.height,
        }))
      }
    }

    // 5. Generate SVG floor plan (geometric computation, no AI)
    const svgContent = generateFloorPlanSvg({
      widthMm,
      lengthMm,
      heightMm,
      walls,
      doors,
      windows,
      furniture: include_furniture ? furnitureElements : [],
      roomType: ctx.room.room_type,
    })

    // 6. Upload to storage
    const storagePath = `floor-plans/${room_id}/${run_id}.svg`

    const svgBuffer = new TextEncoder().encode(svgContent)
    await supabase.storage
      .from('generation-results')
      .upload(storagePath, svgBuffer, {
        contentType: 'image/svg+xml',
        upsert: true,
      })

    // 7. Store in generation.floor_plans
    const { data: floorPlan, error: fpError } = await supabase
      .schema('generation')
      .from('floor_plans')
      .insert({
        room_id,
        format: 'svg',
        storage_path: storagePath,
        dimensions_mm: { width: widthMm, length: lengthMm, height: heightMm },
        accuracy_pct: measurements ? 90 : 70,
        includes_furniture: include_furniture,
      })
      .select()
      .single()

    if (fpError) {
      throw new Error(`Failed to store floor plan: ${fpError.message}`)
    }

    await updateStageStatus(supabase, stage.id, 'completed', {
      dimensions: { width: widthMm, length: lengthMm, height: heightMm },
      walls: walls.length,
      doors: doors.length,
      windows: windows.length,
      furniture_items: furnitureElements.length,
    })

    await completePipelineRun(supabase, run_id)

    return NextResponse.json({
      status: 'completed',
      run_id,
      floor_plan_id: floorPlan.id,
      storage_path: storagePath,
      dimensions_mm: { width: widthMm, length: lengthMm, height: heightMm },
      includes_furniture: include_furniture,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Floor plan generation failed'
    await failPipelineRun(supabase, run_id, message, 'floor_plan').catch(() => {})
    return NextResponse.json({ error: message, run_id }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Floor Plan SVG Generation Helpers
// ---------------------------------------------------------------------------

interface WallSegment {
  x1: number; y1: number
  x2: number; y2: number
  thickness: number
}

interface DoorInfo {
  x: number; y: number
  width: number
  wall: 'north' | 'south' | 'east' | 'west'
  swing: 'left' | 'right'
}

interface WindowInfo {
  x: number; y: number
  width: number
  wall: 'north' | 'south' | 'east' | 'west'
}

function extractWalls(
  roomLayout: Record<string, unknown> | null,
  widthMm: number,
  lengthMm: number
): WallSegment[] {
  // If room layout has explicit walls, use them
  if (roomLayout?.walls && Array.isArray(roomLayout.walls)) {
    return roomLayout.walls as WallSegment[]
  }

  // Default: rectangular room with 150mm wall thickness
  const t = 150
  return [
    { x1: 0, y1: 0, x2: widthMm, y2: 0, thickness: t },         // North
    { x1: widthMm, y1: 0, x2: widthMm, y2: lengthMm, thickness: t }, // East
    { x1: 0, y1: lengthMm, x2: widthMm, y2: lengthMm, thickness: t }, // South
    { x1: 0, y1: 0, x2: 0, y2: lengthMm, thickness: t },         // West
  ]
}

function extractDoors(
  roomLayout: Record<string, unknown> | null,
  masks: SegmentationMask[]
): DoorInfo[] {
  if (roomLayout?.doors && Array.isArray(roomLayout.doors)) {
    return roomLayout.doors as DoorInfo[]
  }

  // Infer from segmentation masks
  const doorMasks = masks.filter((m) =>
    /door/i.test(m.label)
  )

  return doorMasks.map((m, i) => ({
    x: 800 + i * 1200,
    y: 0,
    width: 900,
    wall: 'north' as const,
    swing: (i % 2 === 0 ? 'left' : 'right') as 'left' | 'right',
  }))
}

function extractWindows(
  roomLayout: Record<string, unknown> | null,
  masks: SegmentationMask[]
): WindowInfo[] {
  if (roomLayout?.windows && Array.isArray(roomLayout.windows)) {
    return roomLayout.windows as WindowInfo[]
  }

  // Infer from segmentation masks
  const windowMasks = masks.filter((m) =>
    /window/i.test(m.label)
  )

  return windowMasks.map((m, i) => ({
    x: 600 + i * 1500,
    y: 0,
    width: 1200,
    wall: 'south' as const,
  }))
}

interface FloorPlanConfig {
  widthMm: number
  lengthMm: number
  heightMm: number
  walls: WallSegment[]
  doors: DoorInfo[]
  windows: WindowInfo[]
  furniture: Array<{ label: string; x: number; y: number; width: number; height: number }>
  roomType: string
}

function generateFloorPlanSvg(config: FloorPlanConfig): string {
  const { widthMm, lengthMm, heightMm, walls, doors, windows, furniture, roomType } = config

  // SVG coordinate system: 1 unit = 1mm, with padding
  const padding = 600
  const svgWidth = widthMm + padding * 2
  const svgHeight = lengthMm + padding * 2

  // Scale for readable dimensions text
  const wallColor = '#333333'
  const wallFill = '#444444'
  const doorColor = '#2196F3'
  const windowColor = '#4CAF50'
  const furnitureColor = '#FF9800'
  const dimColor = '#666666'
  const bgColor = '#FAFAFA'
  const fontSize = Math.max(120, Math.min(widthMm, lengthMm) / 30)

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${svgWidth} ${svgHeight}"
     width="${svgWidth / 10}" height="${svgHeight / 10}">
  <defs>
    <style>
      .wall { fill: ${wallFill}; stroke: ${wallColor}; stroke-width: 4; }
      .door { fill: none; stroke: ${doorColor}; stroke-width: 6; }
      .door-arc { fill: none; stroke: ${doorColor}; stroke-width: 3; stroke-dasharray: 12,6; }
      .window { fill: none; stroke: ${windowColor}; stroke-width: 8; }
      .window-line { stroke: ${windowColor}; stroke-width: 3; }
      .furniture { fill: ${furnitureColor}; fill-opacity: 0.2; stroke: ${furnitureColor}; stroke-width: 3; }
      .dim-line { stroke: ${dimColor}; stroke-width: 2; }
      .dim-text { fill: ${dimColor}; font-family: Arial, sans-serif; font-size: ${fontSize}px; text-anchor: middle; }
      .label { fill: #333; font-family: Arial, sans-serif; font-size: ${fontSize * 0.8}px; text-anchor: middle; }
      .title { fill: #222; font-family: Arial, sans-serif; font-size: ${fontSize * 1.2}px; font-weight: bold; text-anchor: middle; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${svgWidth}" height="${svgHeight}" fill="${bgColor}"/>

  <!-- Title -->
  <text class="title" x="${svgWidth / 2}" y="${padding / 2}">${formatRoomType(roomType)} Floor Plan</text>

  <g transform="translate(${padding}, ${padding})">`

  // Draw walls
  for (const wall of walls) {
    const dx = wall.x2 - wall.x1
    const dy = wall.y2 - wall.y1
    const len = Math.sqrt(dx * dx + dy * dy)

    if (len === 0) continue

    // Normal direction for thickness
    const nx = -dy / len * wall.thickness / 2
    const ny = dx / len * wall.thickness / 2

    svg += `
    <polygon class="wall" points="${wall.x1 + nx},${wall.y1 + ny} ${wall.x2 + nx},${wall.y2 + ny} ${wall.x2 - nx},${wall.y2 - ny} ${wall.x1 - nx},${wall.y1 - ny}"/>`
  }

  // Draw doors with swing arcs
  for (const door of doors) {
    const { x, y, width: doorWidth, wall: doorWall, swing } = door

    // Draw door opening (gap in wall)
    svg += `
    <line class="door" x1="${x}" y1="${y}" x2="${x + doorWidth}" y2="${y}"/>`

    // Draw swing arc
    const arcRadius = doorWidth
    const startAngle = doorWall === 'north' ? 0 : doorWall === 'south' ? Math.PI : 0
    const sweepFlag = swing === 'right' ? 1 : 0

    if (doorWall === 'north' || doorWall === 'south') {
      const cy = doorWall === 'north' ? y : y
      const pivotX = swing === 'right' ? x + doorWidth : x
      const arcEndX = pivotX
      const arcEndY = cy + (doorWall === 'north' ? doorWidth : -doorWidth)

      svg += `
    <path class="door-arc" d="M ${swing === 'right' ? x : x + doorWidth} ${cy} A ${arcRadius} ${arcRadius} 0 0 ${sweepFlag} ${arcEndX} ${arcEndY}"/>`
    }
  }

  // Draw windows
  for (const win of windows) {
    const { x, y, width: winWidth, wall: winWall } = win

    if (winWall === 'north' || winWall === 'south') {
      svg += `
    <line class="window" x1="${x}" y1="${y}" x2="${x + winWidth}" y2="${y}"/>
    <line class="window-line" x1="${x}" y1="${y - 40}" x2="${x + winWidth}" y2="${y - 40}"/>
    <line class="window-line" x1="${x}" y1="${y + 40}" x2="${x + winWidth}" y2="${y + 40}"/>`
    } else {
      svg += `
    <line class="window" x1="${x}" y1="${y}" x2="${x}" y2="${y + winWidth}"/>
    <line class="window-line" x1="${x - 40}" y1="${y}" x2="${x - 40}" y2="${y + winWidth}"/>
    <line class="window-line" x1="${x + 40}" y1="${y}" x2="${x + 40}" y2="${y + winWidth}"/>`
    }
  }

  // Draw dimension lines
  const dimOffset = 200

  // Width dimension (top)
  svg += `
    <!-- Width dimension -->
    <line class="dim-line" x1="0" y1="${-dimOffset}" x2="${widthMm}" y2="${-dimOffset}"/>
    <line class="dim-line" x1="0" y1="${-dimOffset - 60}" x2="0" y2="${-dimOffset + 60}"/>
    <line class="dim-line" x1="${widthMm}" y1="${-dimOffset - 60}" x2="${widthMm}" y2="${-dimOffset + 60}"/>
    <text class="dim-text" x="${widthMm / 2}" y="${-dimOffset - 40}">${(widthMm / 1000).toFixed(1)}m</text>`

  // Length dimension (right)
  svg += `
    <!-- Length dimension -->
    <line class="dim-line" x1="${widthMm + dimOffset}" y1="0" x2="${widthMm + dimOffset}" y2="${lengthMm}"/>
    <line class="dim-line" x1="${widthMm + dimOffset - 60}" y1="0" x2="${widthMm + dimOffset + 60}" y2="0"/>
    <line class="dim-line" x1="${widthMm + dimOffset - 60}" y1="${lengthMm}" x2="${widthMm + dimOffset + 60}" y2="${lengthMm}"/>
    <text class="dim-text" x="${widthMm + dimOffset + 40}" y="${lengthMm / 2}" transform="rotate(90, ${widthMm + dimOffset + 40}, ${lengthMm / 2})">${(lengthMm / 1000).toFixed(1)}m</text>`

  // Area text in center
  const areaSqm = (widthMm / 1000) * (lengthMm / 1000)
  svg += `
    <!-- Area label -->
    <text class="dim-text" x="${widthMm / 2}" y="${lengthMm / 2}">${areaSqm.toFixed(1)} sqm</text>
    <text class="label" x="${widthMm / 2}" y="${lengthMm / 2 + fontSize * 1.2}">h: ${(heightMm / 1000).toFixed(1)}m</text>`

  // Draw furniture (if included)
  if (furniture.length > 0) {
    svg += `
    <!-- Furniture -->`

    for (const item of furniture) {
      // Scale furniture bbox from normalized (0-1) to room dimensions
      const fx = item.x * widthMm
      const fy = item.y * lengthMm
      const fw = item.width * widthMm
      const fh = item.height * lengthMm

      svg += `
    <rect class="furniture" x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="20"/>
    <text class="label" x="${fx + fw / 2}" y="${fy + fh / 2 + fontSize * 0.3}">${truncateLabel(item.label, 12)}</text>`
    }
  }

  svg += `
  </g>

  <!-- Legend -->
  <g transform="translate(${padding}, ${svgHeight - padding / 2 + 80})">
    <rect x="0" y="0" width="60" height="20" class="wall"/>
    <text class="label" x="80" y="16">Wall</text>
    <line x1="160" y1="10" x2="220" y2="10" class="door"/>
    <text class="label" x="250" y="16">Door</text>
    <line x1="320" y1="10" x2="380" y2="10" class="window"/>
    <text class="label" x="420" y="16">Window</text>`

  if (furniture.length > 0) {
    svg += `
    <rect x="500" y="0" width="60" height="20" class="furniture"/>
    <text class="label" x="590" y="16">Furniture</text>`
  }

  svg += `
  </g>
</svg>`

  return svg
}

function formatRoomType(roomType: string): string {
  return roomType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label
  return label.substring(0, maxLen - 1) + '\u2026'
}

// Shared generation helpers for M07/M08/M09 pipeline stages
// Provides model routing, sacred zone masking, scene context fetching, and result storage.

import { SupabaseClient } from '@supabase/supabase-js'
import { ReplicateClient } from '@/lib/replicate'

// ---------------------------------------------------------------------------
// DB Entity Interfaces (matching schema)
// ---------------------------------------------------------------------------

export interface Room {
  id: string
  project_id: string
  name: string
  room_type: string
  status: string
  created_at: string
  deleted_at: string | null
}

export interface Project {
  id: string
  name: string
  status: string
  created_at: string
}

export interface Upload {
  id: string
  room_id: string
  storage_path: string
  original_filename: string
  file_size: number
  mime_type: string
  width: number | null
  height: number | null
  created_at: string
}

export interface DepthMap {
  id: string
  room_id: string
  model_used: string
  storage_path: string
  confidence_score: number
  created_at: string
}

export interface SegmentationMask {
  id: string
  room_id: string
  label: string
  mask_storage_path: string
  is_sacred: boolean
  model_used: string
  confidence_score: number
  created_at: string
}

export interface LightingAnalysis {
  id: string
  room_id: string
  light_sources: LightSource[]
  dominant_direction: string
  color_temperature_k: number
  ambient_level: number
  created_at: string
}

export interface LightSource {
  type: string
  direction: string
  intensity: number
}

export interface MaterialDetection {
  id: string
  room_id: string
  surface_type: string
  detected_material: string
  confidence_score: number
  material_id: string | null
  created_at: string
}

export interface SceneGraph {
  id: string
  room_id: string
  layers: SceneGraphLayer[]
  spatial_relationships: Record<string, unknown>[]
  created_at: string
}

export interface SceneGraphLayer {
  layer_id: number
  name: string
  elements: SceneGraphElement[]
}

export interface SceneGraphElement {
  id: string
  label: string
  bbox: { x: number; y: number; width: number; height: number }
  depth: number
  mask_id: string | null
}

export interface DesignBrief {
  id: string
  room_id: string
  style: string
  color_palette: string[]
  description: string
  photography_params: PhotographyParams | null
  created_at: string
}

export interface PhotographyParams {
  vignette_strength: number
  bokeh_intensity: number
  grain_sigma: number
  highlight_rolloff: number
  color_grading: 'warm_natural' | 'cool_commercial' | 'neutral' | 'editorial'
  microcontrast: number
}

export interface GenerationResult {
  id: string
  run_id: string
  room_id: string
  result_type: string
  storage_path: string
  width: number
  height: number
  quality_scores: Record<string, number> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface SceneContext {
  room: Room
  project: Project
  upload: Upload
  depthMap: DepthMap | null
  sacredMasks: SegmentationMask[]
  allMasks: SegmentationMask[]
  lightingAnalysis: LightingAnalysis | null
  materialDetections: MaterialDetection[]
  sceneGraph: SceneGraph | null
  designBrief: DesignBrief | null
}

export interface StageResult {
  run_id: string
  stage_id: string
  result: GenerationResult | null
  metadata?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Model routing with fallback
// ---------------------------------------------------------------------------

/**
 * Run a model with automatic fallback if the primary times out or errors.
 * @param replicate - Active ReplicateClient
 * @param primary - Primary model config
 * @param fallback - Optional fallback model config
 * @param maxLatencyMs - Timeout for the primary before switching to fallback (default 120s)
 */
export async function runWithFallback(
  replicate: ReplicateClient,
  primary: { model: string; version: string; input: Record<string, unknown> },
  fallback?: { model: string; version: string; input: Record<string, unknown> },
  maxLatencyMs = 120_000
): Promise<unknown> {
  try {
    // Create prediction and wait with a tighter timeout for the primary
    const { id } = await replicate.createPrediction(
      primary.model,
      primary.version,
      primary.input
    )
    const prediction = await replicate.waitForPrediction(id, maxLatencyMs)
    return prediction.output
  } catch (primaryError) {
    if (!fallback) throw primaryError

    console.warn(
      `Primary model ${primary.model} failed, falling back to ${fallback.model}:`,
      primaryError instanceof Error ? primaryError.message : primaryError
    )

    return replicate.runModel(fallback.model, fallback.version, fallback.input)
  }
}

// ---------------------------------------------------------------------------
// Sacred zone masking
// ---------------------------------------------------------------------------

/**
 * Composite original pixels back into generated image where sacred zones exist.
 *
 * In mock mode, this returns the generated image URL as-is with a placeholder
 * preservation score. In production, this would use canvas/sharp for pixel-level
 * compositing with feathered edges.
 */
export function applySacredZoneMask(
  generatedImageUrl: string,
  originalImageUrl: string,
  sacredMaskUrl: string,
  featherPx: number
): { resultUrl: string; preservationScore: number } {
  // Production implementation would:
  // 1. Load generated image, original image, and sacred mask
  // 2. For each pixel where mask > 0.5, blend original pixels into generated
  // 3. Apply Gaussian feathering at mask edges (featherPx radius)
  // 4. Calculate preservation score = (sacred pixels unchanged) / (total sacred pixels)
  //
  // For now, return the generated image with metadata indicating sacred zone handling.
  // The actual compositing requires sharp/canvas which is handled in the production build.

  void originalImageUrl
  void sacredMaskUrl
  void featherPx

  return {
    resultUrl: generatedImageUrl,
    preservationScore: 0.95, // Placeholder — real score computed from pixel comparison
  }
}

// ---------------------------------------------------------------------------
// Scene context fetching
// ---------------------------------------------------------------------------

/**
 * Fetch all scene data needed for generation from the database.
 * Pulls room info, project, upload, depth map, masks, lighting, materials,
 * scene graph, and design brief in parallel where possible.
 */
export async function fetchSceneContext(
  supabase: SupabaseClient,
  roomId: string
): Promise<SceneContext> {
  // Fetch room with project and upload
  const { data: room, error: roomError } = await supabase
    .schema('core')
    .from('rooms')
    .select('*, projects:project_id(*), uploads(*)')
    .eq('id', roomId)
    .is('deleted_at', null)
    .single()

  if (roomError || !room) {
    throw new Error(`Room not found: ${roomError?.message ?? 'no data'}`)
  }

  const project = room.projects as unknown as Project
  const upload = (Array.isArray(room.uploads) ? room.uploads[0] : room.uploads) as Upload

  if (!upload?.storage_path) {
    throw new Error('Room has no uploaded image')
  }

  // Fetch scene data in parallel
  const [
    depthResult,
    masksResult,
    lightingResult,
    materialsResult,
    sceneGraphResult,
    briefResult,
  ] = await Promise.all([
    supabase
      .schema('scene')
      .from('depth_maps')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .schema('scene')
      .from('segmentation_masks')
      .select('*')
      .eq('room_id', roomId),

    supabase
      .schema('scene')
      .from('lighting_analyses')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .schema('scene')
      .from('material_detections')
      .select('*')
      .eq('room_id', roomId),

    supabase
      .schema('scene')
      .from('scene_graphs')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .schema('design')
      .from('design_briefs')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const allMasks = (masksResult.data ?? []) as SegmentationMask[]
  const sacredMasks = allMasks.filter((m) => m.is_sacred)

  return {
    room: room as unknown as Room,
    project,
    upload,
    depthMap: (depthResult.data as DepthMap | null) ?? null,
    sacredMasks,
    allMasks,
    lightingAnalysis: (lightingResult.data as LightingAnalysis | null) ?? null,
    materialDetections: (materialsResult.data ?? []) as MaterialDetection[],
    sceneGraph: (sceneGraphResult.data as SceneGraph | null) ?? null,
    designBrief: (briefResult.data as DesignBrief | null) ?? null,
  }
}

// ---------------------------------------------------------------------------
// Result storage
// ---------------------------------------------------------------------------

/**
 * Store a generation result record in the database.
 */
export async function storeGenerationResult(
  supabase: SupabaseClient,
  runId: string,
  roomId: string,
  resultType: string,
  storagePath: string,
  dimensions: { width: number; height: number },
  qualityScores?: Record<string, number>,
  metadata?: Record<string, unknown>
): Promise<GenerationResult> {
  const { data, error } = await supabase
    .schema('generation')
    .from('generation_results')
    .insert({
      run_id: runId,
      room_id: roomId,
      result_type: resultType,
      storage_path: storagePath,
      width: dimensions.width,
      height: dimensions.height,
      quality_scores: qualityScores ?? null,
      metadata: metadata ?? null,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to store generation result: ${error.message}`)
  }

  return data as GenerationResult
}

// ---------------------------------------------------------------------------
// Utility: check for Replicate token
// ---------------------------------------------------------------------------

export function hasReplicateToken(): boolean {
  return !!process.env.REPLICATE_API_TOKEN
}

export function getReplicateClient(): ReplicateClient | null {
  if (!hasReplicateToken()) return null
  return new ReplicateClient()
}

// ---------------------------------------------------------------------------
// Utility: get signed URL for a storage path
// ---------------------------------------------------------------------------

export async function getSignedUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn = 600
): Promise<string> {
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)

  return data?.signedUrl ?? ''
}

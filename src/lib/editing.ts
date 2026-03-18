// M14 — Interactive Editing Engine — Shared Helpers
// Provides edit command parsing, target resolution, influence zone calculation,
// and undo/redo chain management for the editing pipeline.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedEdit {
  action: string
  target_query: string
  parameters: Record<string, unknown>
  scope: 'single_element' | 'category' | 'room' | 'project'
  confidence: number
}

export interface ResolvedTarget {
  resolved: boolean
  elements: Array<{ id: string; label: string; layer: number }>
  ambiguous: boolean
  options?: Array<{ id: string; label: string; description: string }>
}

export interface InfluenceZone {
  bbox: { x: number; y: number; width: number; height: number }
  affected_elements: string[]
  needs_lighting_update: boolean
  needs_harmonization: boolean
}

export interface UndoRedoState {
  can_undo: boolean
  can_redo: boolean
  undo_version: number | null
  redo_version: number | null
  history_length: number
}

export interface EditHistoryEntry {
  id: string
  room_id: string
  run_id: string | null
  edit_command: Record<string, unknown>
  original_prompt: string | null
  action: string
  target_elements: string[]
  scope: string
  scene_graph_version_before: number | null
  scene_graph_version_after: number | null
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'rolled_back'
  created_at: string
}

// Internal type for scene graph elements during resolution
interface SceneGraphElement {
  element_id?: string
  id?: string
  type?: string
  sub_type?: string
  label?: string
  position?: { x: number; y: number; z: number }
  dimensions?: { w: number; d: number; h: number }
  bounds?: { x: number; y: number; z: number; w: number; h: number; d: number }
  bbox?: { x: number; y: number; width: number; height: number }
  material_id?: string
  color?: string
  style?: string
  sacred?: boolean
  layer?: number
}

interface SceneGraphLayer {
  label?: string
  elements: SceneGraphElement[]
}

interface SceneGraphData {
  layers: {
    layer_0: SceneGraphLayer
    layer_1: SceneGraphLayer
    layer_2: SceneGraphLayer
  }
  version?: number
}

// ---------------------------------------------------------------------------
// Action keyword map for NLP parsing
// ---------------------------------------------------------------------------

const ACTION_KEYWORDS: Record<string, string[]> = {
  swap: ['swap', 'replace', 'switch', 'exchange', 'substitute'],
  add: ['add', 'place', 'insert', 'put', 'include', 'introduce'],
  remove: ['remove', 'delete', 'take out', 'get rid of', 'clear', 'eliminate'],
  move: ['move', 'shift', 'relocate', 'reposition', 'drag', 'slide'],
  resize: ['resize', 'scale', 'enlarge', 'shrink', 'bigger', 'smaller', 'grow'],
  material_change: [
    'material', 'texture', 'fabric', 'leather', 'wood', 'marble',
    'granite', 'velvet', 'linen', 'cotton', 'metal', 'glass',
  ],
  style_change: ['style', 'modern', 'traditional', 'contemporary', 'minimalist', 'bohemian', 'industrial', 'scandinavian'],
  color_change: ['color', 'colour', 'paint', 'tint', 'hue', 'shade', 'tone'],
  lighting_change: ['lighting', 'brighten', 'darken', 'dim', 'illuminate', 'light'],
}

// Common furniture and element labels for target matching
const ELEMENT_ALIASES: Record<string, string[]> = {
  sofa: ['sofa', 'couch', 'settee', 'loveseat'],
  chair: ['chair', 'armchair', 'seat', 'recliner'],
  table: ['table', 'desk', 'surface'],
  coffee_table: ['coffee table', 'center table'],
  dining_table: ['dining table'],
  bed: ['bed', 'mattress'],
  lamp: ['lamp', 'light', 'fixture', 'sconce'],
  rug: ['rug', 'carpet', 'mat'],
  curtain: ['curtain', 'drape', 'blind', 'shade'],
  shelf: ['shelf', 'bookshelf', 'shelving', 'bookcase'],
  cabinet: ['cabinet', 'cupboard', 'dresser', 'wardrobe', 'closet'],
  plant: ['plant', 'planter', 'flower', 'vase'],
  artwork: ['artwork', 'painting', 'picture', 'frame', 'art', 'poster'],
  mirror: ['mirror'],
  tv: ['tv', 'television', 'screen', 'monitor'],
}

// ---------------------------------------------------------------------------
// 1. parseEditCommand
// ---------------------------------------------------------------------------

/**
 * Parse a natural language edit command into a structured format.
 *
 * In mock mode (no AI model), uses simple keyword matching to identify the
 * action type, target element, and parameters from the prompt text.
 *
 * @param prompt - The natural language edit command
 * @param sceneGraph - The current scene graph object
 * @returns A structured ParsedEdit object
 */
export function parseEditCommand(
  prompt: string,
  sceneGraph: object
): ParsedEdit {
  const lower = prompt.toLowerCase().trim()

  // 1. Detect action type via keyword matching
  let detectedAction = 'style_change' // fallback
  let bestConfidence = 0.3

  for (const [action, keywords] of Object.entries(ACTION_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        const confidence = kw.length / lower.length + 0.4
        if (confidence > bestConfidence) {
          detectedAction = action
          bestConfidence = Math.min(confidence, 0.95)
        }
      }
    }
  }

  // 2. Extract target query — look for element references
  let targetQuery = ''

  // Check aliases first for multi-word matches
  for (const [canonical, aliases] of Object.entries(ELEMENT_ALIASES)) {
    for (const alias of aliases) {
      if (lower.includes(alias)) {
        targetQuery = canonical
        break
      }
    }
    if (targetQuery) break
  }

  // If no alias matched, try extracting from "the X" pattern
  if (!targetQuery) {
    const theMatch = lower.match(/the\s+(\w+(?:\s+\w+)?)/)
    if (theMatch) {
      targetQuery = theMatch[1]
    }
  }

  // If still nothing, use first noun-like word after the action keyword
  if (!targetQuery) {
    const words = lower.split(/\s+/)
    // Skip action keywords and prepositions
    const skipWords = new Set([
      'the', 'a', 'an', 'to', 'with', 'in', 'on', 'from', 'and', 'or',
      'please', 'can', 'you', 'i', 'want', 'would', 'like',
      ...Object.values(ACTION_KEYWORDS).flat(),
    ])
    for (const word of words) {
      if (!skipWords.has(word) && word.length > 2) {
        targetQuery = word
        break
      }
    }
  }

  // 3. Determine scope
  let scope: ParsedEdit['scope'] = 'single_element'
  if (lower.includes('all ') || lower.includes('every ') || lower.includes('each ')) {
    scope = 'category'
  }
  if (lower.includes('entire room') || lower.includes('whole room')) {
    scope = 'room'
  }
  if (lower.includes('entire project') || lower.includes('all rooms')) {
    scope = 'project'
  }

  // 4. Extract parameters from prompt context
  const parameters: Record<string, unknown> = {}

  // For swap/material_change: extract "with X" or "to X"
  const withMatch = lower.match(/(?:with|to|into)\s+(?:a\s+)?(.+?)(?:\s*$|\s+(?:in|on|at))/)
  if (withMatch) {
    if (detectedAction === 'swap') {
      parameters.replacement = withMatch[1].trim()
    } else if (detectedAction === 'material_change') {
      parameters.new_material = withMatch[1].trim()
    } else if (detectedAction === 'color_change') {
      parameters.new_color = withMatch[1].trim()
    } else if (detectedAction === 'style_change') {
      parameters.new_style = withMatch[1].trim()
    }
  }

  // For move: extract direction hints
  if (detectedAction === 'move') {
    const directions = ['left', 'right', 'up', 'down', 'forward', 'back', 'center', 'corner']
    for (const dir of directions) {
      if (lower.includes(dir)) {
        parameters.direction = dir
        break
      }
    }
  }

  // For resize: extract scale hints
  if (detectedAction === 'resize') {
    if (lower.includes('bigger') || lower.includes('larger') || lower.includes('enlarge')) {
      parameters.scale_factor = 1.25
    } else if (lower.includes('smaller') || lower.includes('shrink')) {
      parameters.scale_factor = 0.75
    }
    const pctMatch = lower.match(/(\d+)\s*%/)
    if (pctMatch) {
      parameters.scale_factor = parseInt(pctMatch[1]) / 100
    }
  }

  // Confidence boost if we found a target in the scene graph
  const graph = sceneGraph as SceneGraphData
  if (graph?.layers && targetQuery) {
    const allElements = [
      ...graph.layers.layer_0.elements,
      ...graph.layers.layer_1.elements,
      ...graph.layers.layer_2.elements,
    ]
    const hasMatch = allElements.some((el) => {
      const label = (el.label ?? el.type ?? el.element_id ?? '').toLowerCase()
      return label.includes(targetQuery.toLowerCase())
    })
    if (hasMatch) {
      bestConfidence = Math.min(bestConfidence + 0.15, 0.98)
    }
  }

  return {
    action: detectedAction,
    target_query: targetQuery,
    parameters,
    scope,
    confidence: Math.round(bestConfidence * 100) / 100,
  }
}

// ---------------------------------------------------------------------------
// 2. resolveTargetElements
// ---------------------------------------------------------------------------

/**
 * Resolve a parsed edit's target query against the scene graph to find
 * matching elements. Returns ambiguity information if multiple matches exist.
 *
 * @param parsed - The parsed edit command
 * @param sceneGraph - The current scene graph object
 * @returns Resolved target with element list and ambiguity info
 */
export function resolveTargetElements(
  parsed: ParsedEdit,
  sceneGraph: object
): ResolvedTarget {
  const graph = sceneGraph as SceneGraphData

  if (!graph?.layers) {
    return {
      resolved: false,
      elements: [],
      ambiguous: false,
    }
  }

  const query = parsed.target_query.toLowerCase()
  if (!query) {
    return {
      resolved: false,
      elements: [],
      ambiguous: false,
    }
  }

  // Collect all elements from all layers with their layer number
  const candidates: Array<{ id: string; label: string; layer: number; score: number }> = []

  const layerEntries: [string, number][] = [
    ['layer_0', 0],
    ['layer_1', 1],
    ['layer_2', 2],
  ]

  for (const [key, layerNum] of layerEntries) {
    const layer = graph.layers[key as keyof SceneGraphData['layers']]
    if (!layer?.elements) continue

    for (const el of layer.elements) {
      const id = el.element_id ?? el.id ?? ''
      const label = el.label ?? el.type ?? el.sub_type ?? id
      const labelLower = label.toLowerCase()
      const typeLower = (el.type ?? '').toLowerCase()
      const subTypeLower = (el.sub_type ?? '').toLowerCase()

      let score = 0

      // Exact match on label/type
      if (labelLower === query || typeLower === query) {
        score = 1.0
      }
      // Partial match
      else if (labelLower.includes(query) || query.includes(labelLower)) {
        score = 0.7
      }
      else if (typeLower.includes(query) || query.includes(typeLower)) {
        score = 0.6
      }
      else if (subTypeLower.includes(query)) {
        score = 0.5
      }
      // Check against aliases
      else {
        for (const [canonical, aliases] of Object.entries(ELEMENT_ALIASES)) {
          if (canonical === query || aliases.includes(query)) {
            if (
              labelLower.includes(canonical) ||
              typeLower.includes(canonical) ||
              aliases.some((a) => labelLower.includes(a) || typeLower.includes(a))
            ) {
              score = 0.65
              break
            }
          }
        }
      }

      if (score > 0) {
        candidates.push({ id, label, layer: layerNum, score })
      }
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score)

  if (candidates.length === 0) {
    return {
      resolved: false,
      elements: [],
      ambiguous: false,
    }
  }

  // For category scope, return all matches
  if (parsed.scope === 'category') {
    return {
      resolved: true,
      elements: candidates.map((c) => ({ id: c.id, label: c.label, layer: c.layer })),
      ambiguous: false,
    }
  }

  // For single_element scope, check for ambiguity
  const topScore = candidates[0].score
  const topMatches = candidates.filter((c) => c.score >= topScore - 0.1)

  if (topMatches.length === 1) {
    return {
      resolved: true,
      elements: [{ id: topMatches[0].id, label: topMatches[0].label, layer: topMatches[0].layer }],
      ambiguous: false,
    }
  }

  // Multiple equally good matches — ambiguous
  return {
    resolved: false,
    elements: [],
    ambiguous: true,
    options: topMatches.map((c) => ({
      id: c.id,
      label: c.label,
      description: `${c.label} (layer ${c.layer}, score ${c.score.toFixed(2)})`,
    })),
  }
}

// ---------------------------------------------------------------------------
// 3. calculateInfluenceZone
// ---------------------------------------------------------------------------

/**
 * Calculate the bounding box of pixels that need regeneration when an element
 * is edited. Includes the element itself plus a buffer for shadows, reflections,
 * and adjacent items that may be visually affected.
 *
 * @param element - The element being edited (must have position/bbox info)
 * @param sceneGraph - The current scene graph object
 * @returns An InfluenceZone describing the affected pixel region
 */
export function calculateInfluenceZone(
  element: object,
  sceneGraph: object
): InfluenceZone {
  const el = element as SceneGraphElement
  const graph = sceneGraph as SceneGraphData

  // Determine element bounding box
  let elBbox: { x: number; y: number; width: number; height: number }

  if (el.bbox) {
    elBbox = { ...el.bbox }
  } else if (el.bounds) {
    elBbox = {
      x: el.bounds.x,
      y: el.bounds.y,
      width: el.bounds.w,
      height: el.bounds.h,
    }
  } else if (el.position && el.dimensions) {
    elBbox = {
      x: el.position.x,
      y: el.position.y,
      width: el.dimensions.w,
      height: el.dimensions.h,
    }
  } else {
    // No spatial data — return a default influence zone
    return {
      bbox: { x: 0, y: 0, width: 1024, height: 768 },
      affected_elements: [el.element_id ?? el.id ?? 'unknown'],
      needs_lighting_update: true,
      needs_harmonization: true,
    }
  }

  // Expand bbox by a buffer (shadow reach + reflection zone)
  // Buffer is 30% of the element's largest dimension
  const maxDim = Math.max(elBbox.width, elBbox.height)
  const shadowBuffer = Math.round(maxDim * 0.3)
  const reflectionBuffer = Math.round(maxDim * 0.15)
  const totalBuffer = shadowBuffer + reflectionBuffer

  const expandedBbox = {
    x: Math.max(0, elBbox.x - totalBuffer),
    y: Math.max(0, elBbox.y - totalBuffer),
    width: elBbox.width + totalBuffer * 2,
    height: elBbox.height + totalBuffer * 2,
  }

  // Find other elements that overlap with the expanded bbox
  const affectedElements: string[] = [el.element_id ?? el.id ?? 'unknown']

  if (graph?.layers) {
    const allElements: SceneGraphElement[] = [
      ...graph.layers.layer_0.elements,
      ...graph.layers.layer_1.elements,
      ...graph.layers.layer_2.elements,
    ]

    for (const other of allElements) {
      const otherId = other.element_id ?? other.id ?? ''
      if (otherId === (el.element_id ?? el.id)) continue

      let otherBbox: { x: number; y: number; width: number; height: number } | null = null

      if (other.bbox) {
        otherBbox = other.bbox
      } else if (other.bounds) {
        otherBbox = {
          x: other.bounds.x,
          y: other.bounds.y,
          width: other.bounds.w,
          height: other.bounds.h,
        }
      } else if (other.position && other.dimensions) {
        otherBbox = {
          x: other.position.x,
          y: other.position.y,
          width: other.dimensions.w,
          height: other.dimensions.h,
        }
      }

      if (!otherBbox) continue

      // Check AABB overlap
      const overlaps =
        expandedBbox.x < otherBbox.x + otherBbox.width &&
        expandedBbox.x + expandedBbox.width > otherBbox.x &&
        expandedBbox.y < otherBbox.y + otherBbox.height &&
        expandedBbox.y + expandedBbox.height > otherBbox.y

      if (overlaps) {
        affectedElements.push(otherId)
      }
    }
  }

  // Determine whether lighting/harmonization updates are needed
  // Lighting: needed if the element change affects shadows (any spatial or material change)
  // Harmonization: needed if more than one element is affected or the edit is visual
  const needsLighting = affectedElements.length > 1 || maxDim > 100
  const needsHarmonization = affectedElements.length > 1

  return {
    bbox: expandedBbox,
    affected_elements: affectedElements,
    needs_lighting_update: needsLighting,
    needs_harmonization: needsHarmonization,
  }
}

// ---------------------------------------------------------------------------
// 4. buildUndoChain
// ---------------------------------------------------------------------------

/**
 * Build undo/redo state from the edit history. Determines whether undo and redo
 * are available, and which scene graph versions to target for each operation.
 *
 * The chain tracks completed edits and rolled-back edits. An undo reverts to
 * the scene graph version before the last completed edit. A redo re-applies the
 * last rolled-back edit.
 *
 * @param history - Array of edit history entries, ordered by created_at ascending
 * @returns UndoRedoState with availability flags and target versions
 */
export function buildUndoChain(history: EditHistoryEntry[]): UndoRedoState {
  if (!history || history.length === 0) {
    return {
      can_undo: false,
      can_redo: false,
      undo_version: null,
      redo_version: null,
      history_length: 0,
    }
  }

  // Sort by created_at ascending to ensure correct ordering
  const sorted = [...history].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  // Find the last completed edit (candidate for undo)
  const completedEdits = sorted.filter((e) => e.status === 'completed')
  const rolledBackEdits = sorted.filter((e) => e.status === 'rolled_back')

  // Undo: revert to scene_graph_version_before of the last completed edit
  let canUndo = false
  let undoVersion: number | null = null

  if (completedEdits.length > 0) {
    const lastCompleted = completedEdits[completedEdits.length - 1]
    if (lastCompleted.scene_graph_version_before != null) {
      canUndo = true
      undoVersion = lastCompleted.scene_graph_version_before
    }
  }

  // Redo: go to scene_graph_version_after of the last rolled-back edit
  // (only if the rolled-back edit is the most recent action)
  let canRedo = false
  let redoVersion: number | null = null

  if (rolledBackEdits.length > 0) {
    const lastRolledBack = rolledBackEdits[rolledBackEdits.length - 1]
    // Check if the rolled-back edit is more recent than the last completed edit
    const lastCompletedTime = completedEdits.length > 0
      ? new Date(completedEdits[completedEdits.length - 1].created_at).getTime()
      : 0
    const lastRolledBackTime = new Date(lastRolledBack.created_at).getTime()

    if (lastRolledBackTime >= lastCompletedTime && lastRolledBack.scene_graph_version_after != null) {
      canRedo = true
      redoVersion = lastRolledBack.scene_graph_version_after
    }
  }

  return {
    can_undo: canUndo,
    can_redo: canRedo,
    undo_version: undoVersion,
    redo_version: redoVersion,
    history_length: sorted.length,
  }
}

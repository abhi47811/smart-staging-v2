// Cross-Room Visibility Consistency System (M15)
// Helper functions for building visibility graphs, topological sorting,
// cycle detection, resync propagation, and zone boundary calculation.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VisibilityGraph {
  nodes: Array<{ room_id: string; wave: number; has_inbound: boolean }>
  edges: Array<{
    source: string
    target: string
    zone_type: string
    visibility_pct: number
    lock_method: string
  }>
  waves: GenerationWave[]
  has_cycles: boolean
}

export interface GenerationWave {
  wave_number: number
  room_ids: string[]
  depends_on: string[] // room_ids from previous waves that must complete first
}

export interface SyncResult {
  project_id: string
  rooms_synced: number
  rooms_failed: number
  sync_details: Array<{
    source_room_id: string
    target_room_id: string
    lock_method: string
    duration_ms: number
    success: boolean
  }>
}

export interface ZoneBoundary {
  mask_bbox: { x: number; y: number; width: number; height: number }
  feather_px: number
  depth_blur_factor: number
  lighting_adjustment_needed: boolean
}

export interface VisibilityLink {
  id: string
  source_room_id: string
  target_room_id: string
  zone_type: string
  visibility_pct: number
  mask_path: string | null
  lock_method: string
  needs_resync: boolean
  last_synced_at: string | null
}

export interface RoomNode {
  id: string
  project_id: string
  name: string
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

/**
 * Build a directed visibility graph from rooms and their visibility links.
 * Each edge represents a line-of-sight from source_room into target_room
 * (i.e., when standing in source_room, you can see into target_room).
 */
export function buildVisibilityGraph(
  rooms: RoomNode[],
  visibilityLinks: VisibilityLink[]
): VisibilityGraph {
  const roomIds = new Set(rooms.map((r) => r.id))

  // Filter links to only include rooms in this set
  const validEdges = visibilityLinks.filter(
    (l) => roomIds.has(l.source_room_id) && roomIds.has(l.target_room_id)
  )

  const edges = validEdges.map((l) => ({
    source: l.source_room_id,
    target: l.target_room_id,
    zone_type: l.zone_type,
    visibility_pct: l.visibility_pct,
    lock_method: l.lock_method,
  }))

  // Detect cycles before sorting
  const cycles = detectCircularVisibility({ nodes: [], edges, waves: [], has_cycles: false })
  const hasCycles = cycles.length > 0

  // Build adjacency for topological sort
  const waves = topologicalSort({ nodes: [], edges, waves: [], has_cycles: hasCycles })

  // Track which rooms have inbound edges (another room can see into them)
  const inboundSet = new Set(edges.map((e) => e.target))

  // Assign wave numbers to rooms
  const waveMap = new Map<string, number>()
  for (const wave of waves) {
    for (const rid of wave.room_ids) {
      waveMap.set(rid, wave.wave_number)
    }
  }

  // Include rooms that have no edges at all in wave 1
  const nodes = rooms.map((r) => ({
    room_id: r.id,
    wave: waveMap.get(r.id) ?? 1,
    has_inbound: inboundSet.has(r.id),
  }))

  return { nodes, edges, waves, has_cycles: hasCycles }
}

// ---------------------------------------------------------------------------
// Topological sort into generation waves
// ---------------------------------------------------------------------------

/**
 * Sort rooms into generation waves using Kahn's algorithm.
 * Wave 1 = rooms with no inbound visibility edges (no other room sees them).
 * Wave 2 = rooms whose only dependencies are in Wave 1, etc.
 *
 * Circular visibility is broken by removing the edge with the lowest
 * visibility_pct in each cycle.
 */
export function topologicalSort(graph: VisibilityGraph): GenerationWave[] {
  // Collect all room IDs from edges
  const allRoomIds = new Set<string>()
  for (const e of graph.edges) {
    allRoomIds.add(e.source)
    allRoomIds.add(e.target)
  }
  // Also include nodes if present
  for (const n of graph.nodes) {
    allRoomIds.add(n.room_id)
  }

  if (allRoomIds.size === 0) return []

  // Build a mutable copy of edges so we can remove cycle-breakers
  const activeEdges = graph.edges.map((e) => ({ ...e }))

  // Break cycles by removing lowest-visibility edges
  let cycles = findCyclesInEdges(activeEdges, allRoomIds)
  while (cycles.length > 0) {
    for (const cycle of cycles) {
      // Find the edge in this cycle with the lowest visibility_pct
      let minEdgeIdx = -1
      let minPct = Infinity

      for (let i = 0; i < activeEdges.length; i++) {
        const e = activeEdges[i]
        const inCycle =
          cycle.includes(e.source) &&
          cycle.includes(e.target) &&
          cycle.indexOf(e.target) === (cycle.indexOf(e.source) + 1) % cycle.length

        if (inCycle && e.visibility_pct < minPct) {
          minPct = e.visibility_pct
          minEdgeIdx = i
        }
      }

      if (minEdgeIdx >= 0) {
        activeEdges.splice(minEdgeIdx, 1)
      }
    }
    cycles = findCyclesInEdges(activeEdges, allRoomIds)
  }

  // Kahn's algorithm
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const rid of allRoomIds) {
    inDegree.set(rid, 0)
    adjacency.set(rid, [])
  }

  for (const e of activeEdges) {
    // source sees target — target must be generated before source
    // (target's content needs to exist so source can reference it)
    inDegree.set(e.source, (inDegree.get(e.source) ?? 0) + 1)
    adjacency.get(e.target)!.push(e.source)
  }

  const waves: GenerationWave[] = []
  let currentWave: string[] = []

  // Collect all nodes with in-degree 0
  for (const [rid, deg] of inDegree) {
    if (deg === 0) currentWave.push(rid)
  }

  let waveNumber = 1
  const previousWaveIds: string[] = []

  while (currentWave.length > 0) {
    currentWave.sort() // deterministic ordering

    waves.push({
      wave_number: waveNumber,
      room_ids: [...currentWave],
      depends_on: [...previousWaveIds],
    })

    const nextWave: string[] = []
    for (const rid of currentWave) {
      previousWaveIds.push(rid)
      for (const neighbor of adjacency.get(rid) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, newDeg)
        if (newDeg === 0) nextWave.push(neighbor)
      }
    }

    currentWave = nextWave
    waveNumber++
  }

  return waves
}

// ---------------------------------------------------------------------------
// Cycle detection
// ---------------------------------------------------------------------------

/**
 * Find all cycles in the visibility graph. Returns arrays of room IDs
 * forming each cycle.
 */
export function detectCircularVisibility(graph: VisibilityGraph): string[][] {
  return findCyclesInEdges(graph.edges, new Set(graph.edges.flatMap((e) => [e.source, e.target])))
}

/**
 * Internal: find cycles using DFS with coloring.
 * Returns distinct cycles (each as an array of room IDs).
 */
function findCyclesInEdges(
  edges: Array<{ source: string; target: string }>,
  allNodes: Set<string>
): string[][] {
  // Build adjacency: source -> targets (source can see into target,
  // meaning target must be rendered first, so edge direction for cycle
  // detection is target -> source in dependency graph, but for visibility
  // graph cycles we track source -> target)
  const adj = new Map<string, string[]>()
  for (const n of allNodes) adj.set(n, [])
  for (const e of edges) {
    adj.get(e.source)!.push(e.target)
  }

  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  const parent = new Map<string, string | null>()
  const cycles: string[][] = []

  for (const n of allNodes) color.set(n, WHITE)

  function dfs(u: string): void {
    color.set(u, GRAY)
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === GRAY) {
        // Found a back edge — extract cycle
        const cycle: string[] = [v]
        let curr = u
        while (curr !== v) {
          cycle.push(curr)
          curr = parent.get(curr) ?? v
        }
        cycle.reverse()
        cycles.push(cycle)
      } else if (color.get(v) === WHITE) {
        parent.set(v, u)
        dfs(v)
      }
    }
    color.set(u, BLACK)
  }

  for (const n of allNodes) {
    if (color.get(n) === WHITE) {
      parent.set(n, null)
      dfs(n)
    }
  }

  return cycles
}

// ---------------------------------------------------------------------------
// Resync propagation
// ---------------------------------------------------------------------------

/**
 * Given an edited room, return all rooms that need resync via transitive
 * closure. If room A was edited, any room that can see room A (directly or
 * through a chain of visibility) needs its secondary zones updated.
 */
export function calculateResyncNeeded(
  editedRoomId: string,
  graph: VisibilityGraph
): string[] {
  // Build reverse adjacency: target -> sources that can see it
  const reverseAdj = new Map<string, string[]>()
  for (const n of graph.nodes) {
    reverseAdj.set(n.room_id, [])
  }
  for (const e of graph.edges) {
    if (!reverseAdj.has(e.target)) reverseAdj.set(e.target, [])
    reverseAdj.get(e.target)!.push(e.source)
  }

  // BFS from editedRoomId through reverse edges
  const visited = new Set<string>()
  const queue: string[] = [editedRoomId]
  visited.add(editedRoomId)

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const neighbor of reverseAdj.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }

  // Remove the edited room itself — it doesn't need resync, others do
  visited.delete(editedRoomId)
  return Array.from(visited)
}

// ---------------------------------------------------------------------------
// Zone boundary calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the blending zone boundary between primary room content and
 * secondary content visible through an opening.
 *
 * In production this would analyze the mask to find the opening region and
 * compute depth-aware blur. For now it returns a computed boundary based on
 * available mask metadata.
 */
export function determineZoneBoundary(
  _sourceRender: string,
  _targetRender: string,
  maskPath: string | null
): ZoneBoundary {
  // Production implementation would:
  // 1. Load the mask image from maskPath
  // 2. Find the bounding box of the opening region
  // 3. Calculate depth blur factor from the depth map at the opening
  // 4. Determine if lighting differs between source and target rooms
  //
  // For now, return sensible defaults that will be refined by the actual
  // mask analysis in the sync pipeline.

  void _sourceRender
  void _targetRender
  void maskPath

  return {
    mask_bbox: { x: 0, y: 0, width: 256, height: 512 },
    feather_px: 50,
    depth_blur_factor: 0.15,
    lighting_adjustment_needed: true,
  }
}

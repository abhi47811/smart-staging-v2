// M19 — Batch Generation API
// Queue multiple rooms for generation in a single request.
// Enforces budget checks, concurrency caps, and room locking.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPipelineRun } from '@/lib/pipeline'
import {
  checkBudget,
  acquireRoomLock,
  releaseRoomLock,
  logTelemetry,
} from '@/lib/cache'

export const maxDuration = 300

const MAX_BATCH_SIZE = 10
const COST_PER_ROOM_USD = 0.15

// ---------------------------------------------------------------------------
// POST — queue a batch of rooms for generation
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()

    // Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json() as {
      room_ids: string[]
      options?: {
        skip_stages?: string[]
        priority?: 'high' | 'normal' | 'low'
        style_override?: Record<string, unknown>
      }
    }

    const { room_ids, options = {} } = body

    if (!Array.isArray(room_ids) || room_ids.length === 0) {
      return NextResponse.json({ error: 'room_ids must be a non-empty array' }, { status: 400 })
    }

    if (room_ids.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size cannot exceed ${MAX_BATCH_SIZE} rooms. Got ${room_ids.length}.` },
        { status: 400 }
      )
    }

    // Resolve org_id via the first room's project (core.projects owns the org_id FK).
    // organization_members table is not yet provisioned — derive from project ownership instead.
    const { data: firstRoom } = await supabase
      .schema('core')
      .from('rooms')
      .select('project_id, projects!inner(org_id)')
      .eq('id', room_ids[0])
      .single()

    const orgId =
      (firstRoom?.projects as { org_id: string } | null)?.org_id ?? user.id

    // Budget check
    const estimatedCost = room_ids.length * COST_PER_ROOM_USD
    const budget = await checkBudget(supabase, orgId, estimatedCost)

    if (!budget.allowed) {
      return NextResponse.json(
        { error: 'Budget exceeded', reason: budget.reason, remaining_usd: budget.remaining_usd },
        { status: 402 }
      )
    }

    // Acquire room locks — skip rooms that are already locked
    const queuedRooms: string[] = []
    const skippedRooms: string[] = []

    await Promise.all(
      room_ids.map(async (roomId) => {
        const locked = await acquireRoomLock(supabase, roomId, user.id, 'exclusive')
        if (locked) {
          queuedRooms.push(roomId)
        } else {
          skippedRooms.push(roomId)
        }
      })
    )

    if (queuedRooms.length === 0) {
      return NextResponse.json(
        {
          error: 'All rooms are currently locked by another process',
          skipped: skippedRooms,
        },
        { status: 409 }
      )
    }

    // Create pipeline runs
    const runMap: Record<string, string> = {}
    await Promise.all(
      queuedRooms.map(async (roomId) => {
        try {
          const runId = await createPipelineRun(supabase, roomId)
          runMap[roomId] = runId
        } catch (err) {
          console.error(`[batch] Failed to create run for room ${roomId}:`, err)
          // Release lock on failure
          await releaseRoomLock(supabase, roomId, user.id)
          skippedRooms.push(roomId)
        }
      })
    )

    // Log batch start telemetry
    const batchId = crypto.randomUUID()
    for (const [roomId, runId] of Object.entries(runMap)) {
      logTelemetry(supabase, {
        run_id: runId,
        stage_name: 'batch_init',
        event_type: 'start',
        metadata: {
          batch_id: batchId,
          room_id: roomId,
          org_id: orgId,
          priority: options.priority ?? 'normal',
          total_in_batch: Object.keys(runMap).length,
        },
      })
    }

    // Fire-and-forget generation for each queued room
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    await Promise.allSettled(
      Object.entries(runMap).map(([roomId, runId]) =>
        fetch(`${appUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: roomId,
            run_id: runId,
            batch_id: batchId,
            ...options,
          }),
        }).catch(() => {
          // Release lock on fire failure — generation route will re-acquire if needed
          releaseRoomLock(supabase, roomId, user.id).catch(() => {})
        })
      )
    )

    return NextResponse.json({
      batch_id: batchId,
      queued: Object.entries(runMap).map(([room_id, run_id]) => ({ room_id, run_id })),
      skipped: skippedRooms,
      total_queued: Object.keys(runMap).length,
      total_skipped: skippedRooms.length,
      estimated_cost_usd: Object.keys(runMap).length * COST_PER_ROOM_USD,
      budget_warning: budget.warning,
      budget_remaining_usd: budget.remaining_usd,
    })
  } catch (err) {
    console.error('[batch] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// GET — list batch runs for the org
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 100)
    const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0')
    const batchId = req.nextUrl.searchParams.get('batch_id')

    let query = supabase
      .schema('generation')
      .from('pipeline_telemetry')
      .select('run_id, metadata, created_at', { count: 'exact' })
      .eq('stage_name', 'batch_init')
      .eq('event_type', 'start')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (batchId) {
      query = query.contains('metadata', { batch_id: batchId })
    }

    const { data, count, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Group telemetry rows by batch_id
    const batches = new Map<string, { batch_id: string; rooms: string[]; created_at: string }>()
    for (const row of data ?? []) {
      const meta = row.metadata as Record<string, unknown>
      const bid = (meta?.batch_id as string) ?? 'unknown'
      if (!batches.has(bid)) {
        batches.set(bid, { batch_id: bid, rooms: [], created_at: row.created_at as string })
      }
      batches.get(bid)!.rooms.push(row.run_id as string)
    }

    return NextResponse.json({
      batches: Array.from(batches.values()),
      total: count ?? 0,
      limit,
      offset,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

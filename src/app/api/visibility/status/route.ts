// Cross-Room Visibility Status — Next.js API Route (M15) — v1.0
// Returns current visibility link state for a project, with room labels enriched.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateUUID, SanitizeError, sanitizeErrorResponse } from '@/lib/sanitize'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const project_id = validateUUID(searchParams.get('project_id') ?? '', 'project_id')

    const supabase = await createClient()

    // 1. Fetch all non-deleted rooms for this project (id + name for label enrichment)
    const { data: rooms, error: roomsErr } = await supabase
      .schema('core')
      .from('rooms')
      .select('id, name')
      .eq('project_id', project_id)
      .is('deleted_at', null)

    if (roomsErr) throw new Error(`Failed to fetch rooms: ${roomsErr.message}`)

    const roomList = rooms ?? []
    const roomIds = roomList.map((r: { id: string; name: string }) => r.id)

    // Build a lookup map: roomId -> room name (label)
    const roomMap: Record<string, string> = {}
    roomList.forEach((r: { id: string; name: string }) => {
      roomMap[r.id] = r.name
    })

    if (roomIds.length === 0) {
      return NextResponse.json({ links: [], total_links: 0, needs_resync: 0 })
    }

    // 2. Fetch all visibility links whose source room belongs to this project
    const { data: rawLinks, error: linksErr } = await supabase
      .schema('scene')
      .from('visibility_links')
      .select('*')
      .in('source_room_id', roomIds)

    if (linksErr) throw new Error(`Failed to fetch visibility links: ${linksErr.message}`)

    const links = rawLinks ?? []

    // 3. Enrich each link with human-readable room labels
    type RawLink = {
      id: string
      source_room_id: string
      target_room_id: string
      visibility_type: string
      strength: number
      needs_resync: boolean
      last_synced_at: string | null
    }

    const enrichedLinks = links.map((link: RawLink) => ({
      id: link.id,
      source_room_id: link.source_room_id,
      source_room_label: roomMap[link.source_room_id] ?? link.source_room_id,
      target_room_id: link.target_room_id,
      target_room_label: roomMap[link.target_room_id] ?? link.target_room_id,
      visibility_type: link.visibility_type,
      strength: link.strength,
      needs_resync: link.needs_resync,
      last_synced_at: link.last_synced_at,
    }))

    return NextResponse.json({
      links: enrichedLinks,
      total_links: enrichedLinks.length,
      needs_resync: enrichedLinks.filter((l: { needs_resync: boolean }) => l.needs_resync).length,
    })
  } catch (err) {
    if (err instanceof SanitizeError) {
      return NextResponse.json(sanitizeErrorResponse(err), { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch visibility status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

'use client'

/**
 * CrossRoomVisibilityPanel — M15 cross-room visibility sync.
 *
 * Shows which rooms in the project share visible zones (e.g. a living room
 * window that looks into a dining area). When a room is re-staged, its linked
 * rooms need a re-sync so the shared view stays consistent.
 *
 * Reads visibility_links from the server via GET /api/visibility/status.
 * Triggers a sync via POST /api/visibility/sync.
 *
 * Only visible when the project has at least one visibility link.
 * Consistent with the "invisible until populated" pattern used across the app.
 */

import { useState, useEffect, useCallback } from 'react'

interface VisibilityLink {
  id: string
  source_room_id: string
  source_room_label: string
  target_room_id: string
  target_room_label: string
  visibility_type: string
  strength: number
  needs_resync: boolean
  last_synced_at: string | null
}

interface CrossRoomVisibilityPanelProps {
  projectId: string
  currentRoomId: string
}

type SyncState = 'idle' | 'syncing' | 'done' | 'error'

export function CrossRoomVisibilityPanel({
  projectId,
  currentRoomId,
}: CrossRoomVisibilityPanelProps) {
  const [links, setLinks]   = useState<VisibilityLink[]>([])
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncedCount, setSyncedCount] = useState<number | null>(null)

  // ── Fetch visibility links for this room ─────────────────────────────────
  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/visibility/status?project_id=${encodeURIComponent(projectId)}&room_id=${encodeURIComponent(currentRoomId)}`
      )
      const json = await res.json()
      if (res.ok && json.success) {
        setLinks(json.data?.links ?? [])
      }
    } catch {
      // Fail silently — panel stays hidden
    } finally {
      setLoading(false)
    }
  }, [projectId, currentRoomId])

  useEffect(() => { fetchLinks() }, [fetchLinks])

  // ── Trigger visibility sync ───────────────────────────────────────────────
  async function handleSync() {
    setSyncState('syncing')
    setSyncError(null)
    setSyncedCount(null)
    try {
      const res = await fetch('/api/visibility/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Sync failed')
      }
      setSyncedCount(json.data?.rooms_synced ?? 0)
      setSyncState('done')
      // Refresh links to clear needs_resync flags
      await fetchLinks()
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed. Please try again.')
      setSyncState('error')
    }
  }

  // Hide while loading or when no links exist
  if (loading || links.length === 0) return null

  const pendingLinks = links.filter((l) => l.needs_resync)
  const hasPending   = pendingLinks.length > 0

  return (
    <section className="mt-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Cross-Room Visibility</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {links.length} linked room{links.length !== 1 ? 's' : ''} share visible zones with this room
          </p>
        </div>
        {hasPending && (
          <button
            onClick={handleSync}
            disabled={syncState === 'syncing'}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncState === 'syncing' ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Syncing…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M1 4v6h6M23 20v-6h-6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sync {pendingLinks.length} room{pendingLinks.length !== 1 ? 's' : ''}
              </>
            )}
          </button>
        )}
      </div>

      {/* Sync feedback */}
      {syncState === 'done' && syncedCount !== null && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {syncedCount} room{syncedCount !== 1 ? 's' : ''} successfully synced
        </div>
      )}
      {syncState === 'error' && syncError && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
          {syncError}
        </div>
      )}

      {/* Links list */}
      <div className="space-y-2">
        {links.map((link) => (
          <div
            key={link.id}
            className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200"
          >
            {/* Direction arrow */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-900 truncate">
                {link.source_room_label}
              </span>
              <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-sm font-medium text-gray-900 truncate">
                {link.target_room_label}
              </span>
            </div>

            {/* Type + strength */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-gray-500 capitalize">
                {link.visibility_type.replace(/_/g, ' ')}
              </span>
              <div className="flex gap-0.5">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-4 rounded-sm ${
                      i <= Math.round(link.strength * 3) ? 'bg-blue-500' : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Sync status badge */}
            {link.needs_resync ? (
              <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                Needs sync
              </span>
            ) : (
              <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                In sync
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Explanation */}
      {!hasPending && (
        <p className="text-xs text-gray-400 mt-3 text-center">
          All linked rooms are up to date with the latest staging
        </p>
      )}
    </section>
  )
}

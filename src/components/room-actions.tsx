'use client'

/**
 * RoomActions — client component for the room detail page.
 * Handles Analyze Scene (POST /api/analyze) and Generate Staging (POST /api/generate).
 * Lives in a 'use client' island so onClick handlers work inside a server component page.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface RoomActionsProps {
  roomId: string
  roomStatus: string
  hasUploads: boolean
}

export function RoomActions({ roomId, roomStatus, hasUploads }: RoomActionsProps) {
  const router = useRouter()
  const [analyzing, setAnalyzing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)

  async function handleAnalyze() {
    setError(null)
    setAnalyzing(true)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Analysis failed (${res.status})`)
      // Refresh server component data (re-runs page data fetch)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleGenerate() {
    setError(null)
    setGenerating(true)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Generation failed (${res.status})`)
      setRunId(data.run_id ?? null)
      // Refresh to pick up updated room status + results
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const isProcessing = analyzing || generating
  const canAnalyze = hasUploads && !isProcessing
  const canGenerate =
    (roomStatus === 'analyzed' || roomStatus === 'brief_generated') && !isProcessing

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>

      <div className="flex gap-4 flex-wrap">
        {/* Analyze Scene */}
        <button
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {analyzing ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analyzing…
            </>
          ) : (
            'Analyze Scene'
          )}
        </button>

        {/* Generate Staging */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {generating ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating…
            </>
          ) : (
            'Generate Staging'
          )}
        </button>
      </div>

      {/* Help text */}
      {!hasUploads && (
        <p className="mt-3 text-xs text-gray-400">Upload a room image to enable analysis.</p>
      )}
      {hasUploads &&
        roomStatus !== 'analyzed' &&
        roomStatus !== 'brief_generated' &&
        roomStatus !== 'generated' &&
        roomStatus !== 'staged' &&
        !analyzing && (
          <p className="mt-3 text-xs text-gray-400">Run Analyze Scene first to enable generation.</p>
        )}

      {/* Error feedback */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Run ID confirmation */}
      {runId && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          Generation queued — run ID: <code className="font-mono text-xs">{runId}</code>
        </div>
      )}
    </section>
  )
}

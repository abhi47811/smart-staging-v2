'use client'

/**
 * BatchJobMonitor — M19 B2B batch processing progress tracker.
 *
 * Polls GET /api/batch?job_id=<id> every 8 seconds while the job is active.
 * Shows an overall progress bar, per-item status counts, and a completion
 * summary when the job reaches a terminal state.
 *
 * Polling auto-stops when the job reaches: complete | failed | cancelled.
 * The component is invisible until rendered with a valid batchJobId prop —
 * consistent with the "invisible until populated" pattern used across the app.
 */

import { useEffect, useState, useCallback, useRef } from 'react'

type BatchStatus =
  | 'pending'
  | 'processing'
  | 'partial_complete'
  | 'complete'
  | 'failed'
  | 'cancelled'

interface BatchJob {
  id: string
  status: BatchStatus
  total_rooms: number
  completed_rooms: number
  failed_rooms: number
  priority: 'high' | 'normal' | 'low'
  created_at: string
  completed_at: string | null
}

interface BatchJobMonitorProps {
  /** If null/undefined, the component renders nothing */
  batchJobId: string | null | undefined
  onComplete?: (job: BatchJob) => void
}

const TERMINAL_STATES: BatchStatus[] = ['complete', 'failed', 'cancelled']
const POLL_INTERVAL_MS = 8000

const STATUS_CONFIG: Record<BatchStatus, { label: string; color: string; dot: string }> = {
  pending:          { label: 'Queued',           color: 'text-gray-600',   dot: 'bg-gray-400' },
  processing:       { label: 'Processing',        color: 'text-blue-700',  dot: 'bg-blue-500 animate-pulse' },
  partial_complete: { label: 'Partial Complete',  color: 'text-yellow-700', dot: 'bg-yellow-500' },
  complete:         { label: 'Complete',          color: 'text-green-700', dot: 'bg-green-500' },
  failed:           { label: 'Failed',            color: 'text-red-700',   dot: 'bg-red-500' },
  cancelled:        { label: 'Cancelled',         color: 'text-gray-500',  dot: 'bg-gray-400' },
}

export function BatchJobMonitor({ batchJobId, onComplete }: BatchJobMonitorProps) {
  const [job, setJob] = useState<BatchJob | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const fetchJob = useCallback(async () => {
    if (!batchJobId) return
    try {
      const res = await fetch(`/api/batch?job_id=${encodeURIComponent(batchJobId)}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        setFetchError(json.error ?? 'Failed to load batch status')
        return
      }
      const updatedJob: BatchJob = json.data
      setJob(updatedJob)
      setFetchError(null)

      // Stop polling once terminal
      if (TERMINAL_STATES.includes(updatedJob.status)) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        if (updatedJob.status === 'complete') {
          onCompleteRef.current?.(updatedJob)
        }
      }
    } catch {
      setFetchError('Network error — retrying…')
    }
  }, [batchJobId])

  // Mount: initial fetch + start polling
  useEffect(() => {
    if (!batchJobId) return
    setLoading(true)
    fetchJob().finally(() => setLoading(false))

    intervalRef.current = setInterval(fetchJob, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [batchJobId, fetchJob])

  // Invisible until we have a job ID
  if (!batchJobId) return null

  if (loading && !job) {
    return (
      <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
        <div className="h-2 bg-gray-100 rounded mb-2" />
        <div className="h-2 bg-gray-100 rounded w-3/4" />
      </div>
    )
  }

  if (fetchError && !job) {
    return (
      <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
        {fetchError}
      </div>
    )
  }

  if (!job) return null

  const { label, color, dot } = STATUS_CONFIG[job.status]
  const progressPct = job.total_rooms > 0
    ? Math.round(((job.completed_rooms + job.failed_rooms) / job.total_rooms) * 100)
    : 0
  const successPct = job.total_rooms > 0
    ? Math.round((job.completed_rooms / job.total_rooms) * 100)
    : 0
  const pendingRooms = Math.max(
    0,
    job.total_rooms - job.completed_rooms - job.failed_rooms
  )
  const isTerminal = TERMINAL_STATES.includes(job.status)

  return (
    <section className="mt-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Batch Job Progress</h3>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{job.id.slice(0, 8)}…</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
            <span className={`text-sm font-medium ${color}`}>{label}</span>
            {!isTerminal && (
              <span className="text-xs text-gray-400">(updating every 8s)</span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex items-end justify-between mb-1.5">
            <span className="text-2xl font-bold text-gray-900">{progressPct}%</span>
            <span className="text-xs text-gray-400">
              {job.completed_rooms + job.failed_rooms} / {job.total_rooms} rooms processed
            </span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            {/* Green bar: completed */}
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-700 float-left"
              style={{ width: `${successPct}%` }}
            />
            {/* Red bar: failed (stacks after green) */}
            {job.failed_rooms > 0 && (
              <div
                className="h-full bg-red-400 rounded-r-full transition-all duration-700 float-left"
                style={{
                  width: `${Math.round((job.failed_rooms / job.total_rooms) * 100)}%`,
                }}
              />
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <StatCell value={job.completed_rooms} label="Completed" color="text-green-700" bg="bg-green-50" />
          <StatCell value={job.failed_rooms}    label="Failed"    color="text-red-700"   bg="bg-red-50" />
          <StatCell value={pendingRooms}         label="Pending"   color="text-gray-700"  bg="bg-gray-50" />
        </div>

        {/* Completion details */}
        {isTerminal && job.completed_at && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
            <span>
              Finished{' '}
              {new Date(job.completed_at).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
            {job.status === 'complete' && (
              <span className="text-green-600 font-medium">✓ All rooms staged</span>
            )}
            {job.status === 'failed' && (
              <span className="text-red-600 font-medium">Check individual rooms for errors</span>
            )}
          </div>
        )}

        {/* Live indicator */}
        {!isTerminal && (
          <div className="mt-4 flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Live — auto-refreshing
          </div>
        )}
      </div>
    </section>
  )
}

function StatCell({
  value, label, color, bg,
}: {
  value: number
  label: string
  color: string
  bg: string
}) {
  return (
    <div className={`rounded-xl py-3 ${bg}`}>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

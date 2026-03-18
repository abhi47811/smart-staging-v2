'use client'

/**
 * SuggestionApplyButton — minimal 'use client' island.
 *
 * Sits inside the server-rendered AISuggestions component.
 * Calls POST /api/edit/submit with the suggestion's parameter_changes,
 * then triggers router.refresh() so StagingResults repopulates with the
 * new edit result and the suggestion card flips to 'Applied' state.
 *
 * Kept deliberately small — all data fetching and layout lives in the
 * parent server component (ai-suggestions.tsx).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface SuggestionApplyButtonProps {
  suggestionId: string
  roomId: string
  runId: string
  parameterChanges: Record<string, unknown>
  originalPrompt?: string
}

export function SuggestionApplyButton({
  suggestionId,
  roomId,
  runId,
  parameterChanges,
  originalPrompt,
}: SuggestionApplyButtonProps) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleApply() {
    setStatus('loading')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/edit/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          suggestion_id: suggestionId,
          parameter_changes: parameterChanges,
          run_id: runId,
          original_prompt: originalPrompt,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Apply failed (${res.status})`)

      setStatus('done')
      // Re-render server components: StagingResults picks up new edit result,
      // AISuggestions shows 'Applied' badge (status now 'applied' in DB)
      router.refresh()
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Apply failed')
    }
  }

  if (status === 'done') {
    return (
      <span className="text-xs font-medium text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
        ✓ Applied
      </span>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-500">{errorMsg ?? 'Failed'}</span>
        <button
          onClick={() => { setStatus('idle'); setErrorMsg(null) }}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handleApply}
      disabled={status === 'loading'}
      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {status === 'loading' ? (
        <>
          <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          Applying…
        </>
      ) : (
        'Apply →'
      )}
    </button>
  )
}

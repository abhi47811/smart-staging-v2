'use client'

/**
 * DesignBriefForm — M06 intent capture UI.
 * Appears after analysis, lets the user describe the style they want before
 * generating. POSTs to /api/design-brief with { room_id, prompt, style_override,
 * budget_tier }. On success, calls router.refresh() so the server re-renders
 * with the new room status 'brief_generated'.
 *
 * Also exposes a "Skip — auto-generate" path that fires the same API
 * with auto_generated=true so generation always has a brief, even if the
 * user doesn't want to type anything.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ---------------------------------------------------------------------------
// Style presets — match the STYLE_PALETTES keys in /api/design-brief
// ---------------------------------------------------------------------------

const STYLE_PRESETS = [
  { key: 'modern_contemporary', label: 'Modern Contemporary' },
  { key: 'scandinavian',        label: 'Scandinavian' },
  { key: 'mid_century_modern',  label: 'Mid-Century Modern' },
  { key: 'minimalist',          label: 'Minimalist' },
  { key: 'luxury',              label: 'Luxury' },
] as const

const BUDGET_TIERS = [
  { key: 'economy',  label: 'Economy' },
  { key: 'mid-range', label: 'Mid-Range' },
  { key: 'premium',  label: 'Premium' },
  { key: 'luxury',   label: 'Luxury' },
] as const

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DesignBriefFormProps {
  roomId: string
  /** Room status passed from server — determines whether to show this form */
  roomStatus: string
  /** If a brief already exists for this room, show it collapsed by default */
  hasBrief: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DesignBriefForm({ roomId, roomStatus, hasBrief }: DesignBriefFormProps) {
  const router = useRouter()

  // Collapsed by default if the room already has a brief
  const [expanded, setExpanded] = useState(!hasBrief)
  const [prompt, setPrompt] = useState('')
  const [styleOverride, setStyleOverride] = useState<string>('')
  const [budgetTier, setBudgetTier] = useState<string>('mid-range')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Only show for rooms that have been analysed (or already have a brief)
  const shouldShow =
    roomStatus === 'analyzed' ||
    roomStatus === 'brief_generated' ||
    roomStatus === 'generating' ||
    roomStatus === 'generated' ||
    roomStatus === 'staged'

  if (!shouldShow) return null

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function submitBrief(auto: boolean) {
    setError(null)
    setLoading(true)
    setSuccess(false)

    try {
      const body: Record<string, unknown> = {
        room_id: roomId,
        budget_tier: budgetTier,
      }

      if (auto) {
        body.auto_generated = true
        if (styleOverride) body.style_override = styleOverride
      } else {
        body.prompt = prompt.trim() || 'Stage this room tastefully.'
        if (styleOverride) body.style_override = styleOverride
      }

      const res = await fetch('/api/design-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Brief generation failed (${res.status})`)

      setSuccess(true)
      setExpanded(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Design brief failed')
    } finally {
      setLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Collapsed state (brief already exists)
  // ---------------------------------------------------------------------------

  if (!expanded) {
    return (
      <section className="mb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Design Brief</h2>
          <div className="flex items-center gap-3">
            {hasBrief || success ? (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
                Brief ready
              </span>
            ) : null}
            <button
              onClick={() => setExpanded(true)}
              className="text-sm text-indigo-600 hover:underline"
            >
              {hasBrief || success ? 'Edit' : 'Add style prompt'}
            </button>
          </div>
        </div>
        {!(hasBrief || success) && (
          <p className="mt-1 text-xs text-gray-400">
            Optional — describe the style you want, or we&apos;ll auto-generate one.
          </p>
        )}
      </section>
    )
  }

  // ---------------------------------------------------------------------------
  // Expanded form
  // ---------------------------------------------------------------------------

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Design Brief</h2>
        {(hasBrief || success) && (
          <button
            onClick={() => setExpanded(false)}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Collapse
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

        {/* ── Style prompt ───────────────────────────────────────────── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Style prompt
          </label>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Warm Scandinavian living room with oak floors, white walls, and a hint of sage green. Natural linen sofa, rattan accent chair. Cosy and editorial."
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400"
            disabled={loading}
          />
          <p className="mt-1 text-xs text-gray-400">
            Describe the mood, style, colours, and materials you want.
          </p>
        </div>

        {/* ── Style presets ────────────────────────────────────────────── */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Style preset</p>
          <div className="flex flex-wrap gap-2">
            {STYLE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                onClick={() =>
                  setStyleOverride(styleOverride === preset.key ? '' : preset.key)
                }
                disabled={loading}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  styleOverride === preset.key
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-gray-400">
            Optional — overrides AI style inference with a specific aesthetic.
          </p>
        </div>

        {/* ── Budget tier ──────────────────────────────────────────────── */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Budget tier</p>
          <div className="flex gap-2 flex-wrap">
            {BUDGET_TIERS.map((tier) => (
              <button
                key={tier.key}
                onClick={() => setBudgetTier(tier.key)}
                disabled={loading}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  budgetTier === tier.key
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500 hover:text-gray-800'
                }`}
              >
                {tier.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-gray-400">
            Controls furniture selection — economy to luxury.
          </p>
        </div>

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pt-1">
          {/* Primary: generate brief from prompt */}
          <button
            onClick={() => submitBrief(false)}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating brief…
              </>
            ) : (
              'Generate Design Brief'
            )}
          </button>

          {/* Secondary: auto-generate without typing */}
          {!loading && (
            <button
              onClick={() => submitBrief(true)}
              className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              Skip — auto-generate
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400 -mt-1">
          The brief tells the AI exactly what to create. Skipping uses smart defaults based on your room type.
        </p>
      </div>
    </section>
  )
}

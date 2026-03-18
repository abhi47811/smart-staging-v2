'use client'

/**
 * VariantsPanel — client island for M16 (Variants + Style DNA).
 *
 * Two modes:
 *   1. Generate N variants — same room, N parallel staging passes with
 *      style-varied briefs. Calls POST /api/variants with { room_id, count }.
 *      Each variant runs the full M07–M13 pipeline and stores a
 *      generation.generation_results row with result_type: 'variant'.
 *
 *   2. Extract Style DNA — fingerprint this room's aesthetic into a reusable
 *      profile stored in knowledge.style_dna. Calls POST
 *      /api/variants?action=extract-style with { room_id, name, org_id }.
 *      The resulting DNA can be passed back into future variant generations
 *      as style_dna_id to influence the brief variations.
 *
 * Only renders when roomStatus is 'staged' (full generation completed).
 * Returns null silently otherwise — no empty state visible to user.
 *
 * After variant generation, calls router.refresh() so StagingResults
 * re-renders and shows the new variant result rows.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VariantResult {
  variant_index: number
  run_id: string
  status: 'completed' | 'failed'
  brief_id?: string
  error?: string
}

interface VariantsResponse {
  status: 'completed' | 'partial' | 'failed'
  room_id: string
  count: number
  completed: number
  failed: number
  variants: VariantResult[]
}

interface StyleDNAData {
  color_palette: {
    dominant: string[]
    secondary: string[]
    accent: string[]
    warmth: string
  }
  furniture_language: {
    primary_style: string
    substyle?: string
    density?: string
    era_range?: string
  }
  photography_mood: {
    color_grading: string
    lighting_style: string
    contrast_preference?: string
  }
  spatial_density: number
}

interface StyleDNAResponse {
  status: string
  style_dna: { id: string; name: string; confidence: number }
  dna_data: StyleDNAData
  confidence: number
  source_type: string
}

interface VariantsPanelProps {
  roomId: string
  /** Project ID — used as org_id scope for Style DNA in MVP.
   *  In production, swap for an actual org_id from the auth session. */
  projectId: string
  roomStatus: string
}

const COUNT_OPTIONS = [2, 3, 4] as const

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VariantsPanel({ roomId, projectId, roomStatus }: VariantsPanelProps) {
  const router = useRouter()

  // ── Variant generation state ─────────────────────────────────────────────
  const [count, setCount]         = useState(3)
  const [genStatus, setGenStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [genResult, setGenResult] = useState<VariantsResponse | null>(null)
  const [genError, setGenError]   = useState<string | null>(null)

  // ── Style DNA extraction state ───────────────────────────────────────────
  const [dnaName, setDnaName]     = useState('')
  const [dnaStatus, setDnaStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [dnaResult, setDnaResult] = useState<StyleDNAResponse | null>(null)
  const [dnaError, setDnaError]   = useState<string | null>(null)

  // Only visible once staging is complete — keep all hooks above this line
  if (roomStatus !== 'staged' && roomStatus !== 'generated') return null

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleGenerateVariants() {
    setGenStatus('loading')
    setGenError(null)
    setGenResult(null)

    try {
      const res = await fetch('/api/variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, count }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`)

      setGenResult(data as VariantsResponse)
      setGenStatus('done')
      // Re-render server components — StagingResults will pick up variant rows
      router.refresh()
    } catch (err) {
      setGenStatus('error')
      setGenError(err instanceof Error ? err.message : 'Variant generation failed')
    }
  }

  async function handleExtractDNA() {
    if (!dnaName.trim()) {
      setDnaError('Enter a name for this Style DNA profile')
      return
    }
    setDnaStatus('loading')
    setDnaError(null)
    setDnaResult(null)

    try {
      const res = await fetch('/api/variants?action=extract-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id:    roomId,
          name:       dnaName.trim(),
          org_id:     projectId,   // MVP scope: project → org in future
          project_id: projectId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`)

      setDnaResult(data as StyleDNAResponse)
      setDnaStatus('done')
    } catch (err) {
      setDnaStatus('error')
      setDnaError(err instanceof Error ? err.message : 'Style DNA extraction failed')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="mt-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Variants &amp; Style DNA</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Generate parallel design interpretations, or fingerprint this room's aesthetic
          </p>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
          M16
        </span>
      </div>

      {/* Two-column grid */}
      <div className="grid gap-4 sm:grid-cols-2">

        {/* ── Generate Variants ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-xl leading-none">🎨</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Generate Variants</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Run {count} parallel staging passes with distinct style variations
              </p>
            </div>
          </div>

          {/* Count picker — only when idle */}
          {genStatus === 'idle' && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Number of variants</p>
              <div className="flex gap-2">
                {COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                      count === n
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                        : 'text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Generate button */}
          {genStatus === 'idle' && (
            <button
              onClick={handleGenerateVariants}
              className="w-full py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Generate {count} Variants →
            </button>
          )}

          {/* Loading */}
          {genStatus === 'loading' && (
            <div className="text-center py-4">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-gray-600">Generating {count} variants…</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Each runs the full pipeline · may take 1–3 min
              </p>
            </div>
          )}

          {/* Done */}
          {genStatus === 'done' && genResult && (
            <div>
              <VariantResultGrid variants={genResult.variants} count={genResult.count} />
              <p className="mt-3 text-xs text-gray-400">
                {genResult.completed}/{genResult.count} completed
                {genResult.completed > 0 && ' · Results appear in staging above ↑'}
              </p>
              <button
                onClick={() => { setGenStatus('idle'); setGenResult(null) }}
                className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 underline"
              >
                Generate again
              </button>
            </div>
          )}

          {/* Error */}
          {genStatus === 'error' && (
            <div>
              <p className="text-xs text-red-500 mb-2">{genError ?? 'Generation failed'}</p>
              <button
                onClick={() => { setGenStatus('idle'); setGenError(null) }}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* ── Extract Style DNA ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-xl leading-none">🧬</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Extract Style DNA</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Fingerprint this room's design aesthetic for reuse across projects
              </p>
            </div>
          </div>

          {/* Name input */}
          {dnaStatus !== 'done' && (
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Profile name
              </label>
              <input
                type="text"
                value={dnaName}
                onChange={(e) => { setDnaName(e.target.value); setDnaError(null) }}
                placeholder="e.g. Mumbai Penthouse — Warm Modern"
                disabled={dnaStatus === 'loading'}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 placeholder:text-gray-300"
              />
              {dnaError && (
                <p className="mt-1 text-xs text-red-500">{dnaError}</p>
              )}
            </div>
          )}

          {/* Extract button */}
          {dnaStatus === 'idle' && (
            <button
              onClick={handleExtractDNA}
              disabled={!dnaName.trim()}
              className="w-full py-2 text-sm font-medium rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Extract Style DNA
            </button>
          )}

          {/* Loading */}
          {dnaStatus === 'loading' && (
            <div className="text-center py-4">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-gray-600">Analysing design fingerprint…</p>
            </div>
          )}

          {/* Done — rich DNA card */}
          {dnaStatus === 'done' && dnaResult && (
            <StyleDNAResultCard
              result={dnaResult}
              onReset={() => { setDnaStatus('idle'); setDnaResult(null); setDnaName('') }}
            />
          )}

          {/* Error */}
          {dnaStatus === 'error' && (
            <div>
              <p className="text-xs text-red-500 mb-2">{dnaError ?? 'Extraction failed'}</p>
              <button
                onClick={() => { setDnaStatus('idle'); setDnaError(null) }}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Retry
              </button>
            </div>
          )}
        </div>

      </div>

      <p className="mt-4 text-xs text-gray-400">
        Each variant runs a full independent pipeline pass — staging, fitout, lighting, harmonisation.
        Style DNA profiles can be applied to future rooms to maintain aesthetic consistency.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// VariantResultGrid — N status tiles after generation
// ---------------------------------------------------------------------------

function VariantResultGrid({
  variants,
  count,
}: {
  variants: VariantResult[]
  count: number
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {Array.from({ length: count }, (_, i) => {
        const v         = variants.find((r) => r.variant_index === i)
        const completed = v?.status === 'completed'
        const failed    = v?.status === 'failed'

        return (
          <div
            key={i}
            title={failed ? (v?.error ?? 'Failed') : undefined}
            className={`flex flex-col items-center justify-center py-2.5 rounded-lg text-xs font-medium border ${
              completed
                ? 'bg-green-50 border-green-200 text-green-700'
                : failed
                ? 'bg-red-50 border-red-200 text-red-500'
                : 'bg-gray-50 border-gray-200 text-gray-400'
            }`}
          >
            <span className="text-sm">{completed ? '✓' : failed ? '✗' : '…'}</span>
            <span className="mt-0.5">V{i + 1}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StyleDNAResultCard — rich display of extracted fingerprint
// ---------------------------------------------------------------------------

function StyleDNAResultCard({
  result,
  onReset,
}: {
  result: StyleDNAResponse
  onReset: () => void
}) {
  const { style_dna, dna_data, confidence } = result
  const palette   = dna_data?.color_palette
  const furniture = dna_data?.furniture_language
  const photo     = dna_data?.photography_mood
  const confPct   = Math.round(confidence * 100)

  // Flatten palette colours: dominant first, then secondary, then accent
  const allColours = [
    ...(palette?.dominant  ?? []),
    ...(palette?.secondary ?? []),
    ...(palette?.accent    ?? []),
  ].slice(0, 8)

  return (
    <div>
      {/* Name + saved badge */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <p className="text-sm font-semibold text-gray-900 truncate">{style_dna.name}</p>
        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200 shrink-0">
          Saved
        </span>
      </div>

      {/* Confidence bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-400 transition-all"
            style={{ width: `${confPct}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 shrink-0">{confPct}% confidence</span>
      </div>

      {/* Colour palette swatches */}
      {allColours.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
            Colour palette
          </p>
          <div className="flex items-center gap-1">
            {allColours.map((hex, i) => (
              <div
                key={i}
                title={hex}
                className="w-5 h-5 rounded-sm border border-black/10 shrink-0"
                style={{ backgroundColor: hex }}
              />
            ))}
            {palette?.warmth && (
              <span className="text-xs text-gray-400 ml-1 capitalize">
                · {palette.warmth}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Furniture + Photography data */}
      <div className="grid grid-cols-2 gap-2">
        {furniture && (
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">
              Furniture
            </p>
            <p className="text-xs text-gray-800 font-medium capitalize">
              {furniture.primary_style}
            </p>
            {furniture.substyle && (
              <p className="text-xs text-gray-400 capitalize">{furniture.substyle}</p>
            )}
            {furniture.density && (
              <p className="text-xs text-gray-400 capitalize">{furniture.density} density</p>
            )}
          </div>
        )}
        {photo && (
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">
              Photography
            </p>
            <p className="text-xs text-gray-800 font-medium capitalize">
              {photo.lighting_style}
            </p>
            {photo.color_grading && (
              <p className="text-xs text-gray-400 capitalize">
                {photo.color_grading.replace(/_/g, ' ')}
              </p>
            )}
          </div>
        )}
      </div>

      <button
        onClick={onReset}
        className="mt-3 text-xs text-indigo-500 hover:text-indigo-700 underline"
      >
        Extract another
      </button>
    </div>
  )
}

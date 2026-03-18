/**
 * AISuggestions — server component.
 *
 * Reads quality.render_suggestions for the latest pipeline run on this room.
 * Fires automatically post-generation (see /api/generate fire-and-forget call
 * to /api/suggestions). Data exists in DB but was never surfaced to the user.
 *
 * Each suggestion carries:
 *   - category    (lighting / composition / furniture / material / style / …)
 *   - title       short label
 *   - description full explanation
 *   - impact      'low' | 'medium' | 'high'
 *   - confidence  0–1 float
 *   - parameter_changes  JSON patch ready for the edit engine (Phase 7)
 *
 * Returns null when no suggestions exist (invisible on fresh rooms).
 * Signed URLs / router.refresh() not needed — no images here.
 */

import React from 'react'
import { createClient } from '@/lib/supabase/server'
import { SuggestionApplyButton } from '@/components/suggestion-apply-button'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RenderSuggestion {
  id: string
  run_id: string
  room_id: string
  category: string
  title: string
  description: string
  confidence: number
  impact: 'low' | 'medium' | 'high'
  parameter_changes: Record<string, unknown>
  sort_order: number
  status: string
  created_at: string
}

interface AISuggestionsProps {
  roomId: string
}

// ---------------------------------------------------------------------------
// Category display config
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG: Record<string, { icon: string; label: string }> = {
  lighting:       { icon: '💡', label: 'Lighting' },
  composition:    { icon: '🖼️', label: 'Composition' },
  furniture:      { icon: '🛋️', label: 'Furniture' },
  material:       { icon: '🪵', label: 'Materials' },
  style:          { icon: '✨', label: 'Style' },
  color:          { icon: '🎨', label: 'Colour' },
  plant:          { icon: '🪴', label: 'Plants' },
  scale:          { icon: '📐', label: 'Scale' },
  photorealism:   { icon: '📸', label: 'Photorealism' },
  accessory:      { icon: '🕯️', label: 'Accessories' },
}

// ---------------------------------------------------------------------------
// Impact badge styles
// ---------------------------------------------------------------------------

const IMPACT_STYLES: Record<string, string> = {
  high:   'bg-red-950 text-red-400 border border-red-900',
  medium: 'bg-amber-950 text-amber-400 border border-amber-900',
  low:    'bg-slate-800 text-slate-400 border border-slate-700',
}

const IMPACT_LABELS: Record<string, string> = {
  high:   'High impact',
  medium: 'Medium impact',
  low:    'Low impact',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export async function AISuggestions({ roomId }: AISuggestionsProps) {
  const supabase = await createClient()

  // Fetch suggestions for latest run on this room
  const { data: allSuggestions } = await supabase
    .schema('quality')
    .from('render_suggestions')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(24) // up to 3 runs × 8 suggestions each

  if (!allSuggestions || allSuggestions.length === 0) return null

  // ── Take only the most recent run's suggestions ─────────────────────────
  const suggestions = allSuggestions as RenderSuggestion[]
  const latestRunId = suggestions[0].run_id
  const runSuggestions = suggestions
    .filter((s) => s.run_id === latestRunId)
    .sort((a, b) => a.sort_order - b.sort_order)

  if (runSuggestions.length === 0) return null

  // ── Partition by impact for visual grouping ──────────────────────────────
  const high   = runSuggestions.filter((s) => s.impact === 'high')
  const medium = runSuggestions.filter((s) => s.impact === 'medium')
  const low    = runSuggestions.filter((s) => s.impact === 'low')

  return (
    <section className="mt-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">AI Suggestions</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {runSuggestions.length} improvement{runSuggestions.length !== 1 ? 's' : ''} identified from your staged result
          </p>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">
          Auto-generated
        </span>
      </div>

      {/* Suggestions grid */}
      <div className="space-y-3">
        {[...high, ...medium, ...low].map((suggestion) => {
          const category = CATEGORY_CONFIG[suggestion.category] ?? {
            icon: '🔧',
            label: suggestion.category,
          }
          const confidence = Math.round(suggestion.confidence * 100)
          const impactStyle = IMPACT_STYLES[suggestion.impact] ?? IMPACT_STYLES.low

          return (
            <SuggestionCard
              key={suggestion.id}
              icon={category.icon}
              categoryLabel={category.label}
              title={suggestion.title}
              description={suggestion.description}
              impactStyle={impactStyle}
              impactLabel={IMPACT_LABELS[suggestion.impact] ?? suggestion.impact}
              confidence={confidence}
              status={suggestion.status}
              applyButton={
                suggestion.status === 'pending' ? (
                  <SuggestionApplyButton
                    suggestionId={suggestion.id}
                    roomId={roomId}
                    runId={latestRunId}
                    parameterChanges={suggestion.parameter_changes}
                    originalPrompt={suggestion.title}
                  />
                ) : null
              }
            />
          )
        })}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Applying a suggestion runs a targeted edit on the staged result — only the affected area is regenerated, not the whole room.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// SuggestionCard — extracted to keep the main component readable
// ---------------------------------------------------------------------------

function SuggestionCard({
  icon,
  categoryLabel,
  title,
  description,
  impactStyle,
  impactLabel,
  confidence,
  status,
  applyButton,
}: {
  icon: string
  categoryLabel: string
  title: string
  description: string
  impactStyle: string
  impactLabel: string
  confidence: number
  status: string
  applyButton: React.ReactNode
}) {
  return (
    <div className="flex gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
      {/* Icon */}
      <div className="text-2xl leading-none mt-0.5 select-none">{icon}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
              {categoryLabel}
            </p>
            <p className="text-sm font-semibold text-gray-900">{title}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${impactStyle}`}>
              {impactLabel}
            </span>
          </div>
        </div>

        <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">{description}</p>

        {/* Footer: confidence + status + placeholder Apply */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Confidence bar */}
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-400"
                  style={{ width: `${confidence}%` }}
                />
              </div>
              <span className="text-xs text-gray-400">{confidence}% confidence</span>
            </div>

            {/* Applied badge */}
            {status === 'applied' && (
              <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                Applied
              </span>
            )}
            {status === 'dismissed' && (
              <span className="text-xs text-gray-400">Dismissed</span>
            )}
          </div>

          {/* Live Apply button — SuggestionApplyButton client island */}
          {applyButton}
        </div>
      </div>
    </div>
  )
}

'use client'

/**
 * DirectEditPanel — client island for M14 manual element editing.
 *
 * Gives the user a way to surgically edit any element in the staged room
 * without going through the AI suggestions flow.
 *
 * Flow:
 *   1. User picks an edit action (Material, Color, Style, Add, Remove, Swap)
 *   2. User types the target element ("sofa", "rug", "pendant light")
 *   3. User describes the change ("dark walnut", "navy blue", "remove entirely")
 *   4. Submit → buildParameterChanges() constructs the right parameter_changes
 *      shape that inferAction() in /api/edit/submit will recognise
 *   5. POST /api/edit/submit → inserts edit_history → chains to /api/edit
 *   6. router.refresh() → StagingResults picks up the new edit result
 *
 * Only renders when roomStatus is 'staged'. Silent null otherwise.
 *
 * Architecture note: /api/edit/submit already accepts manual edits —
 * suggestion_id is optional, and source: 'manual' is passed to distinguish
 * these edits from AI-suggestion-triggered ones in the edit_history record.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EditAction = 'material' | 'color' | 'style' | 'add' | 'remove' | 'swap'

interface EditActionConfig {
  key: EditAction
  label: string
  icon: string
  targetLabel: string     // Label for the "what element" input
  valueLabel: string      // Label for the "describe the change" input
  valuePlaceholder: string
  targetPlaceholder: string
  hideValue?: boolean     // Remove action doesn't need a value description
}

interface DirectEditPanelProps {
  roomId: string
  roomStatus: string
}

// ---------------------------------------------------------------------------
// Action config — drives the adaptive form labels/placeholders
// ---------------------------------------------------------------------------

const EDIT_ACTIONS: EditActionConfig[] = [
  {
    key:               'material',
    label:             'Material',
    icon:              '🪵',
    targetLabel:       'Which element',
    targetPlaceholder: 'e.g. sofa, flooring, cushions',
    valueLabel:        'New material',
    valuePlaceholder:  'e.g. dark walnut, brushed brass, marble',
  },
  {
    key:               'color',
    label:             'Colour',
    icon:              '🎨',
    targetLabel:       'Which element',
    targetPlaceholder: 'e.g. sofa, accent wall, rug',
    valueLabel:        'New colour',
    valuePlaceholder:  'e.g. deep emerald, terracotta, off-white',
  },
  {
    key:               'style',
    label:             'Style',
    icon:              '✨',
    targetLabel:       'Which element',
    targetPlaceholder: 'e.g. pendant light, coffee table',
    valueLabel:        'Style direction',
    valuePlaceholder:  'e.g. mid-century modern, industrial, japandi',
  },
  {
    key:               'add',
    label:             'Add',
    icon:              '➕',
    targetLabel:       'What to add',
    targetPlaceholder: 'e.g. floor plant, throw pillow, floor lamp',
    valueLabel:        'Placement & description',
    valuePlaceholder:  'e.g. fiddle-leaf fig in corner near window',
  },
  {
    key:               'remove',
    label:             'Remove',
    icon:              '✂️',
    targetLabel:       'What to remove',
    targetPlaceholder: 'e.g. floor lamp, side table, artwork',
    valueLabel:        '',
    valuePlaceholder:  '',
    hideValue:         true,
  },
  {
    key:               'swap',
    label:             'Swap',
    icon:              '🔄',
    targetLabel:       'Replace what',
    targetPlaceholder: 'e.g. sofa, dining chairs, pendant',
    valueLabel:        'Replace with',
    valuePlaceholder:  'e.g. L-shaped sectional in cream linen',
  },
]

// ---------------------------------------------------------------------------
// Parameter changes builder
// Maps UI inputs → the parameter_changes shape that inferAction() recognises.
// Each shape is documented alongside the inferAction() switch in /api/edit/submit.
// ---------------------------------------------------------------------------

function buildParameterChanges(
  action: EditAction,
  targetElement: string,
  description: string
): Record<string, unknown> {
  const target = targetElement.trim()
  const desc   = description.trim()

  switch (action) {
    case 'material':
      return { new_material: desc, target }

    case 'color':
      return { new_color: desc, target }

    case 'style':
      return { style: desc, target }

    case 'add':
      return {
        add_elements: [{
          type:        target,
          description: desc || target,
          placement:   'auto',
        }],
      }

    case 'remove':
      return { remove_elements: [target] }

    case 'swap':
      return { swap: { from: target, to: desc } }

    default:
      return { style: desc, target }
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DirectEditPanel({ roomId, roomStatus }: DirectEditPanelProps) {
  const router = useRouter()

  const [activeAction, setActiveAction]   = useState<EditAction>('material')
  const [targetElement, setTargetElement] = useState('')
  const [description, setDescription]    = useState('')
  const [status, setStatus]              = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError]                = useState<string | null>(null)
  const [lastAction, setLastAction]      = useState<string | null>(null)

  // Silently invisible until room is staged
  if (roomStatus !== 'staged' && roomStatus !== 'generated') return null

  const actionConfig = EDIT_ACTIONS.find((a) => a.key === activeAction)!

  const canSubmit =
    targetElement.trim().length > 0 &&
    (activeAction === 'remove' || description.trim().length > 0)

  function resetForm() {
    setTargetElement('')
    setDescription('')
    setStatus('idle')
    setError(null)
    setLastAction(null)
  }

  async function handleSubmit() {
    if (!canSubmit) return

    setStatus('loading')
    setError(null)

    const parameterChanges = buildParameterChanges(activeAction, targetElement, description)
    const promptText       = buildPromptText(activeAction, targetElement, description)

    try {
      const res = await fetch('/api/edit/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id:           roomId,
          parameter_changes: parameterChanges,
          target_elements:   activeAction === 'add' ? [] : [targetElement.trim()],
          original_prompt:   promptText,
          source:            'manual',
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Edit failed (${res.status})`)

      setLastAction(promptText)
      setStatus('done')
      // Re-render StagingResults to show the new edit result row
      router.refresh()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Edit failed')
    }
  }

  return (
    <section className="mt-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Manual Edit</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Surgically change any element — only the affected zone is regenerated
          </p>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">
          M14
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">

        {/* ── Action chips ────────────────────────────────────────────────── */}
        <div className="mb-5">
          <p className="text-xs font-medium text-gray-500 mb-2.5">Edit type</p>
          <div className="flex flex-wrap gap-2">
            {EDIT_ACTIONS.map((a) => (
              <button
                key={a.key}
                onClick={() => {
                  setActiveAction(a.key)
                  setTargetElement('')
                  setDescription('')
                  setStatus('idle')
                  setError(null)
                }}
                disabled={status === 'loading'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  activeAction === a.key
                    ? 'bg-violet-50 text-violet-700 border-violet-300'
                    : 'text-gray-500 border-gray-200 hover:border-gray-300 disabled:opacity-50'
                }`}
              >
                <span>{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Form fields ─────────────────────────────────────────────────── */}
        {status !== 'done' && (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Target element */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                {actionConfig.targetLabel}
              </label>
              <input
                type="text"
                value={targetElement}
                onChange={(e) => setTargetElement(e.target.value)}
                placeholder={actionConfig.targetPlaceholder}
                disabled={status === 'loading'}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-50 placeholder:text-gray-300"
              />
            </div>

            {/* Description (hidden for Remove action) */}
            {!actionConfig.hideValue && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  {actionConfig.valueLabel}
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={actionConfig.valuePlaceholder}
                  disabled={status === 'loading'}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-50 placeholder:text-gray-300"
                />
              </div>
            )}
          </div>
        )}

        {/* ── Submit / states ──────────────────────────────────────────────── */}
        <div className="mt-4">
          {status === 'idle' && (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-5 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Apply Edit →
            </button>
          )}

          {status === 'loading' && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-500">Applying edit… regenerating influence zone</span>
            </div>
          )}

          {status === 'done' && lastAction && (
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-4 h-4 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs">✓</span>
                  <span className="text-sm font-medium text-gray-800">Edit applied</span>
                </div>
                <p className="text-xs text-gray-400 italic">"{lastAction}"</p>
                <p className="text-xs text-gray-400 mt-0.5">Updated result appears in staging above ↑</p>
              </div>
              <button
                onClick={resetForm}
                className="shrink-0 text-xs text-violet-500 hover:text-violet-700 underline"
              >
                Edit again
              </button>
            </div>
          )}

          {status === 'error' && (
            <div>
              <p className="text-xs text-red-500 mb-2">{error ?? 'Edit failed'}</p>
              <button
                onClick={() => { setStatus('idle'); setError(null) }}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Contextual hint */}
      {status === 'idle' && (
        <p className="mt-3 text-xs text-gray-400">
          The edit engine regenerates only the influence zone — the target element plus nearby
          affected surfaces — leaving the rest of the scene untouched.
          Each edit creates a new scene graph version for full undo history.
        </p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a human-readable prompt string from the edit inputs for edit_history logging. */
function buildPromptText(action: EditAction, target: string, description: string): string {
  switch (action) {
    case 'material': return `Change ${target} material to ${description}`
    case 'color':    return `Change ${target} colour to ${description}`
    case 'style':    return `Apply ${description} style to ${target}`
    case 'add':      return `Add ${target}: ${description}`
    case 'remove':   return `Remove ${target}`
    case 'swap':     return `Swap ${target} with ${description}`
    default:         return `Edit ${target}: ${description}`
  }
}

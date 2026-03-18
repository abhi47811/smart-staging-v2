'use client'

/**
 * FitoutPanel — M10 Interior Fitout generation controls.
 *
 * Lets users select which fitout elements to generate and configure
 * per-element materials. Element selection maps directly to FITOUT_CATEGORIES
 * in /api/generate/fitout/route.ts.
 *
 * Available categories:
 *   false_ceiling · wall_paneling · wardrobe · tv_media_wall · kitchen_modification
 *   bathroom_fitout · curtain_system · flooring_upgrade · moldings_trim · architectural_lighting
 *
 * Only visible when room.status is 'staged' or 'generated'.
 */

import { useState } from 'react'

interface FitoutPanelProps {
  roomId: string
  roomStatus: string
}

type FitoutCategory =
  | 'false_ceiling'
  | 'wall_paneling'
  | 'wardrobe'
  | 'tv_media_wall'
  | 'kitchen_modification'
  | 'bathroom_fitout'
  | 'curtain_system'
  | 'flooring_upgrade'
  | 'moldings_trim'
  | 'architectural_lighting'

interface CategoryConfig {
  label: string
  emoji: string
  defaultMaterial: string
  materials: string[]
  description: string
}

const FITOUT_CONFIG: Record<FitoutCategory, CategoryConfig> = {
  false_ceiling: {
    label: 'False Ceiling',
    emoji: '⬜',
    defaultMaterial: 'gypsum',
    materials: ['gypsum', 'pvc', 'wood', 'metal', 'acoustic'],
    description: 'Dropped ceiling with integrated lighting tray',
  },
  wall_paneling: {
    label: 'Wall Paneling',
    emoji: '🪵',
    defaultMaterial: 'oak',
    materials: ['oak', 'walnut', 'teak', 'mdf_paint', 'stone', 'fabric'],
    description: 'Decorative wall treatment panels',
  },
  wardrobe: {
    label: 'Wardrobe',
    emoji: '🚪',
    defaultMaterial: 'laminate',
    materials: ['laminate', 'glass', 'mirror', 'wood_veneer', 'lacquer'],
    description: 'Built-in wardrobe with sliding or swing doors',
  },
  tv_media_wall: {
    label: 'TV / Media Wall',
    emoji: '📺',
    defaultMaterial: 'mdf_veneer',
    materials: ['mdf_veneer', 'stone_cladding', 'wood', 'marble', 'concrete'],
    description: 'Feature media wall with TV mounting space',
  },
  kitchen_modification: {
    label: 'Kitchen Modification',
    emoji: '🍳',
    defaultMaterial: 'quartz_laminate',
    materials: ['quartz_laminate', 'marble', 'granite', 'acrylic', 'wood'],
    description: 'Kitchen cabinet + countertop upgrade',
  },
  bathroom_fitout: {
    label: 'Bathroom Fitout',
    emoji: '🚿',
    defaultMaterial: 'ceramic_tile',
    materials: ['ceramic_tile', 'vitrified_tile', 'marble', 'stone', 'porcelain'],
    description: 'Bathroom wall and floor tile treatment',
  },
  curtain_system: {
    label: 'Curtain System',
    emoji: '🪟',
    defaultMaterial: 'linen_blend',
    materials: ['linen_blend', 'blackout', 'sheer', 'velvet', 'cotton'],
    description: 'Window curtain with track and hardware',
  },
  flooring_upgrade: {
    label: 'Flooring Upgrade',
    emoji: '🏠',
    defaultMaterial: 'engineered_wood',
    materials: ['engineered_wood', 'hardwood', 'marble', 'vitrified', 'carpet', 'herringbone'],
    description: 'Full floor surface replacement',
  },
  moldings_trim: {
    label: 'Moldings & Trim',
    emoji: '🔲',
    defaultMaterial: 'painted_mdf',
    materials: ['painted_mdf', 'plaster', 'wood', 'pu_foam'],
    description: 'Decorative ceiling coving and wall trim',
  },
  architectural_lighting: {
    label: 'Architectural Lighting',
    emoji: '💡',
    defaultMaterial: 'cove_led',
    materials: ['cove_led', 'downlights', 'pendants', 'strip_led', 'mixed'],
    description: 'Embedded lighting design within architectural elements',
  },
}

const ACTIVE_STATUSES = ['staged', 'generated']

type GenerateState = 'idle' | 'generating' | 'done' | 'error'

function toLabel(str: string) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function FitoutPanel({ roomId, roomStatus }: FitoutPanelProps) {
  const [selected, setSelected]   = useState<Set<FitoutCategory>>(new Set())
  const [materials, setMaterials] = useState<Partial<Record<FitoutCategory, string>>>({})
  const [state, setState]         = useState<GenerateState>('idle')
  const [error, setError]         = useState<string | null>(null)

  // Only show after room has been staged
  if (!ACTIVE_STATUSES.includes(roomStatus)) return null

  function toggleCategory(cat: FitoutCategory) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
    // Pre-populate default material if not set
    if (!materials[cat]) {
      setMaterials((prev) => ({
        ...prev,
        [cat]: FITOUT_CONFIG[cat].defaultMaterial,
      }))
    }
  }

  function setMaterial(cat: FitoutCategory, mat: string) {
    setMaterials((prev) => ({ ...prev, [cat]: mat }))
  }

  async function handleGenerate() {
    if (selected.size === 0) return
    setState('generating')
    setError(null)

    // Build the categories payload: {[category]: {material}}
    const categories: Record<string, { material: string }> = {}
    for (const cat of selected) {
      categories[cat] = {
        material: materials[cat] ?? FITOUT_CONFIG[cat].defaultMaterial,
      }
    }

    try {
      const res = await fetch('/api/generate/fitout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, categories }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Fitout generation failed (${res.status})`)
      }
      setState('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed. Please try again.')
      setState('error')
    }
  }

  return (
    <section className="mt-8">
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏗️</span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Interior Fitout</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Select elements to add or upgrade — mm-level dimension constraints applied automatically
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Category selection grid */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">
              Select elements to generate
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.entries(FITOUT_CONFIG) as [FitoutCategory, CategoryConfig][]).map(
                ([cat, config]) => {
                  const isSelected = selected.has(cat)
                  return (
                    <div key={cat}>
                      {/* Category toggle */}
                      <button
                        onClick={() => toggleCategory(cat)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <span className="text-xl shrink-0">{config.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                            {config.label}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{config.description}</p>
                        </div>
                        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border ${
                          isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                      </button>

                      {/* Material selector — only shown when category selected */}
                      {isSelected && (
                        <div className="mt-1.5 ml-3 pl-3 border-l-2 border-blue-200">
                          <p className="text-xs text-gray-500 mb-1.5">Material</p>
                          <div className="flex flex-wrap gap-1.5">
                            {config.materials.map((mat) => (
                              <button
                                key={mat}
                                onClick={() => setMaterial(cat, mat)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                  (materials[cat] ?? config.defaultMaterial) === mat
                                    ? 'border-blue-400 bg-blue-100 text-blue-700'
                                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                }`}
                              >
                                {toLabel(mat)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }
              )}
            </div>
          </div>

          {/* Status feedback */}
          {state === 'error' && error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" strokeLinecap="round" />
              </svg>
              {error}
            </div>
          )}

          {state === 'done' && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Fitout queued — reload the page in a moment to see results
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={selected.size === 0 || state === 'generating'}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {state === 'generating' ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Generating fitout…
              </>
            ) : selected.size === 0 ? (
              'Select elements above'
            ) : (
              `Generate ${selected.size} element${selected.size !== 1 ? 's' : ''}`
            )}
          </button>
        </div>
      </div>
    </section>
  )
}

'use client'

/**
 * ExteriorViewPanel — M12 Geolocation Exterior View controls.
 *
 * Lets users configure the exterior view generation parameters:
 *   • Floor number + height
 *   • Building orientation (compass degrees)
 *   • Time of day (for lighting simulation)
 *   • Weather atmosphere (clear / hazy / overcast)
 *
 * Calls POST /api/generate/exterior with room_id + location config.
 * Only visible when room.status is 'staged' or 'generated' — consistent
 * with the "visible after staging" pattern used by VariantsPanel + DirectEditPanel.
 */

import { useState } from 'react'

interface ExteriorViewPanelProps {
  roomId: string
  roomStatus: string
  projectId: string
}

type TimeOfDay = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night'
type WeatherAtmosphere = 'clear' | 'hazy' | 'cloudy' | 'overcast'
type GenerateState = 'idle' | 'generating' | 'done' | 'error'

const ACTIVE_STATUSES = ['staged', 'generated']

const TIME_OPTIONS: { value: TimeOfDay; label: string; emoji: string }[] = [
  { value: 'morning',   label: 'Morning',   emoji: '🌅' },
  { value: 'midday',    label: 'Midday',    emoji: '☀️' },
  { value: 'afternoon', label: 'Afternoon', emoji: '🌤️' },
  { value: 'evening',   label: 'Evening',   emoji: '🌇' },
  { value: 'night',     label: 'Night',     emoji: '🌃' },
]

const WEATHER_OPTIONS: { value: WeatherAtmosphere; label: string }[] = [
  { value: 'clear',    label: 'Clear sky' },
  { value: 'hazy',     label: 'Hazy / dusty' },
  { value: 'cloudy',   label: 'Partly cloudy' },
  { value: 'overcast', label: 'Overcast' },
]

export function ExteriorViewPanel({
  roomId,
  roomStatus,
  projectId,
}: ExteriorViewPanelProps) {
  const [floorNumber, setFloorNumber]   = useState(1)
  const [orientation, setOrientation]   = useState(0) // degrees, 0 = North
  const [timeOfDay, setTimeOfDay]       = useState<TimeOfDay>('afternoon')
  const [atmosphere, setAtmosphere]     = useState<WeatherAtmosphere>('clear')
  const [state, setState]               = useState<GenerateState>('idle')
  const [error, setError]               = useState<string | null>(null)

  // Only show after room has been staged
  if (!ACTIVE_STATUSES.includes(roomStatus)) return null

  const compassLabel = (() => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    return dirs[Math.round(orientation / 45) % 8]
  })()

  async function handleGenerate() {
    setState('generating')
    setError(null)
    try {
      const res = await fetch('/api/generate/exterior', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id:       roomId,
          project_id:    projectId,
          floor_number:  floorNumber,
          orientation_deg: orientation,
          time_of_day:   timeOfDay,
          atmosphere,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Generation failed (${res.status})`)
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
            <span className="text-lg">🌆</span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Exterior View</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Generate location-accurate window views based on building orientation
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Floor number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Floor Number
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setFloorNumber((f) => Math.max(1, f - 1))}
                className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium text-lg flex items-center justify-center"
              >
                −
              </button>
              <span className="w-12 text-center font-semibold text-gray-900 text-lg">
                {floorNumber}
              </span>
              <button
                onClick={() => setFloorNumber((f) => Math.min(80, f + 1))}
                className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium text-lg flex items-center justify-center"
              >
                +
              </button>
              <span className="text-xs text-gray-400 ml-1">
                ≈ {Math.round(floorNumber * 3)} m above ground
              </span>
            </div>
          </div>

          {/* Building orientation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Building Orientation
              <span className="ml-2 font-normal text-gray-400">
                {orientation}° {compassLabel}
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={359}
              step={5}
              value={orientation}
              onChange={(e) => setOrientation(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1 px-0.5">
              <span>N</span><span>E</span><span>S</span><span>W</span><span>N</span>
            </div>
          </div>

          {/* Time of day */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Time of Day
            </label>
            <div className="grid grid-cols-5 gap-2">
              {TIME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTimeOfDay(opt.value)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                    timeOfDay === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className="text-base leading-none">{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Atmosphere */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Atmosphere
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WEATHER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAtmosphere(opt.value)}
                  className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                    atmosphere === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {state === 'error' && error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" strokeLinecap="round" />
              </svg>
              {error}
            </div>
          )}

          {/* Success */}
          {state === 'done' && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Exterior view queued — reload the page in a moment to see results
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={state === 'generating'}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {state === 'generating' ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Generating exterior view…
              </>
            ) : (
              'Generate Exterior View'
            )}
          </button>
        </div>
      </div>
    </section>
  )
}

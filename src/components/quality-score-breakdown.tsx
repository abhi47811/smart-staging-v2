/**
 * QualityScoreBreakdown — renders per-dimension quality bars.
 *
 * Dimensions: photorealism · composition · lighting · color_harmony · sacred_zone
 *
 * sacred_zone has a hard pass threshold of 0.95 (structural elements must not
 * be altered). All other dimensions use a soft 0.60 pass threshold.
 *
 * This is a server component — it receives pre-fetched JSONB scores from the
 * generation_results.quality_scores column.
 */

interface QualityScores {
  photorealism?: number
  composition?: number
  lighting?: number
  color_harmony?: number
  sacred_zone?: number
  overall_quality?: number
  [key: string]: number | undefined
}

interface QualityScoreBreakdownProps {
  scores: QualityScores
}

interface DimensionConfig {
  key: keyof QualityScores
  label: string
  passThreshold: number
  description: string
  required?: boolean
}

const DIMENSIONS: DimensionConfig[] = [
  {
    key:           'photorealism',
    label:         'Photorealism',
    passThreshold: 0.60,
    description:   'Structural similarity of the rendered output to a real photograph',
  },
  {
    key:           'composition',
    label:         'Composition',
    passThreshold: 0.60,
    description:   'Balance, framing, and spatial arrangement of elements',
  },
  {
    key:           'lighting',
    label:         'Lighting',
    passThreshold: 0.60,
    description:   'Accuracy of light sources, shadows, and ambient illumination',
  },
  {
    key:           'color_harmony',
    label:         'Colour Harmony',
    passThreshold: 0.60,
    description:   'Coherence of the colour palette across all staged elements',
  },
  {
    key:           'sacred_zone',
    label:         'Sacred Zones',
    passThreshold: 0.95,
    required:      true,
    description:   'Doors, windows, and structural columns must remain unaltered',
  },
]

function getBarColor(value: number, threshold: number, required: boolean): string {
  const pct = value * 100
  if (pct < threshold * 100)       return 'bg-red-500'
  if (required && pct < 97)        return 'bg-yellow-500'
  if (pct < 75)                    return 'bg-yellow-400'
  return 'bg-green-500'
}

function getLetterGrade(overall: number): { grade: string; color: string } {
  if (overall >= 0.90) return { grade: 'A', color: 'text-green-700 bg-green-100' }
  if (overall >= 0.80) return { grade: 'B', color: 'text-blue-700 bg-blue-100' }
  if (overall >= 0.70) return { grade: 'C', color: 'text-yellow-700 bg-yellow-100' }
  if (overall >= 0.60) return { grade: 'D', color: 'text-orange-700 bg-orange-100' }
  return { grade: 'F', color: 'text-red-700 bg-red-100' }
}

export function QualityScoreBreakdown({ scores }: QualityScoreBreakdownProps) {
  const overall = scores.overall_quality ?? null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
      {/* Overall score header */}
      {overall !== null && (() => {
        const { grade, color } = getLetterGrade(overall)
        const pct = Math.round(overall * 100)
        return (
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <p className="text-sm text-gray-500">Overall Quality</p>
              <p className="text-3xl font-bold text-gray-900 mt-0.5">{pct}%</p>
            </div>
            <span className={`text-3xl font-bold px-4 py-2 rounded-xl ${color}`}>
              {grade}
            </span>
          </div>
        )
      })()}

      {/* Per-dimension bars */}
      <div className="space-y-4">
        {DIMENSIONS.map((dim) => {
          const raw = scores[dim.key as string]
          if (raw === undefined || raw === null) return null

          const pct = Math.round(raw * 100)
          const passed = raw >= dim.passThreshold
          const barColor = getBarColor(raw, dim.passThreshold, !!dim.required)

          return (
            <div key={dim.key}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{dim.label}</span>
                  {dim.required && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase tracking-wide">
                      Required ≥{Math.round(dim.passThreshold * 100)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{pct}%</span>
                  {passed ? (
                    <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
                {/* Threshold marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-gray-400/50"
                  style={{ left: `${Math.round(dim.passThreshold * 100)}%` }}
                  title={`Pass threshold: ${Math.round(dim.passThreshold * 100)}%`}
                />
              </div>

              {/* Description */}
              <p className="text-xs text-gray-400 mt-1">{dim.description}</p>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 pt-3 border-t border-gray-100">
        <LegendItem color="bg-green-500" label="Excellent" />
        <LegendItem color="bg-yellow-400" label="Acceptable" />
        <LegendItem color="bg-red-500" label="Below threshold" />
        <span className="text-xs text-gray-400">│ marker = pass threshold</span>
      </div>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-3 h-3 rounded-full ${color}`} />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  )
}

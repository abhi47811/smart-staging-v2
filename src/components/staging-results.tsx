/**
 * StagingResults — server component that reads generation.generation_results
 * for the most recent pipeline run on this room, creates signed URLs from
 * the `pipeline` Supabase Storage bucket, and renders a before/after
 * comparison plus a per-stage image strip.
 *
 * Rendered inside the room page server component (no client-side state needed).
 * Signed URLs expire in 10 min; router.refresh() from RoomActions regenerates them.
 */

import { createClient } from '@/lib/supabase/server'

// Display names for each generation stage
const STAGE_LABELS: Record<string, string> = {
  render_to_photo:  'Photorealistic Base',
  fitout:           'Fitout',
  furniture:        'Furniture',
  exterior:         'Exterior View',
  lighting_shadow:  'Lighting & Shadow',
  harmonized:       'Harmonized',
  final:            'Final Result',
}

// Preferred display order for the stage strip
const STAGE_ORDER = [
  'render_to_photo',
  'fitout',
  'furniture',
  'exterior',
  'lighting_shadow',
  'harmonized',
]

interface GenerationResult {
  id: string
  run_id: string
  room_id: string
  result_type: string
  storage_path: string
  width: number
  height: number
  quality_scores: Record<string, number> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

interface StagingResultsProps {
  roomId: string
  /** Storage path of the original upload (in the `uploads` bucket) */
  uploadStoragePath: string | null
}

export async function StagingResults({
  roomId,
  uploadStoragePath,
}: StagingResultsProps) {
  const supabase = await createClient()

  // ── 1. Fetch generation results for this room ──────────────────────────────
  const { data: results } = await supabase
    .schema('generation')
    .from('generation_results')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(40) // covers up to ~6 stages × a few runs

  if (!results || results.length === 0) return null

  // ── 2. Group by run_id, take the most-recent run ───────────────────────────
  const latestRunId = (results as GenerationResult[])[0].run_id
  const runResults = (results as GenerationResult[]).filter(
    (r) => r.run_id === latestRunId
  )

  // ── 3. Separate `final` from intermediate stages ──────────────────────────
  const finalResult = runResults.find((r) => r.result_type === 'final') ?? null

  const stageResults = runResults
    .filter((r) => r.result_type !== 'final')
    .sort(
      (a, b) =>
        STAGE_ORDER.indexOf(a.result_type) - STAGE_ORDER.indexOf(b.result_type)
    )

  // ── 4. Generate signed URLs for all results ───────────────────────────────
  async function signPipelineUrl(path: string): Promise<string | null> {
    const { data } = await supabase.storage
      .from('pipeline')
      .createSignedUrl(path, 600) // 10-minute expiry
    return data?.signedUrl ?? null
  }

  const [
    afterUrl,
    beforeUrl,
    ...stageUrls
  ] = await Promise.all([
    // After: final result image
    finalResult ? signPipelineUrl(finalResult.storage_path) : Promise.resolve(null),
    // Before: original upload
    uploadStoragePath
      ? (async () => {
          const { data } = await supabase.storage
            .from('uploads')
            .createSignedUrl(uploadStoragePath, 600)
          return data?.signedUrl ?? null
        })()
      : Promise.resolve(null),
    // All intermediate stage images
    ...stageResults.map((r) => signPipelineUrl(r.storage_path)),
  ])

  // Pair stages with their URLs
  const stages = stageResults.map((r, i) => ({
    ...r,
    signedUrl: stageUrls[i] ?? null,
  }))

  const hasBeforeAfter = beforeUrl || afterUrl
  const hasStages = stages.some((s) => s.signedUrl)

  if (!hasBeforeAfter && !hasStages) return null

  // ── 5. Quality score helper ───────────────────────────────────────────────
  const overallQuality =
    finalResult?.quality_scores?.overall_quality != null
      ? Math.round(
          (finalResult.quality_scores.overall_quality as number) * 100
        )
      : null

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Generated Results</h2>
        {overallQuality !== null && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
            Quality {overallQuality}%
          </span>
        )}
      </div>

      {/* ── Before / After comparison ─────────────────────────────────── */}
      {hasBeforeAfter && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {/* Before */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              Before
            </p>
            <div className="aspect-video bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
              {beforeUrl ? (
                <img
                  src={beforeUrl}
                  alt="Original room"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                  No source image
                </div>
              )}
            </div>
          </div>

          {/* After */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              After
            </p>
            <div className="aspect-video bg-gray-100 rounded-xl overflow-hidden border border-gray-200 relative">
              {afterUrl ? (
                <img
                  src={afterUrl}
                  alt="Staged room — final result"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                  Final image not available
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Pipeline stage strip ─────────────────────────────────────── */}
      {hasStages && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Pipeline Stages
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {stages
              .filter((s) => s.signedUrl)
              .map((s) => (
                <div key={s.id} className="group">
                  <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200 group-hover:border-blue-300 transition-colors">
                    <img
                      src={s.signedUrl!}
                      alt={STAGE_LABELS[s.result_type] ?? s.result_type}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {STAGE_LABELS[s.result_type] ?? s.result_type}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}
    </section>
  )
}

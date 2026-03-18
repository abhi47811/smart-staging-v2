/**
 * Result Page — /projects/[id]/rooms/[roomId]/result
 *
 * Full-screen presentation of the staged room:
 *   • Interactive before/after slider (BeforeAfterSlider)
 *   • Quality score breakdown (QualityScoreBreakdown)
 *   • Per-stage image strip
 *   • Export dialog trigger (ExportDialog)
 *
 * Server component — all data fetched at request time.
 * Images are signed (10-min expiry) and re-signed on each page load.
 * If no generation results exist, redirects back to the room page.
 */

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { BeforeAfterSlider } from '@/components/before-after-slider'
import { QualityScoreBreakdown } from '@/components/quality-score-breakdown'
import { ExportDialog } from '@/components/export-dialog'

// Display labels for each pipeline stage result type
const STAGE_LABELS: Record<string, string> = {
  render_to_photo: 'Photorealistic Base',
  fitout:          'Fitout',
  furniture:       'Furniture',
  exterior:        'Exterior View',
  lighting_shadow: 'Lighting & Shadow',
  harmonized:      'Harmonized',
  final:           'Final Result',
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

export default async function ResultPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>
}) {
  const { id, roomId } = await params
  const supabase = await createClient()

  // ── 1. Room + project meta ──────────────────────────────────────────────────
  const { data: room } = await supabase
    .schema('core')
    .from('rooms')
    .select('*, uploads(*), projects!inner(name)')
    .eq('id', roomId)
    .eq('project_id', id)
    .is('deleted_at', null)
    .single()

  if (!room) notFound()

  // ── 2. Latest pipeline run ──────────────────────────────────────────────────
  const { data: latestRun } = await supabase
    .schema('generation')
    .from('pipeline_runs')
    .select('id, status, total_cost_usd, gpu_seconds, metadata, created_at, completed_at')
    .eq('room_id', roomId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // If no completed run exists, send back to room page
  if (!latestRun) {
    redirect(`/projects/${id}/rooms/${roomId}`)
  }

  // ── 3. Generation results for the latest run ────────────────────────────────
  const { data: results } = await supabase
    .schema('generation')
    .from('generation_results')
    .select('*')
    .eq('run_id', latestRun.id)
    .order('created_at', { ascending: true })

  const allResults = results ?? []
  const finalResult = allResults.find((r) => r.result_type === 'final') ?? null
  const stageResults = allResults
    .filter((r) => r.result_type !== 'final')
    .sort(
      (a, b) =>
        STAGE_ORDER.indexOf(a.result_type) - STAGE_ORDER.indexOf(b.result_type)
    )

  // ── 4. Original upload ──────────────────────────────────────────────────────
  const uploads = (room.uploads ?? []) as Array<{
    id: string
    original_filename: string
    storage_path: string
    width_px: number
    height_px: number
  }>
  const primaryUpload = uploads[0] ?? null

  // ── 5. Sign all URLs (10-min expiry) ────────────────────────────────────────
  async function signPipeline(path: string): Promise<string | null> {
    const { data } = await supabase.storage
      .from('pipeline')
      .createSignedUrl(path, 600)
    return data?.signedUrl ?? null
  }

  const [beforeUrl, afterUrl, ...stageUrls] = await Promise.all([
    primaryUpload
      ? supabase.storage
          .from('uploads')
          .createSignedUrl(primaryUpload.storage_path, 600)
          .then((r) => r.data?.signedUrl ?? null)
      : Promise.resolve(null),
    finalResult ? signPipeline(finalResult.storage_path) : Promise.resolve(null),
    ...stageResults.map((r) => signPipeline(r.storage_path)),
  ])

  const stages = stageResults.map((r, i) => ({
    ...r,
    signedUrl: stageUrls[i] ?? null,
  }))

  // ── 6. Quality scores from the final result row ─────────────────────────────
  const qualityScores = finalResult?.quality_scores as Record<string, number> | null

  // ── 7. Run cost summary ─────────────────────────────────────────────────────
  const costUsd = latestRun.total_cost_usd
    ? Number(latestRun.total_cost_usd).toFixed(4)
    : null
  const gpuSec = latestRun.gpu_seconds
    ? Math.round(latestRun.gpu_seconds)
    : null

  return (
    <div className="max-w-6xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <Link
            href={`/projects/${id}/rooms/${roomId}`}
            className="text-sm text-blue-600 hover:underline"
          >
            &larr; Back to room
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">
            {room.label}
          </h1>
          <p className="text-sm text-gray-500 capitalize">
            {room.room_type.replace(/_/g, ' ')} &middot;{' '}
            {(room as any).projects?.name}
          </p>
        </div>

        {/* Export trigger — client island, receives the run_id */}
        <ExportDialog runId={latestRun.id} roomId={roomId} roomLabel={room.label} />
      </div>

      {/* ── Before / After slider ──────────────────────────────────────── */}
      {(beforeUrl || afterUrl) && (
        <section className="mb-10">
          <BeforeAfterSlider
            beforeUrl={beforeUrl}
            afterUrl={afterUrl}
            beforeLabel="Original"
            afterLabel="Staged"
          />
        </section>
      )}

      {/* ── Quality breakdown ─────────────────────────────────────────── */}
      {qualityScores && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Quality Scores
          </h2>
          <QualityScoreBreakdown scores={qualityScores} />
        </section>
      )}

      {/* ── Pipeline stage strip ──────────────────────────────────────── */}
      {stages.some((s) => s.signedUrl) && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Pipeline Stages
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {stages
              .filter((s) => s.signedUrl)
              .map((s) => (
                <div key={s.id} className="group">
                  <div className="aspect-video bg-gray-100 rounded-xl overflow-hidden border border-gray-200 group-hover:border-blue-300 transition-colors">
                    <img
                      src={s.signedUrl!}
                      alt={STAGE_LABELS[s.result_type] ?? s.result_type}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 font-medium">
                    {STAGE_LABELS[s.result_type] ?? s.result_type}
                  </p>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* ── Run metadata strip ────────────────────────────────────────── */}
      <section className="border-t border-gray-100 pt-6">
        <div className="flex flex-wrap gap-6 text-xs text-gray-400">
          <span>
            Run ID{' '}
            <span className="font-mono text-gray-500">{latestRun.id.slice(0, 8)}…</span>
          </span>
          {costUsd && (
            <span>
              Cost <span className="text-gray-500">${costUsd} USD</span>
            </span>
          )}
          {gpuSec && (
            <span>
              GPU time <span className="text-gray-500">{gpuSec}s</span>
            </span>
          )}
          {latestRun.completed_at && (
            <span>
              Completed{' '}
              <span className="text-gray-500">
                {new Date(latestRun.completed_at).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </span>
          )}
        </div>
      </section>
    </div>
  )
}

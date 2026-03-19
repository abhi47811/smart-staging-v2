import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RoomActions } from '@/components/room-actions'
import { ImageUploader } from '@/components/image-uploader'
import { StagingResults } from '@/components/staging-results'
import { DesignBriefForm } from '@/components/design-brief-form'
import { AISuggestions } from '@/components/ai-suggestions'
import { VariantsPanel } from '@/components/variants-panel'
import { DirectEditPanel } from '@/components/direct-edit-panel'
import { FitoutPanel } from '@/components/fitout-panel'
import { ExteriorViewPanel } from '@/components/exterior-view-panel'
import { CrossRoomVisibilityPanel } from '@/components/cross-room-visibility-panel'

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>
}) {
  const { id, roomId } = await params
  const supabase = await createClient()

  const { data: room } = await supabase
    .schema('core')
    .from('rooms')
    .select('*, uploads(*), projects!inner(name)')
    .eq('id', roomId)
    .eq('project_id', id)
    .is('deleted_at', null)
    .single()

  if (!room) notFound()

  // Check whether a design brief already exists for this room
  const { data: existingBrief } = await supabase
    .schema('generation')
    .from('design_briefs')
    .select('id, brief_data, auto_generated, version, created_at')
    .eq('room_id', roomId)
    .eq('is_current', true)
    .maybeSingle()

  const hasBrief = Boolean(existingBrief)

  // Fetch analysis results (scene data) for display
  const [
    { data: depthMap },
    { data: segMasks },
    { data: lighting },
    { data: materials },
  ] = await Promise.all([
    supabase.schema('scene').from('depth_maps').select('model_used, confidence_score, created_at').eq('room_id', roomId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.schema('scene').from('segmentation_masks').select('label, is_sacred, confidence_score').eq('room_id', roomId),
    supabase.schema('scene').from('lighting_analyses').select('light_sources, dominant_direction, color_temperature_k, ambient_level').eq('room_id', roomId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.schema('scene').from('material_detections').select('surface_type, detected_material, confidence_score').eq('room_id', roomId),
  ])

  const hasAnalysis = Boolean(depthMap || (segMasks && segMasks.length > 0) || lighting || (materials && materials.length > 0))

  const uploads = (room.uploads ?? []) as Array<{
    id: string
    original_filename: string
    storage_path: string
    file_size_bytes: number
    mime_type: string
    width_px: number
    height_px: number
  }>

  // Generate signed URLs for upload previews
  const uploadsWithUrls = await Promise.all(
    uploads.map(async (upload) => {
      const { data } = await supabase.storage
        .from('uploads')
        .createSignedUrl(upload.storage_path, 3600) // 1 hour
      return { ...upload, signedUrl: data?.signedUrl ?? null }
    })
  )

  return (
    <div>
      <div className="mb-8">
        <Link href={`/projects/${id}`} className="text-sm text-blue-600 hover:underline">
          &larr; Back to {(room as any).projects?.name || 'project'}
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{room.label}</h1>
            <p className="text-sm text-gray-500 capitalize">{room.room_type.replace(/_/g, ' ')}</p>
          </div>
          {/* Link to full-screen result page — only shows once generation is done */}
          {(room.status === 'staged' || room.status === 'generated') && (
            <Link
              href={`/projects/${id}/rooms/${roomId}/result`}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M1 6s4-6 11-6 11 6 11 6-4 6-11 6-11-6-11-6z" />
                <circle cx="12" cy="6" r="2" />
              </svg>
              View Result
            </Link>
          )}
        </div>
      </div>

      {/* Upload section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Source Image</h2>

        {/* Existing uploads list */}
        {uploadsWithUrls.length > 0 && (
          <div className="space-y-3 mb-6">
            {uploadsWithUrls.map((upload) => (
              <div key={upload.id} className="flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-200">
                {upload.signedUrl ? (
                  <img
                    src={upload.signedUrl}
                    alt={upload.original_filename}
                    className="w-20 h-20 object-cover rounded shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400 font-mono shrink-0">
                    {upload.width_px}×{upload.height_px}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{upload.original_filename}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {(upload.file_size_bytes / 1024 / 1024).toFixed(1)} MB &middot; {upload.mime_type}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ImageUploader — 'use client' island with drag-drop, Storage upload, uploads row insert */}
        <ImageUploader projectId={id} roomId={roomId} />
      </section>

      {/* Design Brief — M06 intent capture. Shows after analysis, collapses once brief exists. */}
      <DesignBriefForm
        roomId={roomId}
        roomStatus={room.status}
        hasBrief={hasBrief}
      />

      {/* Analysis Results — visible after Analyze Scene completes */}
      {hasAnalysis && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Scene Analysis</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Depth */}
            {depthMap && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Depth Estimation</h3>
                <p className="text-xs text-gray-500">Model: {depthMap.model_used}</p>
                <p className="text-xs text-gray-500">Confidence: {((depthMap.confidence_score ?? 0) * 100).toFixed(0)}%</p>
              </div>
            )}

            {/* Lighting */}
            {lighting && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Lighting</h3>
                <p className="text-xs text-gray-500">Direction: {lighting.dominant_direction}</p>
                <p className="text-xs text-gray-500">Color temp: {lighting.color_temperature_k}K</p>
                <p className="text-xs text-gray-500">Ambient level: {((lighting.ambient_level ?? 0) * 100).toFixed(0)}%</p>
                <p className="text-xs text-gray-500">Sources: {(lighting.light_sources as unknown[])?.length ?? 0} detected</p>
              </div>
            )}

            {/* Segmentation */}
            {segMasks && segMasks.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Segmentation ({segMasks.length} zones)</h3>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {segMasks.map((m: { label: string; is_sacred: boolean; confidence_score: number }, i: number) => (
                    <span key={i} className={`inline-block px-2 py-0.5 rounded text-xs ${m.is_sacred ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                      {m.label} {m.is_sacred ? '(sacred)' : ''} {((m.confidence_score ?? 0) * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Materials */}
            {materials && materials.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Materials Detected</h3>
                <div className="space-y-1 mt-1">
                  {materials.map((m: { surface_type: string; detected_material: string; confidence_score: number }, i: number) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-600 capitalize">{m.surface_type}</span>
                      <span className="text-gray-900 font-medium">{m.detected_material} ({((m.confidence_score ?? 0) * 100).toFixed(0)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Design Brief Details — visible after brief is generated */}
      {existingBrief?.brief_data && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Design Brief</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            {/* Style */}
            {(existingBrief.brief_data as any)?.style && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Style</h3>
                <p className="text-sm text-gray-600 capitalize">
                  {(existingBrief.brief_data as any).style.primary} &mdash; {(existingBrief.brief_data as any).style.substyle} ({(existingBrief.brief_data as any).style.era})
                </p>
              </div>
            )}

            {/* Color Palette */}
            {(existingBrief.brief_data as any)?.color_palette && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Color Palette</h3>
                <div className="flex gap-3">
                  {['dominant', 'secondary', 'accent'].map((role) => {
                    const c = (existingBrief.brief_data as any).color_palette[role]
                    if (!c) return null
                    return (
                      <div key={role} className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded border border-gray-200" style={{ backgroundColor: c.hex }} />
                        <div>
                          <p className="text-xs text-gray-500 capitalize">{role}</p>
                          <p className="text-xs font-mono text-gray-700">{c.hex} ({c.pct}%)</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Furniture Plan */}
            {(existingBrief.brief_data as any)?.furniture_plan?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Furniture Plan ({(existingBrief.brief_data as any).furniture_plan.length} items)</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(existingBrief.brief_data as any).furniture_plan.map((f: { type: string; sub_type: string; material: string }, i: number) => (
                    <span key={i} className="inline-block px-2 py-0.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700">
                      {f.type} ({f.sub_type}) &mdash; {f.material}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Photography Settings */}
            {(existingBrief.brief_data as any)?.photography && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Photography</h3>
                <p className="text-xs text-gray-500">
                  {(existingBrief.brief_data as any).photography.lens_mm}mm &middot; {(existingBrief.brief_data as any).photography.aperture} &middot; {(existingBrief.brief_data as any).photography.color_grading} &middot; {(existingBrief.brief_data as any).photography.white_balance_k}K
                </p>
              </div>
            )}

            {/* Budget Tier */}
            {(existingBrief.brief_data as any)?.constraints?.budget_tier && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Budget Tier</h3>
                <span className="inline-block px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-xs font-medium capitalize">
                  {(existingBrief.brief_data as any).constraints.budget_tier}
                </span>
              </div>
            )}

            <p className="text-xs text-gray-400">v{existingBrief.version} &middot; {existingBrief.auto_generated ? 'Auto-generated' : 'User-defined'}</p>
          </div>
        </section>
      )}

      {/* Interactive action buttons — 'use client' island, calls /api/analyze and /api/generate */}
      <RoomActions
        roomId={roomId}
        roomStatus={room.status}
        hasUploads={uploads.length > 0}
      />

      {/* Status section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Status</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${
              room.status === 'generated' || room.status === 'staged' ? 'bg-green-500' :
              room.status === 'analyzing' || room.status === 'generating' ? 'bg-yellow-500 animate-pulse' :
              room.status === 'error' ? 'bg-red-500' :
              'bg-gray-300'
            }`} />
            <span className="text-sm font-medium capitalize">{room.status}</span>
          </div>
        </div>
      </section>

      {/* Generated results — only renders when generation.generation_results exist */}
      <StagingResults
        roomId={roomId}
        uploadStoragePath={uploads[0]?.storage_path ?? null}
      />

      {/* AI Suggestions — fires automatically post-generation, surfaces quality.render_suggestions */}
      <AISuggestions roomId={roomId} />

      {/* Direct Edit (M14) — manual surgical element editing, only visible when staged */}
      <DirectEditPanel
        roomId={roomId}
        roomStatus={room.status}
      />

      {/* Variants + Style DNA (M16) — only visible once room is fully staged */}
      <VariantsPanel
        roomId={roomId}
        projectId={id}
        roomStatus={room.status}
      />

      {/* Interior Fitout (M10) — element-level generation controls, visible post-staging */}
      <FitoutPanel
        roomId={roomId}
        roomStatus={room.status}
      />

      {/* Exterior View (M12) — geolocation-aware window view generation, visible post-staging */}
      <ExteriorViewPanel
        roomId={roomId}
        roomStatus={room.status}
        projectId={id}
      />

      {/* Cross-Room Visibility (M15) — linked room sync status, visible when links exist */}
      <CrossRoomVisibilityPanel
        projectId={id}
        currentRoomId={roomId}
      />
    </div>
  )
}

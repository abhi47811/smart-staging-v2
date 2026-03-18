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
    .select('id')
    .eq('room_id', roomId)
    .eq('is_current', true)
    .maybeSingle()

  const hasBrief = Boolean(existingBrief)

  const uploads = (room.uploads ?? []) as Array<{
    id: string
    original_filename: string
    storage_path: string
    file_size_bytes: number
    mime_type: string
    width_px: number
    height_px: number
  }>

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
        {uploads.length > 0 && (
          <div className="space-y-3 mb-6">
            {uploads.map((upload) => (
              <div key={upload.id} className="flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-200">
                <div className="w-20 h-20 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400 font-mono shrink-0">
                  {upload.width_px}×{upload.height_px}
                </div>
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

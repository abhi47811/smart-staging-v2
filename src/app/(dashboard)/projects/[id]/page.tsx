import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AddRoomButton } from '@/components/add-room-modal'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .schema('core')
    .from('projects')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!project) notFound()

  const { data: rooms } = await supabase
    .schema('core')
    .from('rooms')
    .select('*, uploads(*)')
    .eq('project_id', id)
    .is('deleted_at', null)
    .order('sort_order')

  // Generate signed URLs for room thumbnail previews (first upload per room)
  const roomThumbnails: Record<string, string | null> = {}
  if (rooms) {
    await Promise.all(
      rooms.map(async (room) => {
        const firstUpload = room.uploads?.[0]
        if (firstUpload?.storage_path) {
          const { data } = await supabase.storage
            .from('uploads')
            .createSignedUrl(firstUpload.storage_path, 3600)
          roomThumbnails[room.id] = data?.signedUrl ?? null
        }
      })
    )
  }

  return (
    <div>
      <div className="mb-8">
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
          &larr; Back to projects
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{project.name}</h1>
        {project.description && (
          <p className="text-gray-500 mt-1">{project.description}</p>
        )}
      </div>

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Rooms</h2>
        {/* AddRoomButton is a 'use client' island — handles modal + Supabase insert */}
        <AddRoomButton projectId={id} />
      </div>

      {!rooms || rooms.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-500">No rooms yet. Upload room images to begin staging.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <Link
              key={room.id}
              href={`/projects/${id}/rooms/${room.id}`}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
                {roomThumbnails[room.id] ? (
                  <img
                    src={roomThumbnails[room.id]!}
                    alt={room.label}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-gray-400 text-sm">
                    {room.uploads?.length ? `${room.uploads.length} image(s)` : 'No images'}
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-medium text-gray-900">{room.label}</h3>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  <span className="capitalize">{room.room_type.replace('_', ' ')}</span>
                  <span className={`px-2 py-0.5 rounded-full ${
                    room.status === 'generated' ? 'bg-green-100 text-green-700' :
                    room.status === 'analyzing' || room.status === 'generating' ? 'bg-yellow-100 text-yellow-700' :
                    room.status === 'error' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {room.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

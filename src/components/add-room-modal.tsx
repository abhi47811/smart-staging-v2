'use client'

/**
 * AddRoomModal — triggered by the "Add Room" button on the project detail page.
 *
 * Inserts into core.rooms with the project_id passed as a prop.
 * Room type options match the CHECK constraint in migration 1 exactly.
 * After creation, navigates to the new room page.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Must match core.rooms.room_type CHECK constraint
const ROOM_TYPES = [
  { value: 'living_room',    label: 'Living Room' },
  { value: 'bedroom',        label: 'Bedroom' },
  { value: 'master_bedroom', label: 'Master Bedroom' },
  { value: 'kitchen',        label: 'Kitchen' },
  { value: 'bathroom',       label: 'Bathroom' },
  { value: 'dining_room',    label: 'Dining Room' },
  { value: 'study',          label: 'Study / Office' },
  { value: 'hallway',        label: 'Hallway / Entry' },
  { value: 'open_plan',      label: 'Open Plan' },
  { value: 'balcony',        label: 'Balcony / Terrace' },
  { value: 'nursery',        label: 'Nursery' },
  { value: 'guest_room',     label: 'Guest Room' },
  { value: 'other',          label: 'Other' },
] as const

interface AddRoomButtonProps {
  projectId: string
}

export function AddRoomButton({ projectId }: AddRoomButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
      >
        Add Room
      </button>
      {open && <AddRoomModal projectId={projectId} onClose={() => setOpen(false)} />}
    </>
  )
}

function AddRoomModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const router = useRouter()
  const supabase = createClient()

  const [label, setLabel] = useState('')
  const [roomType, setRoomType] = useState<string>('living_room')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data: room, error: insertError } = await supabase
      .schema('core')
      .from('rooms')
      .insert({
        project_id: projectId,
        label: label.trim(),
        room_type: roomType,
        sort_order: Date.now(), // simple monotonic ordering
      })
      .select('id')
      .single()

    setLoading(false)
    if (insertError || !room) return setError(insertError?.message ?? 'Failed to create room')

    router.push(`/projects/${projectId}/rooms/${room.id}`)
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-5">Add Room</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Master Bedroom — East Wing"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Room type <span className="text-red-500">*</span>
            </label>
            <select
              value={roomType}
              onChange={(e) => setRoomType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {ROOM_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !label.trim()}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating…' : 'Add Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

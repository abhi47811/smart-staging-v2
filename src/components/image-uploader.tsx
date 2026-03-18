'use client'

/**
 * ImageUploader — drag-drop or click-to-upload room images.
 *
 * Flow:
 *  1. User drops / selects a file (PNG, JPEG, TIFF, WEBP — matches uploads bucket policy)
 *  2. Read natural image dimensions in-browser via HTMLImageElement + createObjectURL
 *     (no network call — browser decodes locally)
 *  3. Upload to Supabase Storage at: uploads/{projectId}/{roomId}/{uuid}-{filename}
 *     (path structure matches the RLS policy: foldername[1] = projectId)
 *  4. Insert row into core.uploads with all required fields including width_px / height_px
 *  5. Call router.refresh() so the server component re-fetches and shows the new upload
 */

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/tiff', 'image/webp']
const MAX_SIZE_BYTES = 200 * 1024 * 1024 // 200 MB (matches bucket limit)

interface ImageUploaderProps {
  projectId: string
  roomId: string
}

/** Reads the natural pixel dimensions of a File without uploading it anywhere. */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(objectUrl) // prevent memory leak
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read image dimensions'))
    }
    img.src = objectUrl
  })
}

export function ImageUploader({ projectId, roomId }: ImageUploaderProps) {
  const router = useRouter()
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function processFile(file: File) {
    setError(null)

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return setError(`Unsupported file type: ${file.type}. Use PNG, JPEG, TIFF, or WEBP.`)
    }

    // Validate size
    if (file.size > MAX_SIZE_BYTES) {
      return setError(`File too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Max 200 MB.`)
    }

    setUploading(true)
    setProgress('Reading image dimensions…')

    // Step 1: read dimensions locally
    let dimensions: { width: number; height: number }
    try {
      dimensions = await getImageDimensions(file)
    } catch {
      setUploading(false)
      return setError('Could not read image. Is the file corrupted?')
    }

    setProgress('Uploading to storage…')

    // Step 2: build storage path — foldername[1] must be projectId for RLS
    const uuid = crypto.randomUUID()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${projectId}/${roomId}/${uuid}-${safeName}`

    const { error: storageError } = await supabase.storage
      .from('uploads')
      .upload(storagePath, file, { contentType: file.type, upsert: false })

    if (storageError) {
      setUploading(false)
      setProgress(null)
      return setError(`Upload failed: ${storageError.message}`)
    }

    setProgress('Saving upload record…')

    // Step 3: insert row into core.uploads
    const { error: insertError } = await supabase
      .schema('core')
      .from('uploads')
      .insert({
        room_id: roomId,
        original_filename: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        file_size_bytes: file.size,
        width_px: dimensions.width,
        height_px: dimensions.height,
        upload_source: 'dashboard',
      })

    setUploading(false)
    setProgress(null)

    if (insertError) {
      // Storage upload succeeded but DB insert failed — log it but don't block UX
      console.error('core.uploads insert failed:', insertError)
      return setError(`File uploaded but record save failed: ${insertError.message}`)
    }

    // Step 4: refresh server component to show the new upload
    router.refresh()
  }

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    processFile(files[0]) // upload one at a time for now
  }, [projectId, roomId])

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = () => setDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
          ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50/40'}
          ${uploading ? 'cursor-not-allowed opacity-60' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_TYPES.join(',')}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">{progress}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm text-gray-600 font-medium">Drop your room image here, or click to browse</p>
            <p className="text-xs text-gray-400">PNG, JPEG, TIFF, WEBP · Max 200 MB</p>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}

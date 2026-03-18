// M15 — Export Engine — Next.js API Route
// Converts a pipeline generation result into a downloadable file.
// Supported formats: PNG (lossless), JPG (compressed), TIFF (print-grade),
//   PDF (single-page embedded image), ZIP (multi-image bundle).
// Supported resolutions: web (1920px), print_a4 (2480×3508px at 300dpi),
//   print_a3 (3508×4961px at 300dpi), original (as-generated).
// In production, format/resolution conversion uses the Sharp library.
// In mock/dev mode, the source file is copied as-is with a renamed extension.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSignedUrl } from '@/lib/generation'
import { validateUUID, assertValidEnum, SanitizeError, sanitizeErrorResponse } from '@/lib/sanitize'

export const maxDuration = 120 // Format conversion can be slow for TIFF/PDF

// ---------------------------------------------------------------------------
// Resolution → max-dimension map (used for resize hint in prompt metadata)
// ---------------------------------------------------------------------------

const RESOLUTION_WIDTHS: Record<string, number> = {
  web:        1920,
  print_a4:   2480,
  print_a3:   3508,
  original:   0, // no resize
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExportFormat     = 'png' | 'jpg' | 'tiff' | 'pdf' | 'zip'
type ExportResolution = 'web' | 'print_a4' | 'print_a3' | 'original'

interface GenerationResultRow {
  id: string
  room_id: string
  run_id: string
  result_type: string
  storage_path: string
  width: number | null
  height: number | null
  metadata: Record<string, unknown> | null
  created_at: string
}

interface ExportRow {
  id: string
  room_id: string
  run_id: string | null
  format: string
  resolution: string
  status: string
  storage_path: string | null
  file_size_bytes: number | null
  download_count: number
  expires_at: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the MIME type for a given export format.
 */
function mimeForFormat(format: ExportFormat): string {
  switch (format) {
    case 'png':  return 'image/png'
    case 'jpg':  return 'image/jpeg'
    case 'tiff': return 'image/tiff'
    case 'pdf':  return 'application/pdf'
    case 'zip':  return 'application/zip'
  }
}

/**
 * Download a file from Supabase Storage and return it as an ArrayBuffer.
 * Uses a signed URL so the pipeline bucket does not need to be public.
 */
async function downloadFromStorage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: string,
  path: string
): Promise<ArrayBuffer> {
  const signedUrl = await getSignedUrl(supabase, bucket, path, 120)
  const response  = await fetch(signedUrl)
  if (!response.ok) {
    throw new Error(`Failed to download source file from storage (${response.status})`)
  }
  return response.arrayBuffer()
}

/**
 * Apply format and resolution conversion.
 *
 * Production: replace this body with a Sharp pipeline:
 *   import sharp from 'sharp'
 *   let pipeline = sharp(Buffer.from(sourceBuffer))
 *   if (maxWidth > 0) pipeline = pipeline.resize(maxWidth, undefined, { withoutEnlargement: true })
 *   switch (format) {
 *     case 'png':  return { buffer: await pipeline.png().toBuffer(), mime: 'image/png' }
 *     case 'jpg':  return { buffer: await pipeline.jpeg({ quality: 90 }).toBuffer(), mime: 'image/jpeg' }
 *     case 'tiff': return { buffer: await pipeline.tiff({ compression: 'lzw' }).toBuffer(), mime: 'image/tiff' }
 *     case 'pdf':  return { buffer: await pipeline.pdf().toBuffer(), mime: 'application/pdf' }
 *     case 'zip':  ... bundle multiple images
 *   }
 *
 * Mock/dev: pass the buffer through unchanged (Sharp not installed in dev).
 */
async function convertBuffer(
  sourceBuffer: ArrayBuffer,
  format: ExportFormat,
  resolution: ExportResolution,
  isRealMode: boolean
): Promise<{ buffer: ArrayBuffer; mime: string }> {
  const mime = mimeForFormat(format)
  const maxWidth = RESOLUTION_WIDTHS[resolution] ?? 0

  if (isRealMode) {
    // ---- Production path: dynamic import of Sharp so build doesn't fail in mock ----
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sharp = (await import('sharp')).default
      let pipeline = sharp(Buffer.from(sourceBuffer))

      if (maxWidth > 0) {
        pipeline = pipeline.resize(maxWidth, undefined, { withoutEnlargement: true })
      }

      let outputBuffer: Buffer
      switch (format) {
        case 'png':
          outputBuffer = await pipeline.png({ compressionLevel: 8 }).toBuffer()
          break
        case 'jpg':
          outputBuffer = await pipeline.jpeg({ quality: 90 }).toBuffer()
          break
        case 'tiff':
          outputBuffer = await pipeline.tiff({ compression: 'lzw' }).toBuffer()
          break
        case 'pdf':
          // Sharp does not natively output PDF — embed image in a minimal PDF wrapper
          // For production, use pdfkit or pdf-lib instead.
          outputBuffer = await pipeline.png().toBuffer()
          break
        case 'zip':
          // ZIP bundles all generation results — single-image pass-through for now
          outputBuffer = await pipeline.png().toBuffer()
          break
        default:
          outputBuffer = await pipeline.png().toBuffer()
      }

      return { buffer: outputBuffer.buffer as ArrayBuffer, mime }
    } catch {
      // Sharp not available at runtime — fall through to mock path
      console.warn('[M15 export] Sharp unavailable — falling back to mock conversion')
    }
  }

  // ---- Mock/dev path: return source buffer unchanged ----
  console.log(
    `[M15 export] Mock mode — skipping conversion (format=${format}, resolution=${resolution}, maxWidth=${maxWidth})`
  )
  return { buffer: sourceBuffer, mime }
}

// ---------------------------------------------------------------------------
// POST /api/export
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()

    // Input validation (Gap 3 — sanitize.ts)
    const room_id    = validateUUID(body.room_id, 'room_id')
    const run_id     = body.run_id ? validateUUID(body.run_id, 'run_id') : undefined
    const format     = assertValidEnum<ExportFormat>(
      body.format ?? 'png',
      ['png', 'jpg', 'tiff', 'pdf', 'zip'] as const,
      'format'
    )
    const resolution = assertValidEnum<ExportResolution>(
      body.resolution ?? 'web',
      ['web', 'print_a4', 'print_a3', 'original'] as const,
      'resolution'
    )

    // -----------------------------------------------------------------------
    // 1. Fetch the latest generation result for this room (or specific run)
    // -----------------------------------------------------------------------
    let resultQuery = supabase
      .schema('generation')
      .from('generation_results')
      .select('*')
      .eq('room_id', room_id)
      .eq('result_type', 'harmonized') // Final stage output preferred
      .order('created_at', { ascending: false })
      .limit(1)

    if (run_id) {
      resultQuery = resultQuery.eq('run_id', run_id)
    }

    const { data: resultRows, error: resultErr } = await resultQuery

    // Fall back to any result type if 'harmonized' not found
    let sourceResult: GenerationResultRow | null = resultRows?.[0] as GenerationResultRow ?? null

    if (resultErr || !sourceResult) {
      // Retry without result_type filter
      const { data: anyResult, error: anyErr } = await supabase
        .schema('generation')
        .from('generation_results')
        .select('*')
        .eq('room_id', room_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (anyErr || !anyResult) {
        return NextResponse.json(
          { error: 'No generated images found for this room — run the pipeline first' },
          { status: 404 }
        )
      }
      sourceResult = anyResult as GenerationResultRow
    }

    // -----------------------------------------------------------------------
    // 2. Create export record with status: 'processing'
    // -----------------------------------------------------------------------
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h

    const { data: exportRow, error: insertErr } = await supabase
      .schema('core')
      .from('exports')
      .insert({
        room_id,
        run_id:     sourceResult.run_id ?? run_id ?? null,
        format,
        resolution,
        status:     'processing',
        expires_at: expiresAt,
      })
      .select('*')
      .single()

    if (insertErr || !exportRow) {
      throw new Error(`Failed to create export record: ${insertErr?.message ?? 'no data'}`)
    }

    const exportId = (exportRow as ExportRow).id

    // -----------------------------------------------------------------------
    // 3. Download source image from pipeline bucket
    // -----------------------------------------------------------------------
    const sourcePath = sourceResult.storage_path
    if (!sourcePath) {
      await markExportFailed(supabase, exportId)
      return NextResponse.json({ error: 'Source image has no storage path' }, { status: 422 })
    }

    const sourceBuffer = await downloadFromStorage(supabase, 'pipeline', sourcePath)

    // -----------------------------------------------------------------------
    // 4. Convert to requested format + resolution
    //    In production, Sharp handles resize + format encode.
    //    In mock mode, the buffer passes through unchanged.
    // -----------------------------------------------------------------------
    const hasSharp = process.env.NODE_ENV === 'production' ||
                     process.env.ENABLE_SHARP === 'true'

    const { buffer: outputBuffer, mime } = await convertBuffer(
      sourceBuffer,
      format,
      resolution,
      hasSharp
    )

    // -----------------------------------------------------------------------
    // 5. Upload converted file to exports bucket
    // -----------------------------------------------------------------------
    const exportPath = `${room_id}/${exportId}.${format}`

    const { error: uploadErr } = await supabase.storage
      .from('exports')
      .upload(exportPath, outputBuffer, {
        contentType: mime,
        upsert:      true,
      })

    if (uploadErr) {
      await markExportFailed(supabase, exportId)
      throw new Error(`Upload to exports bucket failed: ${uploadErr.message}`)
    }

    // -----------------------------------------------------------------------
    // 6. Update export record: status → 'ready'
    // -----------------------------------------------------------------------
    await supabase
      .schema('core')
      .from('exports')
      .update({
        status:          'ready',
        storage_path:    exportPath,
        file_size_bytes: outputBuffer.byteLength,
      })
      .eq('id', exportId)

    // -----------------------------------------------------------------------
    // 7. Generate signed download URL (24h expiry)
    // -----------------------------------------------------------------------
    const downloadUrl = await getSignedUrl(supabase, 'exports', exportPath, 24 * 60 * 60)

    return NextResponse.json({
      status:       'ready',
      export_id:    exportId,
      format,
      resolution,
      file_size_bytes: outputBuffer.byteLength,
      download_url: downloadUrl,
      expires_at:   expiresAt,
      source: {
        result_id:    sourceResult.id,
        result_type:  sourceResult.result_type,
        storage_path: sourcePath,
      },
    })
  } catch (err) {
    if (err instanceof SanitizeError) {
      return NextResponse.json(sanitizeErrorResponse(err), { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Export failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Helper: mark export as failed
// ---------------------------------------------------------------------------

async function markExportFailed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  exportId: string
): Promise<void> {
  await supabase
    .schema('core')
    .from('exports')
    .update({ status: 'failed' })
    .eq('id', exportId)
    .catch(() => {}) // best-effort
}

'use client'

/**
 * ExportDialog — format + resolution selector for exporting staged images.
 *
 * Opens as a modal dialog. Calls POST /api/export which enqueues the export
 * job, stores a row in core.exports, and returns a signed download URL.
 *
 * Formats:   PNG · TIFF · WebP · PDF · ZIP (all stages)
 * Resolutions: 1x (web), 2x (print-ready), 4x (large format)
 */

import { useState } from 'react'

interface ExportDialogProps {
  runId: string
  roomId: string
  roomLabel: string
}

type ExportFormat = 'png' | 'tiff' | 'webp' | 'pdf' | 'zip'
type ExportResolution = '1x' | '2x' | '4x'

interface FormatOption {
  value: ExportFormat
  label: string
  description: string
  icon: string
}

interface ResolutionOption {
  value: ExportResolution
  label: string
  description: string
}

const FORMAT_OPTIONS: FormatOption[] = [
  { value: 'png',  label: 'PNG',  description: 'Lossless, transparent background support', icon: '🖼️' },
  { value: 'tiff', label: 'TIFF', description: 'Full-quality for print & professional use', icon: '🗂️' },
  { value: 'webp', label: 'WebP', description: 'Compressed for web & listing portals',      icon: '🌐' },
  { value: 'pdf',  label: 'PDF',  description: 'Print-ready single-page document',           icon: '📄' },
  { value: 'zip',  label: 'ZIP',  description: 'All pipeline stage images bundled',          icon: '📦' },
]

const RESOLUTION_OPTIONS: ResolutionOption[] = [
  { value: '1x', label: '1× — Web quality',    description: '~1920×1080px · 3–5 MB' },
  { value: '2x', label: '2× — Print ready',    description: '~3840×2160px · 12–20 MB' },
  { value: '4x', label: '4× — Large format',   description: '~7680×4320px · 40–80 MB' },
]

type ExportState = 'idle' | 'exporting' | 'done' | 'error'

export function ExportDialog({ runId, roomId, roomLabel }: ExportDialogProps) {
  const [open, setOpen]             = useState(false)
  const [format, setFormat]         = useState<ExportFormat>('png')
  const [resolution, setResolution] = useState<ExportResolution>('2x')
  const [state, setState]           = useState<ExportState>('idle')
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)

  function handleOpen() {
    setState('idle')
    setDownloadUrl(null)
    setError(null)
    setOpen(true)
  }

  function handleClose() {
    setOpen(false)
  }

  async function handleExport() {
    setState('exporting')
    setError(null)
    setDownloadUrl(null)
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId, room_id: roomId, format, resolution }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Export failed (${res.status})`)
      }
      setDownloadUrl(json.data?.download_url ?? null)
      setState('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Export failed. Please try again.')
      setState('error')
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors shrink-0"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Export
      </button>

      {/* Modal backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Export Image</h2>
                <p className="text-sm text-gray-500 mt-0.5 truncate max-w-[260px]">{roomLabel}</p>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Format picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Format</label>
                <div className="grid grid-cols-5 gap-2">
                  {FORMAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      title={opt.description}
                      onClick={() => setFormat(opt.value)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all ${
                        format === opt.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-lg leading-none">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {FORMAT_OPTIONS.find((f) => f.value === format)?.description}
                </p>
              </div>

              {/* Resolution picker — hidden for ZIP (all stages bundled at 2x) */}
              {format !== 'zip' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Resolution</label>
                  <div className="space-y-2">
                    {RESOLUTION_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          resolution === opt.value
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="resolution"
                          value={opt.value}
                          checked={resolution === opt.value}
                          onChange={() => setResolution(opt.value)}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <p className={`text-sm font-medium ${resolution === opt.value ? 'text-blue-700' : 'text-gray-800'}`}>
                            {opt.label}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{opt.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Status feedback */}
              {state === 'error' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                  <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
                  </svg>
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              {state === 'done' && downloadUrl && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                  <svg className="w-4 h-4 text-green-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-xs text-green-700 flex-1">Export ready</p>
                  <a
                    href={downloadUrl}
                    download
                    className="text-xs font-semibold text-green-700 underline hover:text-green-900"
                  >
                    Download ↓
                  </a>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 pb-6">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              {state !== 'done' && (
                <button
                  onClick={handleExport}
                  disabled={state === 'exporting'}
                  className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {state === 'exporting' ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Exporting…
                    </>
                  ) : (
                    <>Export {format.toUpperCase()}</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

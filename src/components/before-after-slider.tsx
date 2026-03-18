'use client'

/**
 * BeforeAfterSlider — interactive before/after image comparison.
 *
 * Dragging the divider reveals the "before" (original) image on the left
 * and the "after" (staged) image on the right.
 *
 * Technique: the "after" image is clipped with a CSS clip-path as the divider
 * moves. The "before" image sits full-width beneath it.
 *
 * Pointer capture: setPointerCapture() is called on pointerdown so that
 * pointermove keeps firing even when the cursor drifts outside the element.
 * Without it, fast drags cause the slider to freeze mid-interaction.
 */

import { useRef, useState, useCallback } from 'react'

interface BeforeAfterSliderProps {
  beforeUrl: string | null
  afterUrl: string | null
  beforeLabel?: string
  afterLabel?: string
}

export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = 'Before',
  afterLabel = 'After',
}: BeforeAfterSliderProps) {
  // dividerPct is the percentage from the LEFT where the divider sits (0–100)
  const [dividerPct, setDividerPct] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Pointer event handlers ────────────────────────────────────────────────
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only move when a button is held (prevents hover drift)
    if (e.buttons === 0) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    setDividerPct((x / rect.width) * 100)
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Capture all future pointer events to this element — the critical line
    // that keeps pointermove firing even when the cursor leaves the container.
    e.currentTarget.setPointerCapture(e.pointerId)
    handlePointerMove(e)
  }, [handlePointerMove])

  // Allow keyboard accessibility: arrow keys nudge the divider
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') setDividerPct((p) => Math.max(0, p - 2))
    if (e.key === 'ArrowRight') setDividerPct((p) => Math.min(100, p + 2))
  }, [])

  // ── Touch pass-through ────────────────────────────────────────────────────
  // PointerEvents handle touch natively in modern browsers; no extra handler needed.

  return (
    <div className="w-full">
      {/* Labels row */}
      <div className="flex justify-between mb-2 px-1">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          {beforeLabel}
        </span>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          {afterLabel}
        </span>
      </div>

      {/* Slider container */}
      <div
        ref={containerRef}
        role="slider"
        aria-label="Before/after comparison. Use arrow keys to adjust."
        aria-valuenow={Math.round(dividerPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        className="relative w-full aspect-video rounded-2xl overflow-hidden border border-gray-200 cursor-ew-resize select-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onKeyDown={handleKeyDown}
      >
        {/* ── Before image (full width, bottom layer) ── */}
        {beforeUrl ? (
          <img
            src={beforeUrl}
            alt="Original room before staging"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
            <span className="text-xs text-gray-400">No source image</span>
          </div>
        )}

        {/* ── After image clipped to right of divider (top layer) ── */}
        {afterUrl && (
          <div
            className="absolute inset-0 overflow-hidden pointer-events-none"
            style={{ clipPath: `inset(0 0 0 ${dividerPct}%)` }}
          >
            <img
              src={afterUrl}
              alt="Staged room"
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />
          </div>
        )}

        {/* ── Divider line + handle ── */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,0.4)] pointer-events-none"
          style={{ left: `${dividerPct}%` }}
        >
          {/* Circular handle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center gap-0.5">
            {/* Left chevron */}
            <svg
              className="w-3 h-3 text-gray-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {/* Right chevron */}
            <svg
              className="w-3 h-3 text-gray-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* ── Inline before/after labels over the image ── */}
        <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-white text-xs font-medium pointer-events-none">
          {beforeLabel}
        </div>
        <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-white text-xs font-medium pointer-events-none">
          {afterLabel}
        </div>
      </div>

      {/* Hint text */}
      <p className="text-center text-xs text-gray-400 mt-2">
        Drag the divider to compare · Arrow keys supported
      </p>
    </div>
  )
}
